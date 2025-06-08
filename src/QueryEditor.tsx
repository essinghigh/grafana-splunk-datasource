import defaults from 'lodash/defaults';

import React, { PureComponent } from 'react';
import { CodeEditor, Combobox, Field, Input, Badge, Tooltip } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { css } from '@emotion/css';
import { DataSource } from './datasource';
import { defaultQuery, SplunkDataSourceOptions, SplunkQuery } from './types';
import { splLanguage } from './language/splMonarch';

type Props = QueryEditorProps<DataSource, SplunkQuery, SplunkDataSourceOptions>;

const searchTypeOptions: Array<SelectableValue<string>> = [
  { 
    label: 'Standard', 
    value: 'standard', 
    description: 'Standalone search',
    icon: 'search'
  },
  { 
    label: 'Base', 
    value: 'base', 
    description: 'Reusable search for other queries',
    icon: 'cube'
  },
  { 
    label: 'Chain', 
    value: 'chain', 
    description: 'Builds on a base search',
    icon: 'link'
  }
];

const styles = {
  container: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
  `,
  headerRow: css`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  `,
  searchTypeContainer: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  badge: css`
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `,
  queryContainer: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  conditionalField: css`
    background: rgba(204, 204, 220, 0.07);
    border: 1px solid rgba(204, 204, 220, 0.15);
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 8px;
  `,
  queryField: css`
    min-height: 140px;
    width: 100%;
    border: 1px solid rgba(204, 204, 220, 0.25);
    border-radius: 6px;
    overflow: hidden;
    position: relative;
    
    .monaco-editor {
      min-height: 140px !important;
    }
    
    /* Completely disable scrolling within Monaco editor */
    .monaco-scrollable-element {
      overflow: visible !important;
    }
    
    .monaco-scrollable-element > .scrollbar {
      display: none !important;
    }
    
    .monaco-editor .overflow-guard {
      overflow: visible !important;
    }
    
    .monaco-editor .monaco-scrollable-element {
      overflow: visible !important;
    }
    
    /* Ensure mouse wheel events pass through */
    .monaco-editor .view-overlays {
      pointer-events: none !important;
    }
    
    .monaco-editor .scrollbar {
      display: none !important;
      visibility: hidden !important;
    }
  `,
  placeholder: css`
    position: absolute;
    top: 5px;
    left: 45px;
    color: rgba(255, 255, 255, 0.4);
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 13px;
    line-height: 18px;
    pointer-events: none;
    z-index: 1;
  `
};

export class QueryEditor extends PureComponent<Props> {
  onQueryTextChange = (value: string) => {
    const { onChange, query } = this.props;
    onChange({ ...query, queryText: value });
  };

  calculateEditorHeight = (text: string): number => {
    // Count the number of lines in the text
    const lineCount = text ? (text.match(/\n/g) || []).length + 1 : 1;
    
    // Base height for 7 lines (140px from original implementation)
    const baseHeight = 140;
    
    // Line height from Monaco options (18px)
    const lineHeight = 18;
    
    // Calculate dynamic height: minimum of 7 lines or actual line count
    // Add a small buffer for padding and borders
    return Math.max(baseHeight, lineHeight * lineCount + 12);
  };

  onSearchTypeChange = (selection: SelectableValue<string>) => {
    const { onChange, query } = this.props;
    const newQuery = { 
      ...query, 
      searchType: selection.value as 'standard' | 'base' | 'chain'
    };
    
    // Clear baseSearchRefId when switching to standard or base search
    if (selection.value === 'standard' || selection.value === 'base') {
      delete newQuery.baseSearchRefId;
    }
    
    // Clear searchId when switching to standard or chain search
    if (selection.value === 'standard' || selection.value === 'chain') {
      delete newQuery.searchId;
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
    const isBaseSearch = searchType === 'base';
    const currentSearchType = searchTypeOptions.find(option => option.value === (searchType || 'standard'));

    return (
      <div className={styles.container}>
        {/* Header with search type selection */}
        <div className={styles.headerRow}>
          <div className={styles.searchTypeContainer}>
            <Combobox
              options={searchTypeOptions.map(opt => ({ 
                label: opt.label, 
                value: opt.value || '', 
                description: opt.description,
                icon: opt.icon
              }))}
              value={currentSearchType?.value || ''}
              onChange={(val) => {
                if (val) {
                  const selected = searchTypeOptions.find(opt => opt.value === val.value);
                  if (selected) {
                    this.onSearchTypeChange(selected);
                  }
                }
              }}
              width={24}
              placeholder="Search type"
            />
            <Tooltip content={currentSearchType?.description || 'Select search type'}>
              <Badge 
                text={currentSearchType?.label || 'Standard'} 
                color="blue" 
                className={styles.badge}
              />
            </Tooltip>
          </div>
        </div>

        {/* Base Search ID field */}
        {isBaseSearch && (
          <div className={styles.conditionalField}>
            <Field 
              label="Search ID" 
              description="Identifier for this base search (used by chain searches)"
            >
              <Input
                value={searchId || ''}
                onChange={this.onSearchIdChange}
                placeholder="my-base-search"
                width={40}
              />
            </Field>
          </div>
        )}

        {/* Chain Search Reference field */}
        {isChainSearch && (
          <div className={styles.conditionalField}>
            <Field 
              label="Base Search Reference" 
              description="RefId of the base search to build upon"
            >
              <Input
                value={baseSearchRefId || ''}
                onChange={this.onBaseSearchRefIdChange}
                placeholder="my-base-search"
                width={40}
              />
            </Field>
          </div>
        )}

        {/* Main Query Field */}
        <div className={styles.queryContainer}>
          <Field 
            label={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Splunk Query</span>
                {isChainSearch && (
                  <Badge text="Chain" color="orange" className={styles.badge} />
                )}
                {isBaseSearch && (
                  <Badge text="Base" color="green" className={styles.badge} />
                )}
              </div>
            }
            description={
              isChainSearch ? 
                "Commands to apply to the base search (e.g., 'stats count by host')" :
              isBaseSearch ?
                "Search query that provides results for chain searches" :
                "Your Splunk search query"
            }
          >
            <div className={styles.queryField}>
              {(!queryText || queryText.trim() === '') && (
                <div className={styles.placeholder}>
                  {isChainSearch ? 
                    "| stats count by host | head 10" : 
                    "index=main sourcetype=access_* | head 100"
                  }
                </div>
              )}
              <CodeEditor
                value={queryText || ''}
                language="spl"
                height={this.calculateEditorHeight(queryText || '')}
                onChange={this.onQueryTextChange}
                showLineNumbers={true}
                showMiniMap={false}
                onBeforeEditorMount={(monaco: any) => {
                  // Always register the language and theme, even if already registered
                  if (!monaco.languages.getLanguages().some((lang: any) => lang.id === 'spl')) {
                    monaco.languages.register({ id: 'spl' });
                  }
                  monaco.languages.setMonarchTokensProvider('spl', splLanguage);
                  
                  // Define custom SPL theme matching Splunk's color scheme
                  monaco.editor.defineTheme('spl-splunk-theme', {
                    base: 'vs-dark',
                    inherit: true,
                    rules: [
                      // Commands (blue) - matches Splunk's .ace_command (#789EFF)
                      { token: 'keyword.spl-command', foreground: '789EFF' },
                      
                      // Functions (purple) - matches Splunk's .ace_function (#D97ED9)  
                      { token: 'predefined.spl-agg', foreground: 'D97ED9' },
                      { token: 'predefined.spl-function', foreground: 'D97ED9' },
                      
                      // Arguments/Field assignments (green) - matches Splunk's .ace_argument (#95D640)
                      { token: 'identifier.spl-field-name', foreground: '95D640' },
                      
                      // Modifiers/Clause keywords (orange) - matches Splunk's .ace_modifier (#F7A45B)
                      { token: 'keyword.spl-clause', foreground: 'F7A45B' },
                      
                      // Operators (white/visible) - Splunk doesn't define special color, make them white
                      { token: 'operator', foreground: 'FFFFFF' },
                      { token: 'operator.logical', foreground: 'FFFF00' },
                      
                      // Strings (quoted content) - matches Splunk's .ace_quoted default color
                      { token: 'string', foreground: 'CCCCCC' },
                      
                      // Numbers (light blue) - make them stand out like Splunk's .ace_number
                      { token: 'number', foreground: 'ADD8E6' },
                      
                      // Delimiters (white) - pipes and brackets
                      { token: 'delimiter', foreground: 'FFFFFF' },
                      { token: '@brackets', foreground: 'FFFFFF' },
                      
                      // Regular identifiers (default gray) - field names, variables - Splunk default
                      { token: 'identifier', foreground: 'CCCCCC' },
                      
                      // Comments (light gray)
                      { token: 'comment', foreground: 'AAAAAA' },
                      
                      // Fallbacks
                      { token: 'white', foreground: 'CCCCCC' },
                    ],
                    colors: {
                      'editor.background': '#2b3033' // Match Splunk's background
                    }
                  });
                  
                  // Force the theme to be applied immediately
                  monaco.editor.setTheme('spl-splunk-theme');
                  
                  // Also force it again after delays to override any Grafana theme
                  setTimeout(() => {
                    monaco.editor.setTheme('spl-splunk-theme');
                  }, 50);
                  setTimeout(() => {
                    monaco.editor.setTheme('spl-splunk-theme');
                  }, 200);
                }}
                monacoOptions={{
                  fontSize: 13,
                  lineHeight: 18,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  minimap: { enabled: false },
                  folding: false,
                  renderLineHighlight: 'none',
                  automaticLayout: true,
                  scrollbar: {
                    vertical: 'hidden',
                    horizontal: 'hidden',
                    verticalScrollbarSize: 0,
                    horizontalScrollbarSize: 0,
                    handleMouseWheel: false
                  },
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  mouseWheelScrollSensitivity: 0,
                  fastScrollSensitivity: 0,
                  mouseWheelZoom: false,
                  disableLayerHinting: true
                }}
              />
            </div>
          </Field>
        </div>
      </div>
    );
  }
}
