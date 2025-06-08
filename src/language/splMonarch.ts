// src/language/splMonarch.ts
// Simple Monarch tokenizer for Splunk SPL
export const splLanguage = {
  defaultToken: 'source.spl', // Added default token
  tokenizer: {
    root: [
      // Pipe delimiter
      [/\|/, 'delimiter'],

      // SPL commands (blue)
      [
        /(search|stats|eval|where|table|fields|sort|head|top|rename|rex|spath|dedup|fillnull|lookup|join|transaction|eventstats|streamstats|bin|bucket|append|inputlookup|outputlookup|tstats|pivot|collect|delete|inputcsv|outputcsv|map|multisearch|return|sendemail|set|setfields|transpose|xyseries)\b/i, // Added case-insensitive flag
        'keyword.spl-command'
      ],

      // Aggregation functions (pink)
      [/(count|sum|avg|min|max|stdev|median|mode|values|list|first|last|earliest|latest|isnotnull|isnull)\b/i, // Added isnotnull, isnull, and case-insensitive flag
        'predefined.spl-agg'
      ],

      // Field assignments (green) - e.g. field=, type=
      // This rule must be placed before the general 'identifier' rule.
      // It looks for a word character, followed by any word characters or hyphens,
      // optionally followed by spaces, and then an equals sign.
      [/([a-zA-Z_][\w\-]*)\s*(=)/, ['identifier.spl-field-name', 'operator.assignment']], // Capture field name and '=' separately

      // Clause keywords (orange) - Removed 'where', ensured 'as' and 'by' are here
      [/(by|as|over|from|in|on|using|with|group|order|limit|filldown|fillnull|nodename|nodetype|nodestatus)\b/i,
        'keyword.spl-clause'],

      // Boolean and logical operators
      [/(AND|OR|NOT|IN|LIKE|IS|NULL|TRUE|FALSE)\b/i, 'operator.logical'], // More specific type

      // Comparison operators (often part of where clauses etc.)
      [/(?:!=|<=|>=|<|>|=)/, 'operator.comparison'],

      // Numbers
      [/\d+(\.\d+)?/, 'number'],

      // Strings
      [/".*?"/, 'string.double'],
      [/'[^']*'/, 'string.single'],


      // Brackets
      [/[{}()\[\]]/, '@brackets'],

      // Comments - Must be processed before identifiers if starting with #
      [/^\s*#.*$/, 'comment'], // Ensure it handles leading spaces

      // Identifiers (fields, values, etc.)
      // Should be fairly general but after specific keywords.
      [/[a-zA-Z_][\w\-]*/, 'identifier'],

      // Whitespace - good to have a rule for it, can be 'white' or ignored by not giving a type
      [/\s+/, 'white'],
    ],
  },
};
