// src/language/splMonarch.ts
// Context-aware Monarch tokenizer for Splunk SPL

export const splLanguage = {
  defaultToken: 'source.spl',
  tokenizer: {
    root: [
      // Pipe delimiter - transitions to command context
      [/\|/, { token: 'delimiter', next: '@command' }],

      // Handle search command at the beginning of the query
      [/^(search)\s+/i, { token: 'keyword.spl-command', next: '@search' }],

      // Initial search without pipe
      [/^/, { token: '', next: '@search' }],
    ],

    // Command context - right after a pipe
    command: [
      // Whitespace
      [/\s+/, 'white'],

      // First word after pipe is always a command (blue) - with specific context transitions
      [/(stats|eventstats|streamstats)\b/i, { token: 'keyword.spl-command', next: '@statsContext' }],
      [/(eval)\b/i, { token: 'keyword.spl-command', next: '@evalContext' }],
      [/(table|fields)\b/i, { token: 'keyword.spl-command', next: '@fieldListContext' }],
      [/(search|where)\b/i, { token: 'keyword.spl-command', next: '@searchContext' }],
      
      // Any other word is treated as a command (blue) and goes to general context
      [/([a-zA-Z_][\w]*)\b/i, { token: 'keyword.spl-command', next: '@generalContext' }],

      // Default fallback (shouldn't be needed now)
      [/.*/, { token: 'identifier', next: '@generalContext' }],
    ],

    // Stats context - aggregation functions should be pink
    statsContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      
      // Any function followed by opening parenthesis (purple/pink)
      [/\b([a-zA-Z_][\w]*)\s*(?=\()/i, 'predefined.spl-function'],
      
      // Aggregation functions as bare words in stats context (pink)
      [/\b(count|sum|avg|min|max|stdev|median|mode|values|list|first|last|earliest|latest)\b/i, 'predefined.spl-agg'],
      
      // Field assignments (green)
      [/([a-zA-Z_][\w\-]*)\s*(=)/, ['identifier.spl-field-name', 'operator']],
      
      // Clause keywords (orange)
      [/(by|as|over)\b/i, 'keyword.spl-clause'],
      
      // Brackets
      [/[{}()\[\]]/, '@brackets'],
      
      // Strings
      [/".*?"/, 'string'],
      [/'[^']*'/, 'string'],
      
      // Numbers
      [/\d+(\.\d+)?/, 'number'],
      
      // Operators
      [/(?:!=|<=|>=|<|>|=|\+|\-|\*|\/|%)/, 'operator'],
      
      // Identifiers (field names)
      [/[a-zA-Z_][\w\-]*/, 'identifier'],
    ],

    // Field list context - aggregation function names should be regular identifiers (never colored as functions)
    fieldListContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      // Any function followed by opening parenthesis (purple/pink)
      [/\b([a-zA-Z_][\w]*)\s*(?=\()/i, 'predefined.spl-function'],
      // In field list context, count/sum/etc are just field names (uncolored)
      [/[a-zA-Z_][\w\-]*/, 'identifier'],
      // Other tokens
      [/[{}()\[\]]/, '@brackets'],
      [/".*?"/, 'string'],
      [/'[^']*'/, 'string'],
      [/\d+(\.\d+)?/, 'number'],
      [/(?:!=|<=|>=|<|>|=|\+|\-|\*|\/|%)/, 'operator'],
    ],

    // Eval context - more complex expressions
    evalContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      
      // Any function followed by opening parenthesis (purple/pink) - must come first
      [/\b([a-zA-Z_][\w]*)\s*(?=\()/i, 'predefined.spl-function'],
      
      // Field assignments: treat field names as plain identifiers (no special color)
      [/([a-zA-Z_][\w\-]*)\s*(=)/, ['identifier', 'operator']],
      
      // Clause keywords (orange)
      [/(by|as)\b/i, 'keyword.spl-clause'],
      
      // Boolean and logical operators (same color as clause keywords - orange)
      [/(AND|OR|NOT|IN|LIKE|IS|NULL|TRUE|FALSE)\b/i, 'keyword.spl-clause'],
      
      // Operators - must come before individual character matching
      [/(?:!=|<=|>=|<|>|=|\+|\-|\*|\/|%)/, 'operator'],
      
      // Numbers - must come before identifier matching
      [/\d+(\.\d+)?/, 'number'],
      
      // Strings
      [/".*?"/, 'string'],
      [/'[^']*'/, 'string'],
      
      // Brackets
      [/\[/, { token: '@brackets', next: '@subsearch' }],
      [/[{}()\]]/, '@brackets'],
      
      // Identifiers (variables, field references) - should be last specific rule
      [/[a-zA-Z_][\w\-]*/, 'identifier'],
      
      // Fallback for any remaining characters
      [/./, 'identifier'],
    ],

    // Search context - similar to eval but for search expressions
    searchContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      
      // Any function followed by opening parenthesis (purple/pink)
      [/\b([a-zA-Z_][\w]*)\s*(?=\()/i, 'predefined.spl-function'],
      
      // Field comparisons - treat as plain identifiers (no special color for field names in search/where)
      [/([a-zA-Z_][\w\-]*)\s*(=)/, ['identifier', 'operator']],
      
      // Boolean and logical operators (same color as clause keywords - orange)
      [/(AND|OR|NOT|IN|LIKE|IS|NULL|TRUE|FALSE)\b/i, 'keyword.spl-clause'],
      
      // Operators - must come before individual character matching
      [/(?:!=|<=|>=|<|>|=|\+|\-|\*|\/|%)/, 'operator'],
      
      // Numbers - must come before identifier matching
      [/\d+(\.\d+)?/, 'number'],
      
      // Strings
      [/".*?"/, 'string'],
      [/'[^']*'/, 'string'],
      
      // Brackets (including subsearch)
      [/\[/, { token: '@brackets', next: '@subsearch' }],
      [/[{}()\]]/, '@brackets'],
      
      // Identifiers - should be last specific rule
      [/[a-zA-Z_][\w\-]*/, 'identifier'],
      
      // Fallback for any remaining characters
      [/./, 'identifier'],
    ],

    // General context for other commands
    generalContext: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      
      // Any function followed by opening parenthesis (purple/pink)
      [/\b([a-zA-Z_][\w]*)\s*(?=\()/i, 'predefined.spl-function'],
      
      // Field assignments (green) - must come before general identifier matching
      [/([a-zA-Z_][\w\-]*)\s*(=)/, ['identifier.spl-field-name', 'operator']],
      
      // Clause keywords (orange)
      [/(by|as|over|from|in|on|using|with|group|order|limit|filldown|fillnull|nodename|nodetype|nodestatus)\b/i, 'keyword.spl-clause'],
      
      // Boolean and logical operators (same color as clause keywords - orange)
      [/(AND|OR|NOT|IN|LIKE|IS|NULL|TRUE|FALSE)\b/i, 'keyword.spl-clause'],
      
      // Operators (all types) - must come before individual character matching
      [/(?:!=|<=|>=|<|>|=|\+|\-|\*|\/|%)/, 'operator'],
      
      // Numbers - must come before identifier matching
      [/\d+(\.\d+)?/, 'number'],
      
      // Strings
      [/".*?"/, 'string'],
      [/'[^']*'/, 'string'],
      
      // Comments
      [/^\s*#.*$/, 'comment'],
      
      // Brackets
      [/\[/, { token: '@brackets', next: '@subsearch' }],
      [/[{}()\]]/, '@brackets'],
      
      // Identifiers - should be last specific rule
      [/[a-zA-Z_][\w\-]*/, 'identifier'],
      
      // Fallback for any remaining characters
      [/./, 'identifier'],
    ],

    // Subsearch context
    subsearch: [
      [/\]/, { token: '@brackets', next: '@pop' }],
      [/\s+/, 'white'],
      // Pipe delimiter - transitions to command context within subsearch
      [/\|/, { token: 'delimiter', next: '@command' }],
      // Special handling for search command at start of subsearch
      [/\s*(search)\b/i, 'keyword.spl-command'],
      // Any function followed by opening parenthesis (purple/pink)
      [/\b([a-zA-Z_][\w]*)\s*(?=\()/i, 'predefined.spl-function'],
      // Search constraints (field=value) - treat as regular identifiers, not field assignments
      // These are search terms within subsearch, not command arguments
      [/([a-zA-Z_][\w\-]*)\s*(=)/, ['identifier', 'operator']],
      // Aggregation functions as bare words in stats context (pink)
      [/\b(count|sum|avg|min|max|stdev|median|mode|values|list|first|last|earliest|latest)\b/i, 'predefined.spl-agg'],
      // Clause keywords (orange)
      [/(by|as)\b/i, 'keyword.spl-clause'],
      // Operators - must come before individual character matching
      [/(?:!=|<=|>=|<|>|=|\+|\-|\*|\/|%)/, 'operator'],
      // Numbers - must come before identifier matching
      [/\d+(\.\d+)?/, 'number'],
      // Strings
      [/".*?"/, 'string'],
      [/'[^']*'/, 'string'],
      // Other tokens
      [/[{}()]/, '@brackets'],
      // Identifiers - should be last specific rule
      [/[a-zA-Z_][\w\-]*/, 'identifier'],
      // Fallback for any remaining characters
      [/./, 'identifier'],
    ],

    // Initial search context (no pipe at start)
    search: [
      [/\s+/, 'white'],
      [/\|/, { token: 'delimiter', next: '@command' }],
      
      // Search constraints (field=value) - treat as regular identifiers, not field assignments
      // These are search terms, not command arguments, so field names should not be highlighted
      [/([a-zA-Z_][\w\-]*)\s*(=)/, ['identifier', 'operator']],
      
      // Boolean and logical operators (same color as clause keywords - orange)
      [/(AND|OR|NOT|IN|LIKE|IS|NULL|TRUE|FALSE)\b/i, 'keyword.spl-clause'],
      
      // Comparison operators
      [/(?:!=|<=|>=|<|>|=)/, 'operator'],
      
      // Strings
      [/".*?"/, 'string'],
      [/'[^']*'/, 'string'],
      
      // Numbers
      [/\d+(\.\d+)?/, 'number'],
      
      // Identifiers
      [/[a-zA-Z_][\w\-]*/, 'identifier'],
    ],
  },
};
