import defaults from 'lodash/defaults';

import React, { PureComponent } from 'react';
import { CodeEditor, Combobox, Field, Input, Badge, Tooltip } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { css } from '@emotion/css';
import { DataSource } from './datasource';
import { defaultQuery, SplunkDataSourceOptions, SplunkQuery } from './types';
import { splLanguage } from './language/splMonarch';

type Props = QueryEditorProps<DataSource, SplunkQuery, SplunkDataSourceOptions>;

interface State {
  editorHeight: number;
}

interface MonacoEditor {
  getDomNode: () => HTMLElement | null;
}

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
    width: 100%;
    border: 1px solid rgba(204, 204, 220, 0.25);
    border-radius: 6px;
    overflow: hidden;
    position: relative;
    transition: height 0.2s ease-in-out;
    
    .monaco-editor .scroll-decoration {
      box-shadow: none !important;
    }
    
    .monaco-editor .scrollbar {
      display: none !important;
    }
    
    .monaco-editor .overflow-guard {
      overflow: hidden !important;
    }
    
    [data-testid="data-testid ReactMonacoEditor editorLazy"] {
      transition: height 0.15s ease-out;
      overflow: hidden !important;
    }
    
    /* Smooth transition class for regular changes */
    [data-testid="data-testid ReactMonacoEditor editorLazy"].smooth-transition {
      transition: height 0.15s ease-out;
    }
    
    /* Immediate transition class for bottom expansions */
    [data-testid="data-testid ReactMonacoEditor editorLazy"].immediate-transition {
      transition: none;
    }
    
    .monaco-editor {
      transition: height 0.15s ease-out;
    }
    
    .monaco-editor.smooth-transition {
      transition: height 0.15s ease-out;
    }
    
    .monaco-editor.immediate-transition {
      transition: none;
    }
    
    .monaco-editor .overflow-guard {
      overflow: hidden !important;
    }
    
    .monaco-editor .monaco-scrollable-element {
      overflow: hidden !important;
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

export class QueryEditor extends PureComponent<Props, State> {
  private editorInstance: MonacoEditor | null = null;
  private heightCheckInterval: NodeJS.Timeout | null = null;
  private readonly MIN_LINES = 8;
  private readonly LINE_HEIGHT = 18; // Must match the lineHeight in monacoOptions

  constructor(props: Props) {
    super(props);
    this.state = {
      editorHeight: this.MIN_LINES * this.LINE_HEIGHT, // Start with minimum height
    };
  }

  componentWillUnmount() {
    if (this.heightCheckInterval) {
      clearInterval(this.heightCheckInterval);
    }
  }

  private startHeightPolling = () => {
    // Clear any existing interval
    if (this.heightCheckInterval) {
      clearInterval(this.heightCheckInterval);
    }

    // Start polling for height changes (less frequent now that we have content listeners)
    this.heightCheckInterval = setInterval(() => {
      this.updateEditorHeight({ preservePosition: true });
    }, 500); // Check every 500ms as backup
  };

  private updateEditorHeight = (options: { isBottomExpansion?: boolean, preservePosition?: boolean } = {}) => {
    if (!this.editorInstance) {
      return;
    }

    const domNode = this.editorInstance.getDomNode();
    if (!domNode) {
      return;
    }

    // Get the Monaco editor model to count actual lines
    const model = (this.editorInstance as any).getModel();
    if (!model) {
      return;
    }

    // Store current scroll state
    const currentScrollTop = (this.editorInstance as any).getScrollTop();

    // Count the actual lines in the content
    const lineCount = model.getLineCount();
    
    // Calculate the required height (minimum 8 lines)
    const requiredLines = Math.max(lineCount, this.MIN_LINES);
    
    // Try to get the actual content height from Monaco first
    let newHeight;
    try {
      const contentHeight = (this.editorInstance as any).getContentHeight();
      if (contentHeight && contentHeight > 0) {
        // Use Monaco's calculated content height, but ensure minimum
        newHeight = Math.max(contentHeight, this.MIN_LINES * this.LINE_HEIGHT);
      } else {
        // Fallback: use a slightly higher multiplier (20px per line)
        newHeight = Math.max(requiredLines * 20, this.MIN_LINES * 20);
      }
    } catch (e) {
      // If Monaco method fails, use fallback calculation
      newHeight = Math.max(requiredLines * 20, this.MIN_LINES * 20);
    }

    // Find the Monaco editor container by the correct data-testid value
    const editorContainer = domNode.closest('[data-testid="data-testid ReactMonacoEditor editorLazy"]') as HTMLElement;
    if (editorContainer) {
      const oldHeight = parseInt(editorContainer.style.height || '0', 10);
      const heightDiff = newHeight - oldHeight;
      const monacoEditor = domNode.querySelector('.monaco-editor') as HTMLElement;
      
      // Ensure immediate transition for all height changes
      editorContainer.classList.add('immediate-transition');
      editorContainer.classList.remove('smooth-transition');
      if (monacoEditor) {
        monacoEditor.classList.add('immediate-transition');
        monacoEditor.classList.remove('smooth-transition');
      }
      
      // Set the new height
      editorContainer.style.height = `${newHeight}px`;
      if (monacoEditor) {
        monacoEditor.style.height = `${newHeight}px`;
      }
      
      // Use requestAnimationFrame to ensure DOM has updated before adjusting scroll
      requestAnimationFrame(() => {
        if (options.isBottomExpansion && heightDiff > 0) {
          // For bottom expansions, keep the content steady and don't scroll
          // The new line will be visible due to the height increase
          (this.editorInstance as any).setScrollTop(Math.max(0, currentScrollTop));
          
          // Ensure cursor is visible without scrolling beyond what's needed
          // if (currentPosition) {
          //   try {
          //     (this.editorInstance as any).revealPosition(currentPosition, 0); // 0 = Immediate, no animation
          //   } catch (e) {
          //     // Fallback if revealPosition fails
          //   }
          // }
          
          // Smooth transitions are no longer used. The setTimeout for restoring them is removed.
        } else if (options.preservePosition) {
          // Maintain exact scroll position for other changes
          (this.editorInstance as any).setScrollTop(currentScrollTop);
        } else {
          // Default behavior: reset scroll for small editors, maintain for larger ones
          if (currentScrollTop < 10 && newHeight <= this.MIN_LINES * this.LINE_HEIGHT * 1.5) {
            (this.editorInstance as any).setScrollTop(0);
          } else {
            (this.editorInstance as any).setScrollTop(currentScrollTop);
          }
        }
      });
    }

    // Also update state for consistency (though we're now directly setting DOM height)
    if (Math.abs(newHeight - this.state.editorHeight) > 5) {
      this.setState({ editorHeight: newHeight });
    }
  };
  onQueryTextChange = (value: string) => {
    const { onChange, query } = this.props;
    onChange({ ...query, queryText: value });
    
    // For smoother expansion, update height immediately
    // Use a very short delay to let Monaco process the content change first
    setTimeout(() => {
      this.updateEditorHeight({ preservePosition: true });
    }, 10);
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
                height={this.state.editorHeight}
                onChange={this.onQueryTextChange}
                showLineNumbers={true}
                showMiniMap={false}
                onEditorDidMount={(editor: MonacoEditor) => {
                  this.editorInstance = editor;
                  
                  setTimeout(() => {
                    // Set initial height on the Monaco editor container
                    const domNode = editor.getDomNode();
                    if (domNode) {
                      const editorContainer = domNode.closest('[data-testid="data-testid ReactMonacoEditor editorLazy"]') as HTMLElement;
                      if (editorContainer) {
                        editorContainer.style.height = `${this.state.editorHeight}px`;
                      }
                    }
                    
                    // Add content change listener
                    const model = (editor as any).getModel();
                    if (model) {
                      model.onDidChangeContent((e: any) => {
                        // Get current state
                        const currentPosition = (editor as any).getPosition();
                        const lineCount = model.getLineCount();
                        
                        // Check if this change involved adding content at or near the bottom
                        const postChangeLineCount = lineCount;   // Line count after change

                        let isBottomExpansion = false;

                        // Determine if the primary change was a pure newline addition.
                        let isPureNewlineAddition = false;
                        if (e.changes && e.changes.length > 0) {
                            // Consider it a pure newline addition if at least one change involves adding a newline
                            // and that change is an insertion (rangeLength is 0).
                            // This is a simplified check; more complex changes might need more robust parsing.
                            isPureNewlineAddition = e.changes.some((change: any) => 
                                change.text && change.text.includes('\n') && change.rangeLength === 0
                            );
                        }

                        if (isPureNewlineAddition) {
                            const cursorLine = currentPosition.lineNumber; 
                            
                            // Assuming single newline added for preChangeLineCount calculation for simplicity in this targeted fix.
                            const preChangeLineCount = postChangeLineCount - 1; 

                            // Condition A: Cursor was on the original last line.
                            if (cursorLine === preChangeLineCount) {
                                isBottomExpansion = true;
                            } 
                            // Condition B: Cursor was on the original second-to-last line, 
                            // AND the original last line was blank.
                            else if (cursorLine === preChangeLineCount - 1) {
                                // If cursor was on original second-to-last, and a line was inserted there,
                                // the content of the original last line is now at the *new* last line position.
                                if (preChangeLineCount >= 1) { // Ensures there was an original last line.
                                                             // (i.e. original doc had at least 1 line for cursorLine=0, preChangeLineCount=1;
                                                             // or original doc had at least 2 lines for cursorLine=1, preChangeLineCount=2)
                                    const contentOfOriginalLastLine = model.getLineContent(postChangeLineCount); // Read from new model's last line
                                    if (!contentOfOriginalLastLine || contentOfOriginalLastLine.trim() === '') {
                                        isBottomExpansion = true;
                                    }
                                }
                            }
                        }

                        if (isBottomExpansion) {
                          // For bottom expansions, handle immediately with special options
                          this.updateEditorHeight({ isBottomExpansion: true });
                        } else {
                          // Normal content changes
                          setTimeout(() => {
                            this.updateEditorHeight({ preservePosition: true });
                          }, 10);
                        }
                      });
                    }
                    
                    // Do an initial height update
                    this.updateEditorHeight();
                    
                    // Still poll but less frequently as backup
                    this.startHeightPolling();
                  }, 100);
                }}
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
                  wordWrapColumn: 80,
                  wrappingIndent: 'indent',
                  minimap: { enabled: false },
                  folding: false,
                  renderLineHighlight: 'none',
                  automaticLayout: true,
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  scrollbar: {
                    vertical: 'hidden',
                    horizontal: 'hidden',
                    useShadows: false,
                    verticalScrollbarSize: 0,
                    horizontalScrollbarSize: 0
                  }
                }}
              />
            </div>
          </Field>
        </div>
      </div>
    );
  }
}
