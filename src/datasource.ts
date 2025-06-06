import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';

import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MetricFindValue,
  MutableDataFrame,
} from '@grafana/data';

import { SplunkQuery, SplunkDataSourceOptions, defaultQueryRequestResults, QueryRequestResults, BaseSearchResult } from './types';

export class DataSource extends DataSourceApi<SplunkQuery, SplunkDataSourceOptions> {
  url?: string;
  private baseSearchCache: Map<string, BaseSearchResult> = new Map();
  private baseSearchInflight: Map<string, Promise<BaseSearchResult>> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor(instanceSettings: DataSourceInstanceSettings<SplunkDataSourceOptions>) {
    super(instanceSettings);

    this.url = instanceSettings.url;
  }
  async metricFindQuery(query: SplunkQuery, options: DataQueryRequest<SplunkQuery>): Promise<MetricFindValue[]> {
    const promises: MetricFindValue[] = await this.doRequest(query, options).then((response: QueryRequestResults) => {
      const frame: MetricFindValue[] = [];
      response.results.forEach((result: any) => {
        response.fields.forEach((field: string) => {
          const f: MetricFindValue = { text: result[field] };
          frame.push(f);
        });
      });
      return frame;
    });
    return Promise.all(promises);
  }

  async query(options: DataQueryRequest<SplunkQuery>): Promise<DataQueryResponse> {
    // First, process all base searches
    const baseSearches = options.targets.filter(query => query.searchType === 'base' || !query.searchType);
    const chainSearches = options.targets.filter(query => query.searchType === 'chain');
    
    // Execute base searches first and wait for them to complete, tracking in-flight promises
    const baseResults: any[] = [];
    for (const query of baseSearches) {
      // Kick off base search and cache result when done
      const inflight = (async (): Promise<BaseSearchResult> => {
        const result = await this.doRequest(query, options);
        const baseResult: BaseSearchResult = {
          sid: result.sid || '',
          searchId: query.searchId || query.refId,
          refId: query.refId,
          fields: result.fields,
          results: result.results,
          timestamp: Date.now(),
        };
        // Cache under both refId and searchId if present
        this.baseSearchCache.set(query.refId, baseResult);
        if (query.searchId) {
          this.baseSearchCache.set(query.searchId, baseResult);
        }
        return baseResult;
      })();
      // Register in-flight under both keys
      this.baseSearchInflight.set(query.refId, inflight);
      if (query.searchId) {
        this.baseSearchInflight.set(query.searchId, inflight);
      }
      // Wait for completion and clean up
      const completed = await inflight;
      this.baseSearchInflight.delete(query.refId);
      if (query.searchId) {
        this.baseSearchInflight.delete(query.searchId);
      }
      // Build frame from completed result
      const dataFrame = this.createDataFrame(query, { fields: completed.fields, results: completed.results, sid: completed.sid });
      baseResults.push(dataFrame);
    }
    
    console.log('Cache after base searches:', Array.from(this.baseSearchCache.keys()));
    
    // Now execute chain searches
    const chainResults: any[] = [];
    for (const query of chainSearches) {
      if (query.baseSearchRefId) {
        // Find or await the base search result
        let baseSearch = this.findBaseSearchResult(query.baseSearchRefId, options.targets);
        if (!baseSearch && this.baseSearchInflight.has(query.baseSearchRefId)) {
          // Wait for in-flight base search to complete
          baseSearch = await this.baseSearchInflight.get(query.baseSearchRefId)!;
        }
        if (baseSearch) {
          const chainResult = await this.doChainRequest(query, options, baseSearch);
          chainResults.push(this.createDataFrame(query, chainResult));
        } else {
          const result = await this.doRequest(query, options);
          chainResults.push(this.createDataFrame(query, result));
        }
      } else {
        // No base search reference, execute as regular search
        const result = await this.doRequest(query, options);
        chainResults.push(this.createDataFrame(query, result));
      }
    }
    
    const allResults = [...baseResults, ...chainResults];
    return { data: allResults };
  }
  
  private createDataFrame(query: SplunkQuery, response: QueryRequestResults) {
    const moment = require('moment');
    const frame = new MutableDataFrame({
      refId: query.refId,
      fields: [],
    });

    response.fields.forEach((field: any) => {
      frame.addField({ name: field });
    });

    response.results.forEach((result: any) => {
      let row: any[] = [];

      response.fields.forEach((field: any) => {
        if (field === 'Time') {
          let time = moment(result['_time']).format('YYYY-MM-DDTHH:mm:ssZ');
          row.push(time);
        } else {
          row.push(result[field]);
        }
      });
      frame.appendRow(row);
    });

    return frame;
  }
  
  private findBaseSearchResult(baseSearchRefId: string, targets: SplunkQuery[]): BaseSearchResult | null {
    // First check if baseSearchRefId is a searchId (like "base-1")
    const cachedBySearchId = this.baseSearchCache.get(baseSearchRefId);
    if (cachedBySearchId && this.isCacheValid(cachedBySearchId)) {
      return cachedBySearchId;
    }
    
    // Then check if it's a RefId (like "A")
    for (const [, cached] of this.baseSearchCache.entries()) {
      if (cached.refId === baseSearchRefId && this.isCacheValid(cached)) {
        return cached;
      }
    }
    
    // If not in cache, find by RefId or searchId in current targets
    const baseQuery = targets.find(q => 
      (q.refId === baseSearchRefId || q.searchId === baseSearchRefId) && 
      (q.searchType === 'base' || !q.searchType)
    );
    
    if (baseQuery && baseQuery.searchId) {
      return this.baseSearchCache.get(baseQuery.searchId) || null;
    }
    
    return null;
  }
  
  private isCacheValid(cached: BaseSearchResult): boolean {
    return (Date.now() - cached.timestamp) < this.CACHE_TTL;
  }

  async testDatasource() {
    const data = new URLSearchParams({
      search: `search index=_internal * | stats count`,
      output_mode: 'json',
      exec_mode: 'oneshot',
    }).toString();

    return getBackendSrv()
      .datasourceRequest({
        method: 'POST',
        url: this.url + '/services/search/jobs',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: data,
      })
      .then(
        (response: any) => {
          return {
            status: 'success',
            message: 'Data source is working',
            title: 'Success',
          };
        },
        (err: any) => {
          return {
            status: 'error',
            message: err.statusText,
            title: 'Error',
          };
        }
      );
  }

  async doSearchStatusRequest(sid: string) {
    const result: boolean = await getBackendSrv()
      .datasourceRequest({
        method: 'GET',
        url: this.url + '/services/search/jobs/' + sid,
        params: {
          output_mode: 'json',
        },
      })
      .then((response) => {
        let status = (response.data as any).entry[0].content.dispatchState;
        return status === 'DONE' || status === 'PAUSED' || status === 'FAILED';
      });

    return result;
  }

  async doSearchRequest(query: SplunkQuery, options: DataQueryRequest<SplunkQuery>): Promise<{sid: string} | null> {
    if ((query.queryText || '').trim().length < 4) {
      return null;
    }
    const { range } = options;
    const from = Math.floor(range!.from.valueOf() / 1000);
    const to = Math.floor(range!.to.valueOf() / 1000);

    const prefix = (query.queryText || ' ')[0].trim() === '|' ? '' : 'search';
    const queryWithVars = getTemplateSrv().replace(`${prefix} ${query.queryText}`.trim(), options.scopedVars);

    const data = new URLSearchParams({
      search: queryWithVars,
      output_mode: 'json',
      earliest_time: from.toString(),
      latest_time: to.toString(),
    }).toString();

    const sid: string = await getBackendSrv()
      .datasourceRequest({
        method: 'POST',
        url: this.url + '/services/search/jobs',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: data,
      })
      .then((response) => {
        return (response.data as any).sid;
      });

    return { sid };
  }

  async doGetAllResultsRequest(sid: string) {
    const count = 50000;
    let offset = 0;
    let isFirst = true;
    let isFinished = false;
    let fields: any[] = [];
    let results: any[] = [];

    while (!isFinished) {
      await getBackendSrv()
        .datasourceRequest({
          method: 'GET',
          url: this.url + '/services/search/jobs/' + sid + '/results',
          params: {
            output_mode: 'json',
            offset: offset,
            count: count,
          },
        })
        .then((response) => {
          if ((response.data as any).post_process_count === 0 && (response.data as any).results.length === 0) {
            isFinished = true;
          } else {
            if (isFirst) {
              isFirst = false;
              fields = (response.data as any).fields.map((field: any) => field['name']);
            }
            offset = offset + count;
            results = results.concat((response.data as any).results);
          }
        });

      offset = offset + count;
    }

    if (fields.includes('_time')) {
      fields.push('Time');
    }

    const index = fields.indexOf('_raw', 0);
    if (index > -1) {
      fields.splice(index, 1);
      fields = fields.reverse();
      fields.push('_raw');
      fields = fields.reverse();
    }

    return { fields: fields, results: results };
  }

  async doRequest(query: SplunkQuery, options: DataQueryRequest<SplunkQuery>): Promise<QueryRequestResults & { sid?: string }> {
    const searchResult = await this.doSearchRequest(query, options);
    const sid: string = searchResult?.sid || '';
    
    
    if (sid.length > 0) {
      while (!(await this.doSearchStatusRequest(sid))) {}
      const result = await this.doGetAllResultsRequest(sid);
      
      // Return the result with SID so the calling code can store it
      return { ...result, sid };
    }
    return defaultQueryRequestResults;
  }

  async doChainRequest(query: SplunkQuery, options: DataQueryRequest<SplunkQuery>, baseSearch: BaseSearchResult): Promise<QueryRequestResults> {
    
    if ((query.queryText || '').trim().length < 1) {
      console.warn('Chain query text is empty');
      return defaultQueryRequestResults;
    }
    
    const { range } = options;
    const from = Math.floor(range!.from.valueOf() / 1000);
    const to = Math.floor(range!.to.valueOf() / 1000);

    let chainQuery = query.queryText.trim();
    
    // Build the chain query using loadjob
    if (baseSearch.sid) {
      // If the chain query starts with |, use it as-is after loadjob
      // If not, add the | prefix
      if (chainQuery.startsWith('|')) {
        chainQuery = `| loadjob ${baseSearch.sid} ${chainQuery}`;
      } else {
        chainQuery = `| loadjob ${baseSearch.sid} | ${chainQuery}`;
      }
    } else {
      return this.executeChainOnCachedResults(query, baseSearch);
    }

    const queryWithVars = getTemplateSrv().replace(chainQuery, options.scopedVars);

    const data = new URLSearchParams({
      search: queryWithVars,
      output_mode: 'json',
      earliest_time: from.toString(),
      latest_time: to.toString(),
    }).toString();

    try {
      const sid: string = await getBackendSrv()
        .datasourceRequest({
          method: 'POST',
          url: this.url + '/services/search/jobs',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          data: data,
        })
        .then((response) => {
          return (response.data as any).sid;
        });

      if (sid.length > 0) {
        while (!(await this.doSearchStatusRequest(sid))) {}
        const result = await this.doGetAllResultsRequest(sid);
        return result;
      }
    } catch (error) {
      return this.executeChainOnCachedResults(query, baseSearch);
    }
    
    return defaultQueryRequestResults;
  }
  
  private async executeChainOnCachedResults(query: SplunkQuery, baseSearch: BaseSearchResult): Promise<QueryRequestResults> {
    // This is a simplified implementation that works with cached results
    // In a full implementation, you might want to use Splunk's SDK or execute
    // the transformations locally
    
    // For now, we'll return the base search results and let Grafana handle transformations
    // This could be enhanced to parse and execute simple Splunk commands locally
    console.warn('Chain search executed on cached results. Consider implementing |loadjob for better performance.');
    
    return {
      fields: baseSearch.fields,
      results: baseSearch.results
    };
  }
}
