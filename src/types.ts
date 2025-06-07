import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

export interface QueryRequestResults {
  fields: any[];
  results: any[];
  sid?: string; // Optional SID for chain searches
}

export interface BaseSearchResult {
  sid: string;
  searchId: string;
  refId: string;
  fields: any[];
  results: any[];
  timestamp: number;
}

export const defaultQueryRequestResults: QueryRequestResults = {
  fields: [],
  results: [],
};

export interface SplunkQuery extends DataQuery {
  queryText: string;
  searchType?: 'standard' | 'base' | 'chain';
  mode?: 'base' | 'chain'; // For backward compatibility
  baseSearchRefId?: string;
  searchId?: string; // For base searches, this will be used to identify them
}

export const defaultQuery: Partial<SplunkQuery> = {
  queryText: '',
  searchType: 'standard',
};

/**
 * These are options configured for each DataSource instance
 */
export interface SplunkDataSourceOptions extends DataSourceJsonData {
  endpoint?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface SplunkSecureJsonData {
  basicAuthToken?: string;
}
