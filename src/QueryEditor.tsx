import defaults from 'lodash/defaults';

import React, { PureComponent } from 'react';
import { QueryField, Select, Field, Input } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from './datasource';
import { defaultQuery, SplunkDataSourceOptions, SplunkQuery } from './types';

type Props = QueryEditorProps<DataSource, SplunkQuery, SplunkDataSourceOptions>;

const searchTypeOptions: Array<SelectableValue<string>> = [
  { label: 'Base Search', value: 'base', description: 'A search that provides results for other searches to reference' },
  { label: 'Chain Search', value: 'chain', description: 'A search that builds upon a base search result' }
];

export class QueryEditor extends PureComponent<Props> {
  onQueryTextChange = (value: string) => {
    const { onChange, query } = this.props;
    onChange({ ...query, queryText: value });
  };

  onSearchTypeChange = (selection: SelectableValue<string>) => {
    const { onChange, query } = this.props;
    const newQuery = { 
      ...query, 
      searchType: selection.value as 'base' | 'chain'
    };
    
    // Clear baseSearchRefId when switching to base search
    if (selection.value === 'base') {
      delete newQuery.baseSearchRefId;
    }
    
    onChange(newQuery);
  };

  onSearchIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { onChange, query } = this.props;
    onChange({ ...query, searchId: event.target.value });
  };

  onBaseSearchRefIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { onChange, query } = this.props;
    onChange({ ...query, baseSearchRefId: event.target.value });
  };

  render() {
    const query = defaults(this.props.query, defaultQuery);
    const { queryText, searchType, searchId, baseSearchRefId } = query;
    const isChainSearch = searchType === 'chain';
    const isBaseSearch = searchType === 'base' || !searchType;

    return (
      <div>
        <div className="gf-form-group">
          <div className="gf-form">
            <Field label="Search Type" description="Choose whether this is a base search or chain search">
              <Select
                options={searchTypeOptions}
                value={searchTypeOptions.find(option => option.value === (searchType || 'base'))}
                onChange={this.onSearchTypeChange}
                width={20}
              />
            </Field>
          </div>
        </div>

        {isBaseSearch && (
          <div className="gf-form">
            <Field 
              label="Search ID" 
              description="Optional identifier for this base search. Used by chain searches to reference this search."
            >
              <Input
                value={searchId || ''}
                onChange={this.onSearchIdChange}
                placeholder="my-base-search"
                width={30}
              />
            </Field>
          </div>
        )}

        {isChainSearch && (
          <div className="gf-form">
            <Field 
              label="Base Search Reference" 
              description="Enter the RefId of the base search to build upon"
            >
              <Input
                value={baseSearchRefId || ''}
                onChange={this.onBaseSearchRefIdChange}
                placeholder="A"
                width={30}
              />
            </Field>
          </div>
        )}

        <div className="gf-form">
          <Field 
            label="Query" 
            description={isChainSearch ? 
              "Enter Splunk commands to apply to the base search (e.g., 'stats count by host' or '| stats count by host')" :
              "Enter your Splunk search query"
            }
          >
            <QueryField 
              portalOrigin="splunk" 
              query={queryText || ''} 
              onChange={this.onQueryTextChange} 
              placeholder={isChainSearch ? 
                "stats count by host" : 
                "index=main error"
              }
            />
          </Field>
        </div>
      </div>
    );
  }
}
