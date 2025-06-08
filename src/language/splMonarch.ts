// src/language/splMonarch.ts
// Simple Monarch tokenizer for Splunk SPL
export const splLanguage = {
  tokenizer: {
    root: [
      // Pipe delimiter
      [/\|/, 'delimiter'],

      // SPL commands (blue)
      [
        /(search|stats|eval|where|table|fields|sort|head|top|rename|rex|spath|dedup|fillnull|lookup|join|transaction|eventstats|streamstats|bin|bucket|append|inputlookup|outputlookup|tstats|pivot|collect|delete|inputcsv|outputcsv|map|multisearch|return|sendemail|set|setfields|transpose|xyseries)\b/,
        'keyword.spl-command'
      ],

      // Aggregation functions (pink)
      [/(count|sum|avg|min|max|stdev|median|mode|values|list|first|last|earliest|latest)\b/, 'predefined.spl-agg'],

      // Clause keywords (orange)
      [/(by|as|over|from|in|on|using|with|where|group|order|limit|filldown|fillnull|nodename|nodetype|nodestatus)\b/, 'keyword.spl-clause'],

      // Boolean and logical operators
      [/(AND|OR|NOT|IN|LIKE|IS|NULL|TRUE|FALSE)\b/i, 'operator'],

      // Numbers
      [/\d+(\.\d+)?/, 'number'],

      // Strings
      [/".*?"/, 'string'],
      [/'[^']*'/, 'string'],

      // Brackets
      [/[{}()\[\]]/, '@brackets'],

      // Comments
      [/#.*$/, 'comment'],

      // Identifiers (fields, etc)
      [/[a-zA-Z_][\w\-]*/, 'identifier'],
    ],
  },
};
