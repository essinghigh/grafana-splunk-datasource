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

const baseSearchCache: Map<string, BaseSearchResult> = new Map();
const baseSearchInflight: Map<string, Promise<BaseSearchResult>> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class DataSource extends DataSourceApi<SplunkQuery, SplunkDataSourceOptions> {
  url?: string;

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
    const baseSearches = options.targets.filter(query => query.searchType === 'base' || !query.searchType);
    const chainSearches = options.targets.filter(query => query.searchType === 'chain');

    const baseSearchPromises: Promise<BaseSearchResult>[] = [];
    const baseResults: any[] = [];

    for (const query of baseSearches) {
      const primaryKey = query.refId; // Assuming refId is the primary key
      const searchIdKey = query.searchId;

      // 1. Check cache first
      let cachedResult = this.findBaseSearchResult(primaryKey);
      if (searchIdKey && !cachedResult) {
        cachedResult = this.findBaseSearchResult(searchIdKey);
      }

      if (cachedResult) {
        baseSearchPromises.push(Promise.resolve(cachedResult));
      } else {
        // 2. Check for existing in-flight promise
        let inflightPromise = baseSearchInflight.get(primaryKey);
        if (searchIdKey && !inflightPromise) {
          inflightPromise = baseSearchInflight.get(searchIdKey);
        }

        if (inflightPromise) {
          baseSearchPromises.push(inflightPromise);
        } else {
          // 3. No cached result, no in-flight promise: Execute new search
          const executeAndCacheBaseSearch = async (): Promise<BaseSearchResult> => {
            const result = await this.doRequest(query, options);
            const baseResult: BaseSearchResult = {
              sid: result.sid || '',
              searchId: query.searchId || query.refId, // Ensure searchId is populated
              refId: query.refId,
              fields: result.fields,
              results: result.results,
              timestamp: Date.now(),
            };
            baseSearchCache.set(query.refId, baseResult);
            if (query.searchId) {
              baseSearchCache.set(query.searchId, baseResult);
            }
            return baseResult;
          };

          let newPromise = executeAndCacheBaseSearch();

          // Wrap promise with finally for cleanup
          newPromise = newPromise.finally(() => {
            baseSearchInflight.delete(primaryKey);
            if (searchIdKey) {
              baseSearchInflight.delete(searchIdKey);
            }
          });

          baseSearchInflight.set(primaryKey, newPromise);
          if (searchIdKey) {
            baseSearchInflight.set(searchIdKey, newPromise);
          }
          baseSearchPromises.push(newPromise);
        }
      }
    }

    const completedBaseSearchResults = await Promise.all(baseSearchPromises);

    for (const completedResult of completedBaseSearchResults) {
      // Find the original query corresponding to the result.
      // This is important because query options (like refId) are needed for createDataFrame.
      const originalQuery = baseSearches.find(q => q.refId === completedResult.refId || (completedResult.searchId && q.searchId === completedResult.searchId));
      if (originalQuery) {
        const dataFrame = this.createDataFrame(originalQuery, { fields: completedResult.fields, results: completedResult.results, sid: completedResult.sid });
        baseResults.push(dataFrame);
      } else {
        // This case should ideally not happen if logic is correct
        console.error("Could not find original query for completed base search result", completedResult);
      }
    }
    
    console.log('Cache after base searches:', Array.from(baseSearchCache.keys()));
    
    // Now execute chain searches
    const chainResults: any[] = [];
    for (const query of chainSearches) {
      if (query.baseSearchRefId) {
        let baseSearch = this.findBaseSearchResult(query.baseSearchRefId);

        if (!baseSearch || !this.isCacheValid(baseSearch)) {
          let awaitedBaseSearch: BaseSearchResult | null = null;
          let inflightPromise: Promise<BaseSearchResult> | undefined = undefined;
          const maxRetries = 3;
          const retryDelayMs = 100;

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            // Attempt to find the promise in baseSearchInflight
            // Check by query.baseSearchRefId (could be refId or searchId of a base query)
            inflightPromise = baseSearchInflight.get(query.baseSearchRefId);

            // If not found, and baseSearchRefId might be a searchId,
            // try to find the original base query by its searchId and use its refId.
            // (Assuming baseSearchInflight is primarily keyed by refId for base queries,
            // but also by searchId if populated for the base query)
            if (!inflightPromise) {
              const baseQueryTarget = options.targets.find(
                t => (t.searchType === 'base' || !t.searchType) && t.searchId === query.baseSearchRefId
              );
              if (baseQueryTarget) {
                // A base query's promise could be stored under its refId or its searchId
                inflightPromise = baseSearchInflight.get(baseQueryTarget.refId) || (baseQueryTarget.searchId ? baseSearchInflight.get(baseQueryTarget.searchId) : undefined) ;
              }
            }

            if (inflightPromise) {
              try {
                awaitedBaseSearch = await inflightPromise;
                if (awaitedBaseSearch && !this.isCacheValid(awaitedBaseSearch)) {
                  awaitedBaseSearch = null; // Stale data from resolved promise
                }
                if (awaitedBaseSearch) {
                  break; // Successfully got valid data
                }
              } catch (error) {
                console.error(`Error awaiting in-flight base search for chain query on attempt ${attempt + 1}:`, error);
                awaitedBaseSearch = null; // Ensure null on error
              }
            }

            // If no promise or await failed/stale, and not the last attempt, delay
            if (!awaitedBaseSearch && attempt < maxRetries - 1) {
              await delay(retryDelayMs);
            }
          }
          baseSearch = awaitedBaseSearch; // Update baseSearch with the result of retry logic
        }

        if (baseSearch) {
          const chainResult = await this.doChainRequest(query, options, baseSearch);
          chainResults.push(this.createDataFrame(query, chainResult));
        } else {
          // Fallback: Execute as a regular search if no valid baseSearch could be obtained
          console.warn(`Base search result for ${query.baseSearchRefId} not found or invalid, executing chain search as regular search.`);
          const result = await this.doRequest(query, options);
          chainResults.push(this.createDataFrame(query, result));
        }
      } else {
        // No baseSearchRefId, execute as regular search
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
  
  private findBaseSearchResult(baseSearchRefId: string): BaseSearchResult | null {
    const cachedResult = baseSearchCache.get(baseSearchRefId);
    if (cachedResult && this.isCacheValid(cachedResult)) {
      return cachedResult;
    }
    return null;
  }
  
  private isCacheValid(cached: BaseSearchResult): boolean {
    return (Date.now() - cached.timestamp) < CACHE_TTL;
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
