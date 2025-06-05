import React, { PureComponent } from 'react';
import { defaults } from 'lodash';
import { QueryField, FormField, RadioButtonGroup } from '@grafana/ui'; // QueryField is often from @grafana/ui or a legacy path
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from './datasource'; // Assuming this is the correct path to your DataSource class
import { SplunkDataSourceOptions, SplunkQuery, defaultQuery, QueryMode } from './types';

type Props = QueryEditorProps<DataSource, SplunkQuery, SplunkDataSourceOptions>;

export class QueryEditor extends PureComponent<Props> {
  onQueryTextChange = (value: string) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, queryText: value });
    onRunQuery();
  };

  onChainCommandsChange = (value: string) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, chainCommands: value });
    onRunQuery();
  };

  onBaseSearchRefIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, baseSearchRefId: event.currentTarget.value });
    onRunQuery();
  };

  onQueryModeChange = (value: QueryMode) => {
    const { onChange, query, onRunQuery } = this.props;
    let newQuery: Partial<SplunkQuery> = { ...query, queryMode: value };

    if (value === QueryMode.Chain) {
      // Clear queryText when switching to Chain mode
      newQuery.queryText = '';
    } else {
      // Clear chain-specific fields when switching to Standard or Base
      newQuery.baseSearchRefId = '';
      newQuery.chainCommands = '';
    }
    onChange(newQuery as SplunkQuery);
    onRunQuery();
  };

  render() {
    const query = defaults(this.props.query, defaultQuery);
    const { queryText, queryMode, baseSearchRefId, chainCommands } = query;

    return (
      <>
        <div className="gf-form">
          <label className="gf-form-label width-10">Query Mode</label>
          <RadioButtonGroup
            options={[
              { label: 'Standard', value: QueryMode.Standard },
              { label: 'Base', value: QueryMode.Base },
              { label: 'Chain', value: QueryMode.Chain },
            ]}
            value={queryMode || QueryMode.Standard}
            onChange={this.onQueryModeChange}
          />
        </div>

        {(queryMode === QueryMode.Standard || queryMode === QueryMode.Base || !queryMode) && (
          <div className="gf-form">
            {/* Assuming QueryField is appropriate here. For simple text, FormField with an input might also be used. */}
            <QueryField
              portalOrigin="splunk" // This might need to be adjusted based on actual Grafana plugin system
              query={queryText || ''}
              onChange={this.onQueryTextChange}
              onRunQuery={this.props.onRunQuery} // Pass onRunQuery if QueryField supports it directly
              placeholder={`Enter Splunk query${queryMode === QueryMode.Base ? ' (this will be a base search)' : ''}`}
            />
          </div>
        )}

        {queryMode === QueryMode.Chain && (
          <>
            <div className="gf-form">
              <FormField
                label="Base Search Ref ID"
                labelWidth={10}
                inputEl={
                  <input
                    type="text"
                    className="gf-form-input"
                    value={baseSearchRefId || ''}
                    onChange={this.onBaseSearchRefIdChange}
                    placeholder="Ref ID of base search (e.g., A)"
                  />
                }
                tooltip="The Ref ID of another query that acts as the base search for this chain search."
              />
            </div>
            <div className="gf-form">
              {/* Assuming QueryField is appropriate for chain commands too */}
              <QueryField
                portalOrigin="splunk"
                query={chainCommands || ''}
                onChange={this.onChainCommandsChange}
                onRunQuery={this.props.onRunQuery}
                placeholder="Enter chain commands, e.g., | stats count by host"
                tooltip="Commands to append to the base search results, starting with a pipe."
              />
            </div>
          </>
        )}
      </>
    );
  }
}
