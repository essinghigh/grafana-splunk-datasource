import { DataQuery, DataSourceJsonData } from '@grafana/data';

export enum QueryMode {
  Standard = 'Standard',
  Base = 'Base',
  Chain = 'Chain',
}

export interface QueryRequestResults {
  fields: any[];
  results: any[];
}

export const defaultQueryRequestResults: QueryRequestResults = {
  fields: [],
  results: [],
};

export interface SplunkQuery extends DataQuery {
  queryText?: string;
  queryMode?: QueryMode;
  baseSearchRefId?: string;
  chainCommands?: string;
}

export const defaultQuery: Partial<SplunkQuery> = {
  queryText: '',
  queryMode: QueryMode.Standard,
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
