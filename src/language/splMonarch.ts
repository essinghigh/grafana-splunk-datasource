// src/language/splMonarch.ts

export const splLanguage = {
  // Set default token to avoid errors
  defaultToken: 'source.spl',

  // --- Tokenizer Configuration ---
  splCommands: [
    'addinfo', 'addtotals', 'anomalies', 'anomalousvalue', 'append', 'appendcols', 'appendpipe',
    'associate', 'autoregress', 'bin', 'bucket', 'chart', 'cluster', 'collect', 'concurrency', 'contingency',
    'convert', 'correlate', 'dbinspect', 'dedup', 'delete', 'delta', 'diff', 'erex', 'eval', 'eventstats',
    'export', 'extract', 'fieldformat', 'fields', 'fieldsummary', 'filldown', 'fillnull', 'findtypes',
    'format', 'from', 'gentimes', 'geom', 'geomfilter', 'head', 'history', 'input', 'inputcsv', 'inputlookup',
    'iplocation', 'join', 'kmeans', 'kvform', 'loadjob', 'localop', 'lookup', 'makecontinuous', 'makemv',
    'map', 'metadata', 'metasearch', 'multikv', 'mvexpand', 'mvcombine', 'nomv', 'outlier', 'outputcsv',
    'outputlookup', 'outputtext', 'overlap', 'predict', 'rare', 'regex', 'relevancy', 'reltime', 'rename',
    'replace', 'rest', 'return', 'reverse', 'rex', 'run', 'savedsearch', 'script', 'scrub', 'search',
    'selfjoin', 'sendemail', 'set', 'sichart', 'sirare', 'sistats', 'sitimechart', 'sitruncate', 'sort',
    'spath', 'stats', 'strcat', 'streamstats', 'table', 'tags', 'tail', 'timechart', 'top', 'transaction',
    'transpose', 'trendline', 'tscollect', 'tstats', 'typeahead', 'typelearner', 'typer', 'union', 'uniq',
    'untable', 'where', 'x11', 'xmlkv', 'xpath', 'xyseries'
  ],

  // Clauses (orange)
  splClauses: [
    'as', 'AS', 'by', 'BY', 'over', 'OVER', 'in', 'IN', 'where', 'WHERE', 
    'output', 'OUTPUT', 'outputnew', 'OUTPUTNEW', 'on', 'ON', 'using', 'USING', 
    'with', 'WITH', 'for', 'FOR', 'against', 'AGAINST', 'sortby', 'SORTBY',
    'and', 'AND', 'or', 'OR', 'not', 'NOT', 'xor', 'XOR'
  ],

  // Aggregation/statistical functions (pink/purple)
  splAggFunctions: [
    'avg', 'count', 'c', 'distinct_count', 'dc', 'earliest', 'estdc', 'estdc_error',
    'first', 'last', 'latest', 'list', 'max', 'median', 'min', 'mode', 'p',
    'perc', 'per_day', 'per_hour', 'per_minute', 'per_second', 'rate', 'range',
    'stdev', 'stdevp', 'sum', 'sumsq', 'upper', 'values', 'var', 'varp'
  ],

  // General-purpose functions (pink/purple)
  splEvalFunctions: [
    'abs', 'case', 'ceil', 'cidrmatch', 'coalesce', 'exact', 'exp', 'false', 'floor', 'if',
    'isbool', 'isint', 'isnotnull', 'isnull', 'isnum', 'isstr', 'len', 'like', 'log',
    'lower', 'ltrim', 'match', 'md5', 'mvcount', 'mvfilter', 'mvfind', 'mvindex',
    'mvjoin', 'mvzip', 'now', 'nullif', 'pi', 'pow', 'printf', 'random',
    'relative_time', 'replace', 'round', 'rtrim', 'searchmatch', 'sigfig', 'split',
    'sqrt', 'strftime', 'strptime', 'substr', 'tonumber', 'tostring', 'true', 'typeof',
    'upper', 'urldecode', 'validate'
  ],

  // --- Tokenizer States ---
  tokenizer: {
    root: [
      // A pipe transitions to the command context.
      [/\|/, { token: 'delimiter', next: '@command' }],
      // The query starts in the 'search' context.
      { include: '@searchContext' }
    ],

    // State right after a pipe, expecting a command.
    command: [
      [/\s+/, 'white'],
      // Identify the command and switch to a more specific context.
      [/([a-zA-Z_][\w]*)/, {
        cases: {
          '^(stats|chart|timechart|eventstats)$': { token: 'keyword.spl-command', next: '@statsContext' },
          '^(eval|where)$': { token: 'keyword.spl-command', next: '@evalContext' },
          '^(lookup|inputlookup)$': { token: 'keyword.spl-command', next: '@lookupContext' },
          '^(rename)$': { token: 'keyword.spl-command', next: '@renameContext' },
          '^(fields|table)$': { token: 'keyword.spl-command', next: '@fieldListContext' },
          '^(search)$': { token: 'keyword.spl-command', next: '@searchCommandContext' },
          '@splCommands': { token: 'keyword.spl-command', next: '@generalContext' },
          '@default': { token: 'identifier', next: '@generalContext' }
        }
      }],
    ],

    // Context for initial search (before the first pipe).
    searchContext: [
      [/\s+/, 'white'],
      // Handle `argument=value` pairs for search arguments like earliest, latest
      [/\b(earliest|latest)(=)/, ['identifier.spl-field-name', 'operator']],
      // Field names are plain identifiers, not green arguments.
      [/[a-zA-Z_][\w\-\.]*/, {
        cases: {
          '@splClauses': 'keyword.spl-clause',
          '@default': 'identifier'
        }
      }],
      { include: '@commonTokens' }
    ],

    // Context for stats, chart, timechart commands.
    statsContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      // "AS" clause -> switch to color the new field name green.
      [/\b(as)\b/i, { token: 'keyword.spl-clause', next: '@asClause' }],
      // Functions like `sum(field)`.
      [/(\w+)(?=\s*\()/i, {
        cases: {
          '@splAggFunctions': 'predefined.spl-function',
          '@splEvalFunctions': 'predefined.spl-function',
          '@default': 'identifier'
        }
      }],
      // Bare aggregation functions (count), clauses (by), and fields.
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@splClauses': 'keyword.spl-clause',
          '@splAggFunctions': 'predefined.spl-agg',
          '@default': 'identifier' // Field names
        }
      }],
      { include: '@commonTokens' }
    ],

    // Context for explicit `search` command after a pipe.
    searchCommandContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      // Handle `argument=value` pairs for search arguments like earliest, latest
      [/\b(earliest|latest)(=)/, ['identifier.spl-field-name', 'operator']],
      // Field names and clauses.
      [/[a-zA-Z_][\w\-\.]*/, {
        cases: {
          '@splClauses': 'keyword.spl-clause',
          '@default': 'identifier'
        }
      }],
      { include: '@commonTokens' }
    ],

    // Context for `eval` and `where` commands.
    evalContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      // Functions like `case(...)` or `if(...)`.
      [/(\w+)(?=\s*\()/i, {
        cases: {
          '@splEvalFunctions': 'predefined.spl-function',
          '@default': 'identifier'
        }
      }],
      // Field names, clauses, and booleans.
      [/[a-zA-Z_][\w\-\.]*/, {
        cases: {
          '@splClauses': 'keyword.spl-clause',
          '@default': 'identifier'
        }
      }],
      { include: '@commonTokens' }
    ],

    // Context for `lookup` command.
    lookupContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      // "AS" clause -> switch to color the new field name green.
      [/\b(as)\b/i, { token: 'keyword.spl-clause', next: '@asClause' }],
      // "OUTPUT" clause (case-insensitive)
      [/\b(output|outputnew)\b/i, 'keyword.spl-clause'],
      // Other clauses and fields.
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@splClauses': 'keyword.spl-clause',
          '@default': 'identifier' // Lookup table name, field names
        }
      }],
      { include: '@commonTokens' }
    ],

    // Context for `rename` command.
    renameContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      // The pattern is `field AS new_field`.
      [/\b(as)\b/i, { token: 'keyword.spl-clause', next: '@asClause' }],
      // Field names, which can include wildcards.
      [/[a-zA-Z_][\w\-\.\*]*/, 'identifier'],
      { include: '@commonTokens' }
    ],

    // A temporary state to handle the field name after an "AS" clause.
    asClause: [
      [/\s+/, 'white'],
      // This token is the new field name (regular identifier). Then pop back.
      [/[a-zA-Z_][\w\-\.]+/, { token: 'identifier', next: '@pop' }],
      // If no field name, pop back to be safe.
      [/./, { token: '', next: '@pop' }]
    ],

    // Context for simple field lists (`table`, `fields`).
    fieldListContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      // Any word is just a field name. Wildcards are allowed.
      [/[a-zA-Z_][\w\-\.\*]*/, 'identifier'],
      { include: '@commonTokens' }
    ],

    // Context for other commands that have `name=value` arguments (`fillnull`, `bin`, etc.).
    generalContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      // Handle `argument=value` pairs, making the argument name green.
      [/([a-zA-Z_][\w\-]*)(=)/, ['identifier.spl-field-name', 'operator']],
      // Handle clauses like `BY`.
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@splClauses': 'keyword.spl-clause',
          '@default': 'identifier'
        }
      }],
      { include: '@commonTokens' }
    ],

    // A set of common token definitions used across multiple contexts.
    commonTokens: [
      [/".*?"/, 'string'],
      [/'[^']*'/, 'string'],
      [/\d[\d\.]*/, 'number'], // More robust number matching
      [/[{}()\[\]]/, '@brackets'],
      [/[=,><!+\-*\/%]+/, 'operator']
    ]
  }
};