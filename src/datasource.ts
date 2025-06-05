import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  MetricFindValue,
  MutableDataFrame,
} from '@grafana/data';
import { defaults } from 'lodash';
import moment from 'moment';

import {
  SplunkQuery,
  SplunkDataSourceOptions,
  defaultQuery,
  QueryMode,
  QueryRequestResults,
  defaultQueryRequestResults,
} from './types';
import { SplunkSearchCache } from './cache';

const DEFAULT_SID_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export class DataSource extends DataSourceInstanceSettings<SplunkDataSourceOptions> {
  private cache: SplunkSearchCache;
  private splunkUrl: string;

  constructor(instanceSettings: DataSourceInstanceSettings<SplunkDataSourceOptions>) {
    super(instanceSettings);
    this.splunkUrl = instanceSettings.url!;
    this.cache = new SplunkSearchCache();
  }

  async query(options: DataQueryRequest<SplunkQuery>): Promise<DataQueryResponse> {
    const baseQueryJobs: Record<string, Promise<QueryRequestResults & { sid?: string }>> = {};
    const resultPromises: Array<Promise<MutableDataFrame>> = [];

    // First Pass: Initiate Base Queries
    for (const target of options.targets) {
      const query = defaults(target, defaultQuery);
      if (query.hide) {
        continue;
      }

      if (query.queryMode === QueryMode.Base) {
        baseQueryJobs[query.refId] = this.doRequestInternal(query, options, false, true);
        // Cache the SID once the base query job is initiated
        baseQueryJobs[query.refId]
          .then((result) => {
            if (result.sid) {
              this.cache.set(query.refId, result.sid, DEFAULT_SID_CACHE_TTL);
              console.log(`SID ${result.sid} cached for base query ${query.refId}`);
            }
          })
          .catch((err) => {
            console.error(`Error in base query ${query.refId} for SID caching: `, err);
          });
      }
    }

    // Second Pass: Process All Queries
    for (const target of options.targets) {
      const query = defaults(target, defaultQuery);
      if (query.hide) {
        continue;
      }

      let workPromise: Promise<QueryRequestResults & { sid?: string }>;

      if (query.queryMode === QueryMode.Standard) {
        workPromise = this.doRequestInternal(query, options, false, false);
      } else if (query.queryMode === QueryMode.Base) {
        if (!baseQueryJobs[query.refId]) {
          // This should ideally not happen if the first pass was successful
          console.warn(`Base query job for ${query.refId} not found in initialization pass. Re-initiating.`);
          baseQueryJobs[query.refId] = this.doRequestInternal(query, options, false, true);
          // Cache the SID once the base query job is initiated
          baseQueryJobs[query.refId]
            .then((result) => {
              if (result.sid) {
                this.cache.set(query.refId, result.sid, DEFAULT_SID_CACHE_TTL);
                console.log(`SID ${result.sid} cached for base query ${query.refId} (late)`);
              }
            })
            .catch((err) => {
              console.error(`Error in late base query ${query.refId} for SID caching: `, err);
            });
        }
        workPromise = baseQueryJobs[query.refId];
      } else if (query.queryMode === QueryMode.Chain) {
        const baseRefId = query.baseSearchRefId!;
        if (!baseRefId) {
          const errorFrame = new MutableDataFrame({
            refId: query.refId,
            fields: [{ name: 'Error', type: 'string', values: ['Base search reference ID not provided for chain query.'] }],
          });
          resultPromises.push(Promise.resolve(errorFrame));
          continue;
        }

        const cachedSid = this.cache.get(baseRefId);

        if (cachedSid) {
          console.log(`Using cached SID ${cachedSid} for chain query ${query.refId} based on ${baseRefId}`);
          const chainQueryText = `| loadjob ${cachedSid} | ${query.chainCommands}`;
          const chainSplunkQuery: SplunkQuery = { ...query, queryText: chainQueryText, queryMode: QueryMode.Chain };
          workPromise = this.doRequestInternal(chainSplunkQuery, options, true, false);
        } else if (baseQueryJobs[baseRefId]) {
          console.log(`Waiting for base query ${baseRefId} to complete for chain query ${query.refId}`);
          workPromise = baseQueryJobs[baseRefId].then((baseResult) => {
            if (!baseResult.sid) {
              throw new Error(`Base search ${baseRefId} failed to produce an SID for chain query ${query.refId}`);
            }
            console.log(`Base query ${baseRefId} completed with SID ${baseResult.sid}. Running chain query ${query.refId}`);
            this.cache.set(baseRefId, baseResult.sid, DEFAULT_SID_CACHE_TTL); // Cache it now
            const chainQueryText = `| loadjob ${baseResult.sid} | ${query.chainCommands}`;
            const chainSplunkQuery: SplunkQuery = { ...query, queryText: chainQueryText, queryMode: QueryMode.Chain };
            return this.doRequestInternal(chainSplunkQuery, options, true, false);
          });
        } else {
          console.warn(`Base search SID for '${baseRefId}' not found in cache and not part of current batch for chain query ${query.refId}.`);
          const errorFrame = new MutableDataFrame({
            refId: query.refId,
            fields: [
              {
                name: 'Error',
                type: 'string',
                values: [`Base search SID for '${baseRefId}' not found, not run, or failed. Cannot run chain query.`],
              },
            ],
          });
          resultPromises.push(Promise.resolve(errorFrame));
          continue;
        }
      } else {
        // Should not happen with defaults in place
        console.warn(`Unknown query mode for query ${query.refId}: ${query.queryMode}`);
        const errorFrame = new MutableDataFrame({
          refId: query.refId,
          fields: [{ name: 'Error', type: 'string', values: [`Unknown query mode: ${query.queryMode}`] }],
        });
        resultPromises.push(Promise.resolve(errorFrame));
        continue;
      }

      resultPromises.push(
        workPromise
          .then((response) => {
            const frame = new MutableDataFrame({
              refId: query.refId,
              fields: [], // Fields will be added based on response
            });

            if (response && response.fields && response.results) {
              response.fields.forEach((field: any) => {
                // TODO: determine field type from results if possible
                frame.addField({ name: field.name || field }); // Splunk sometimes returns {name: 'field'}, sometimes just 'field'
              });

              response.results.forEach((result: any) => {
                const row: any[] = [];
                response.fields.forEach((field: any) => {
                  const fieldName = field.name || field;
                  if (fieldName === '_time' || fieldName === 'Time' || fieldName === 'time') {
                    // Try to parse with moment and format, fallback to original value if parsing fails
                    const timeVal = result[fieldName];
                    const parsedTime = moment(timeVal);
                    if (parsedTime.isValid()) {
                        row.push(parsedTime.valueOf()); // Grafana expects epoch ms for time fields
                    } else {
                        row.push(timeVal); // Fallback if not a valid date
                    }
                  } else {
                    row.push(result[fieldName]);
                  }
                });
                frame.appendRow(row);
              });
               // Set preferred visualization type if it's part of the query options
              if ((query as any).preferredVisualisationType) {
                frame.meta = { ...frame.meta, preferredVisualisationType: (query as any).preferredVisualisationType };
              }

            } else {
              // No results or malformed response
              console.warn(`No results or malformed response for query ${query.refId}`);
            }
            return frame;
          })
          .catch((error) => {
            console.error(`Error processing query ${query.refId}:`, error);
            const errorMsg = error.message || (error.data && error.data.message) || 'Failed to process query';
            const errorFrame = new MutableDataFrame({
              refId: query.refId,
              fields: [{ name: 'Error', type: 'string', values: [errorMsg] }],
            });
            return errorFrame;
          })
      );
    }
    return { data: await Promise.all(resultPromises) };
  }

  async doRequestInternal(
    query: SplunkQuery,
    options: DataQueryRequest<SplunkQuery>,
    isLoadJobSearch = false,
    isBaseSearch = false
  ): Promise<QueryRequestResults & { sid?: string }> {
    if (!query.queryText || query.queryText.trim().length === 0) {
      return Promise.resolve({ ...defaultQueryRequestResults, sid: undefined });
    }

    const sid: string | undefined = await this.doSearchRequest(query, options, isLoadJobSearch);
    if (!sid) {
      console.log('No SID received for query:', query.refId, query.queryText);
      return Promise.resolve({ ...defaultQueryRequestResults, sid: undefined });
    }
    console.log('SID:', sid, 'for query:', query.refId, query.queryText);

    // Poll for search job completion
    let attempts = 0;
    const maxAttempts = 20; // Max 20 attempts * 500ms = 10 seconds for polling
    while (attempts < maxAttempts) {
      const done = await this.doSearchStatusRequest(sid);
      if (done) {
        break;
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms before next status check
    }

    if (attempts >= maxAttempts) {
      console.error(`Search job ${sid} did not complete in time.`);
      // Optionally, try to retrieve partial results or cancel the job
      // For now, return empty results
      return Promise.resolve({ ...defaultQueryRequestResults, sid });
    }

    const results = await this.doGetAllResultsRequest(sid);
    if (isBaseSearch) {
      return { ...results, sid };
    } else {
      // For chain searches that used loadjob, we might want to delete the SID after use
      // if (!isLoadJobSearch) { // This condition is problematic, as isBaseSearch=false for chain too.
      // Consider if SID should be deleted for chain searches.
      // For now, let TTL handle it.
      // }
      return results; // Does not include SID unless it's a base search
    }
  }

  async doSearchRequest(
    query: SplunkQuery,
    options: DataQueryRequest<SplunkQuery>,
    isLoadJobSearch = false
  ): Promise<string | undefined> {
    if (!query.queryText || query.queryText.trim().length === 0) {
      console.log('Query text is empty, skipping search request for refId:', query.refId);
      return Promise.resolve(undefined);
    }

    const { range } = options;
    let searchQueryText: string;
    const searchParams = new URLSearchParams({ output_mode: 'json' });

    if (isLoadJobSearch) {
      // For loadjob, the queryText already contains "| loadjob <SID> | ..."
      // We just need to replace any template variables if they exist in the chainCommands part
      searchQueryText = getTemplateSrv().replace(query.queryText!, options.scopedVars);
      searchParams.set('search', searchQueryText);
      console.log(`Starting loadjob search for ${query.refId}: ${searchQueryText}`);
    } else {
      // For standard or base searches, prepend 'search' if not starting with '|'
      // and apply time ranges.
      const from = Math.floor(range!.from.valueOf() / 1000);
      const to = Math.floor(range!.to.valueOf() / 1000);
      const prefix = (query.queryText || ' ')[0].trim() === '|' ? '' : 'search';
      searchQueryText = getTemplateSrv().replace(`${prefix} ${query.queryText}`.trim(), options.scopedVars);

      searchParams.set('search', searchQueryText);
      searchParams.set('earliest_time', from.toString());
      searchParams.set('latest_time', to.toString());
      console.log(`Starting search for ${query.refId} (isBaseSearch: ${query.queryMode === QueryMode.Base}): ${searchQueryText} from ${from} to ${to}`);
    }

    const data = searchParams.toString();

    try {
      const response = await getBackendSrv().post(`${this.splunkUrl}/services/search/jobs`, data, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (response && response.data && (response.data as any).sid) {
        return (response.data as any).sid;
      } else {
        console.error('Splunk search request did not return a SID.', response);
        return undefined;
      }
    } catch (error: any) {
      console.error('Error making Splunk search request:', error);
      if (error.data && error.data.messages) {
        throw new Error(error.data.messages.map((msg: any) => msg.text).join('; '));
      }
      throw error;
    }
  }

  async doSearchStatusRequest(sid: string): Promise<boolean> {
    try {
      const response = await getBackendSrv().get(`${this.splunkUrl}/services/search/jobs/${sid}`, {
        output_mode: 'json',
      });
      // Example: { "entry": [ { "name": "ADA4E80E-542A-4451-8998-32173905A7E1", "content": { "isDone": true, ... } } ] }
      return response && response.data && response.data.entry && response.data.entry[0].content.isDone;
    } catch (error) {
      console.error(`Error checking status for SID ${sid}:`, error);
      return false; // Assume not done or error occurred
    }
  }

  async doGetAllResultsRequest(sid: string): Promise<QueryRequestResults> {
    try {
      const response = await getBackendSrv().get(`${this.splunkUrl}/services/search/jobs/${sid}/results`, {
        output_mode: 'json',
        count: '0', // 0 means all results
      });

      // Grafana expects fields and rows. Splunk returns fields and results (which are rows).
      // Fields can be an array of strings or an array of objects {name: string}
      // Results is an array of objects, where keys are field names.
      if (response && response.data) {
        const fields = response.data.fields || [];
        const results = response.data.results || [];
        return { fields, results };
      }
      return defaultQueryRequestResults;
    } catch (error) {
      console.error(`Error getting results for SID ${sid}:`, error);
      return defaultQueryRequestResults;
    }
  }

  async metricFindQuery(query: string, options?: any): Promise<MetricFindValue[]> {
    // Implement metric find query logic if needed, for now, return empty
    return Promise.resolve([]);
  }

  async testDatasource() {
    // Minimal test: try to hit the /services/search/jobs endpoint with a very simple search
    // This doesn't validate credentials deeply but checks connectivity and basic auth.
    try {
      const testQuery = 'search index=_internal | head 1';
      const searchParams = new URLSearchParams({
        output_mode: 'json',
        search: testQuery,
        exec_mode: 'oneshot', // Use oneshot for test to avoid leaving jobs
      });
      const data = searchParams.toString();

      await getBackendSrv().post(`${this.splunkUrl}/services/search/jobs`, data, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return {
        status: 'success',
        message: 'Successfully connected to Splunk and executed a test search.',
      };
    } catch (err: any) {
      let message = 'Splunk API Connection Error';
      if (err.status) {
        message += `: Status ${err.status}`;
      }
      if (err.data && err.data.messages && err.data.messages.length > 0) {
        message += ` - ${err.data.messages.map((m: any) => m.text).join(', ')}`;
      } else if (err.data) {
        message += ` - ${JSON.stringify(err.data)}`;
      }
      return {
        status: 'error',
        message: message,
      };
    }
  }
}
