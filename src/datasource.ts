import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
// Workaround for rxjs type mismatch in Grafana plugin dev: force import from @grafana/data's rxjs
import { lastValueFrom } from 'rxjs';

import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MetricFindValue,
  PartialDataFrame,
  FieldType,
} from '@grafana/data';

import { SplunkQuery, SplunkDataSourceOptions, defaultQueryRequestResults, QueryRequestResults, BaseSearchResult } from './types';

const baseSearchCache: Map<string, BaseSearchResult> = new Map();
const baseSearchInflight: Map<string, Promise<BaseSearchResult>> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Generate a cache key that includes query parameters to ensure proper invalidation
function generateCacheKey(query: SplunkQuery, options: DataQueryRequest<SplunkQuery>): string {
  const { range } = options;
  const from = Math.floor(range!.from.valueOf() / 1000);
  const to = Math.floor(range!.to.valueOf() / 1000);
  
  // Include query text, time range, and other relevant parameters in the cache key
  const keyComponents = [
    query.refId || '',
    query.searchId || '',
    query.queryText || '',
    from.toString(),
    to.toString(),
    JSON.stringify(options.scopedVars || {})
  ];
  
  return keyComponents.join('|');
}

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
    // Clean up stale cache entries periodically
    this.cleanupStaleCache();
    
    const standardSearches = options.targets.filter(query => query.searchType === 'standard' || !query.searchType);
    const baseSearches = options.targets.filter(query => query.searchType === 'base');
    const chainSearches = options.targets.filter(query => query.searchType === 'chain');

    // Handle standard searches first - these are independent
    const standardResults: any[] = [];
    for (const query of standardSearches) {
      const result = await this.doRequest(query, options);
      standardResults.push(this.createDataFrame(query, result));
    }

    const baseSearchPromises: Array<Promise<BaseSearchResult>> = [];
    const baseResults: any[] = [];

    for (const query of baseSearches) {
      const cacheKey = generateCacheKey(query, options);
      const primaryKey = query.refId; // For compatibility with chain searches
      const searchIdKey = query.searchId;

      // 1. Check cache first using the proper cache key
      let cachedResult = this.findBaseSearchResult(cacheKey);

      if (cachedResult) {
        console.log('Using cached base search result for:', cacheKey);
        baseSearchPromises.push(Promise.resolve(cachedResult));
      } else {
        // 2. Check for existing in-flight promise
        let inflightPromise = baseSearchInflight.get(cacheKey);

        if (inflightPromise) {
          console.log('Using in-flight base search promise for:', cacheKey);
          baseSearchPromises.push(inflightPromise);
        } else {
          // 3. No cached result, no in-flight promise: Execute new search
          console.log('Executing new base search for:', cacheKey);
          const executeAndCacheBaseSearch = async (): Promise<BaseSearchResult> => {
            const result = await this.doRequest(query, options);
            const baseResult: BaseSearchResult = {
              sid: result.sid || '',
              searchId: query.searchId || query.refId, // Ensure searchId is populated
              refId: query.refId,
              fields: result.fields,
              results: result.results,
              timestamp: Date.now(),
              cacheKey: cacheKey, // Store the cache key for reference
            };
            
            // Store in cache with the proper cache key
            baseSearchCache.set(cacheKey, baseResult);
            // Also store with refId and searchId for chain search compatibility
            baseSearchCache.set(query.refId, baseResult);
            if (query.searchId) {
              baseSearchCache.set(query.searchId, baseResult);
            }
            return baseResult;
          };

          let newPromise = executeAndCacheBaseSearch();

          // Wrap promise with finally for cleanup
          newPromise = newPromise.finally(() => {
            baseSearchInflight.delete(cacheKey);
            baseSearchInflight.delete(primaryKey);
            if (searchIdKey) {
              baseSearchInflight.delete(searchIdKey);
            }
          });

          baseSearchInflight.set(cacheKey, newPromise);
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
        let baseSearch = this.findBaseSearchResultByRefId(query.baseSearchRefId);

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
                t => t.searchType === 'base' && t.searchId === query.baseSearchRefId
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
          console.log('Executing chain search with base search SID:', baseSearch.sid);
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
    
    const allResults = [...standardResults, ...baseResults, ...chainResults];
    return { data: allResults };
  }
  
  private createDataFrame(query: SplunkQuery, response: QueryRequestResults) {
    const moment = require('moment');
    
    // Prepare fields with proper typing
    const fields = response.fields.map((fieldName: any) => {
      const values: any[] = [];
      let fieldType = FieldType.string;
      
      // First pass: collect values
      response.results.forEach((result: any) => {
        if (fieldName === 'Time' || fieldName === '_time') {
          const time = moment(result['_time']).format('YYYY-MM-DDTHH:mm:ssZ');
          values.push(time);
        } else {
          values.push(result[fieldName]);
        }
      });
      
      // Determine field type based on content
      if (fieldName === 'Time' || fieldName === '_time') {
        fieldType = FieldType.time;
      } else {
        // Check if all non-null values are numeric
        const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
        if (nonNullValues.length > 0) {
          const allNumeric = nonNullValues.every(v => {
            const num = parseFloat(v);
            return !isNaN(num) && isFinite(num);
          });
          
          if (allNumeric) {
            fieldType = FieldType.number;
            // Convert string numbers to actual numbers
            for (let i = 0; i < values.length; i++) {
              if (values[i] !== null && values[i] !== undefined && values[i] !== '') {
                values[i] = parseFloat(values[i]);
              }
            }
          }
        }
      }
      
      return {
        name: fieldName,
        type: fieldType,
        values: values,
      };
    });

    const frame: PartialDataFrame = {
      refId: query.refId,
      fields: fields,
    };

    return frame;
  }
  
  private findBaseSearchResult(cacheKey: string): BaseSearchResult | null {
    const cachedResult = baseSearchCache.get(cacheKey);
    if (cachedResult && this.isCacheValid(cachedResult)) {
      return cachedResult;
    } else if (cachedResult && !this.isCacheValid(cachedResult)) {
      // Remove stale cache entry
      baseSearchCache.delete(cacheKey);
      console.log('Removed stale cache entry for:', cacheKey);
    }
    return null;
  }
  
  private findBaseSearchResultByRefId(baseSearchRefId: string): BaseSearchResult | null {
    const cachedResult = baseSearchCache.get(baseSearchRefId);
    if (cachedResult && this.isCacheValid(cachedResult)) {
      return cachedResult;
    } else if (cachedResult && !this.isCacheValid(cachedResult)) {
      // Remove stale cache entry
      baseSearchCache.delete(baseSearchRefId);
      console.log('Removed stale cache entry for refId:', baseSearchRefId);
    }
    return null;
  }
  
  private isCacheValid(cached: BaseSearchResult): boolean {
    return (Date.now() - cached.timestamp) < CACHE_TTL;
  }
  
  private cleanupStaleCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, result] of baseSearchCache.entries()) {
      if ((now - result.timestamp) >= CACHE_TTL) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      baseSearchCache.delete(key);
      console.log('Cleaned up stale cache entry:', key);
    });
  }

  async testDatasource() {
    const data = new URLSearchParams({
      search: `search index=_internal * | stats count`,
      output_mode: 'json',
      exec_mode: 'oneshot',
    }).toString();

    try {
      await lastValueFrom(
        (getBackendSrv().fetch<any>({
          method: 'POST',
          url: this.url + '/services/search/jobs',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          data: data,
        }) as any)
      );
      return {
        status: 'success',
        message: 'Data source is working',
        title: 'Success',
      };
    } catch (err: any) {
      return {
        status: 'error',
        message: err.statusText,
        title: 'Error',
      };
    }
  }

  async doSearchStatusRequest(sid: string) {
    const response: any = await lastValueFrom(
      (getBackendSrv().fetch<any>({
        method: 'GET',
        url: this.url + '/services/search/jobs/' + sid,
        params: {
          output_mode: 'json',
        },
      }) as any)
    );
    let status = (response.data as any).entry[0].content.dispatchState;
    return status === 'DONE' || status === 'PAUSED' || status === 'FAILED';
  }

  async doSearchRequest(query: SplunkQuery, options: DataQueryRequest<SplunkQuery>): Promise<{sid: string} | null> {
    if ((query.queryText || '').trim().length < 4) {
      console.warn('Query text too short or empty for query:', query.refId);
      return null;
    }
    
    const { range } = options;
    const from = Math.floor(range!.from.valueOf() / 1000);
    const to = Math.floor(range!.to.valueOf() / 1000);

    const prefix = (query.queryText || ' ')[0].trim() === '|' ? '' : 'search';
    const queryWithVars = getTemplateSrv().replace(`${prefix} ${query.queryText}`.trim(), options.scopedVars);

    console.log('Executing Splunk search:', queryWithVars, 'Time range:', from, 'to', to);

    const data = new URLSearchParams({
      search: queryWithVars,
      output_mode: 'json',
      earliest_time: from.toString(),
      latest_time: to.toString(),
    }).toString();

    try {
      const response: any = await lastValueFrom(
        (getBackendSrv().fetch<any>({
          method: 'POST',
          url: this.url + '/services/search/jobs',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          data: data,
        }) as any)
      );
      const sid: string = (response.data as any).sid;
      console.log('Search job created with SID:', sid);
      return { sid };
    } catch (error) {
      console.error('Error creating search job:', error);
      throw error;
    }
  }

  async doGetAllResultsRequest(sid: string) {
    const count = 50000;
    let offset = 0;
    let isFirst = true;
    let isFinished = false;
    let fields: any[] = [];
    let results: any[] = [];

    while (!isFinished) {
      const response: any = await lastValueFrom(
        (getBackendSrv().fetch<any>({
          method: 'GET',
          url: this.url + '/services/search/jobs/' + sid + '/results',
          params: {
            output_mode: 'json',
            offset: offset,
            count: count,
          },
        }) as any)
      );
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
    console.log('Executing doRequest for query:', query.refId, 'searchType:', query.searchType);
    
    try {
      const searchResult = await this.doSearchRequest(query, options);
      const sid: string = searchResult?.sid || '';
      
      console.log('Search initiated with SID:', sid);
      
      if (sid.length > 0) {
        while (!(await this.doSearchStatusRequest(sid))) {
          // Add a small delay to prevent excessive polling
          await delay(100);
        }
        const result = await this.doGetAllResultsRequest(sid);
        
        console.log('Search completed for SID:', sid, 'Results count:', result.results.length);
        
        // Return the result with SID so the calling code can store it
        return { ...result, sid };
      }
      
      console.warn('Search request returned empty SID for query:', query.refId);
      return defaultQueryRequestResults;
    } catch (error) {
      console.error('Error in doRequest for query:', query.refId, error);
      throw error;
    }
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
      const response: any = await lastValueFrom(
        (getBackendSrv().fetch<any>({
          method: 'POST',
          url: this.url + '/services/search/jobs',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          data: data,
        }) as any)
      );
      const sid: string = (response.data as any).sid;
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
