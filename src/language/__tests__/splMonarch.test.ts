// src/language/__tests__/splMonarch.test.ts
import { splLanguage } from '../splMonarch';

describe('splMonarch Language Definition', () => {
  it('should have a valid language definition structure', () => {
    expect(splLanguage).toBeDefined();
    expect(splLanguage.tokenizer).toBeDefined();
    expect(splLanguage.tokenizer.root).toBeInstanceOf(Array);
    expect(splLanguage.defaultToken).toBe('source.spl');
  });

  it('should have context-aware tokenizer states', () => {
    // Should have different contexts for different SPL contexts
    expect(splLanguage.tokenizer.statsContext).toBeDefined();
    expect(splLanguage.tokenizer.fieldListContext).toBeDefined();
    expect(splLanguage.tokenizer.evalContext).toBeDefined();
    expect(splLanguage.tokenizer.command).toBeDefined();
  });

  it('should have aggregation function rules in stats context', () => {
    const statsRules = splLanguage.tokenizer.statsContext;
    
    // Look for the specific rule that matches bare count/sum/etc without parentheses
    const aggRule = statsRules.find(rule => 
      Array.isArray(rule) && 
      rule[0] instanceof RegExp &&
      rule[1] === 'predefined.spl-agg' &&
      !(rule[0] as RegExp).toString().includes('\\(')
    );
    
    expect(aggRule).toBeDefined();
    
    // Test that count, sum, etc. are recognized as aggregation functions in stats context
    const regex = aggRule![0] as RegExp;
    expect(regex.test('count')).toBe(true);
    expect(regex.test('sum')).toBe(true);
    expect(regex.test('avg')).toBe(true);
  });

  it('should NOT have aggregation function rules in field list context', () => {
    const fieldListRules = splLanguage.tokenizer.fieldListContext;
    const aggRule = fieldListRules.find(rule => 
      Array.isArray(rule) && 
      rule[1] === 'predefined.spl-agg'
    );
    expect(aggRule).toBeUndefined();
  });

  it('should handle field assignments correctly', () => {
    const statsRules = splLanguage.tokenizer.statsContext;
    const fieldAssignRule = statsRules.find(rule => 
      Array.isArray(rule) && 
      Array.isArray(rule[1]) &&
      rule[1].includes('identifier.spl-field-name')
    );
    expect(fieldAssignRule).toBeDefined();
  });

  it('should handle clause keywords correctly', () => {
    const statsRules = splLanguage.tokenizer.statsContext;
    const clauseRule = statsRules.find(rule => 
      Array.isArray(rule) && 
      rule[1] === 'keyword.spl-clause'
    );
    expect(clauseRule).toBeDefined();
    
    // Test that by, as, etc. are recognized as clause keywords
    const regex = clauseRule![0] as RegExp;
    expect(regex.test('by')).toBe(true);
    expect(regex.test('as')).toBe(true);
  });

  describe('Context-sensitive aggregation function highlighting', () => {
    it('should distinguish between stats context and field list context', () => {
      // In stats context, aggregation functions should be highlighted
      const statsContext = splLanguage.tokenizer.statsContext;
      const statsAggRule = statsContext.find(rule => 
        Array.isArray(rule) && rule[1] === 'predefined.spl-agg'
      );
      expect(statsAggRule).toBeDefined();

      // In field list context, aggregation function names should be treated as identifiers
      const fieldListContext = splLanguage.tokenizer.fieldListContext;
      const fieldListAggRule = fieldListContext.find(rule => 
        Array.isArray(rule) && rule[1] === 'predefined.spl-agg'
      );
      expect(fieldListAggRule).toBeUndefined();
      
      // Should have identifier rule instead
      const identifierRule = fieldListContext.find(rule => 
        Array.isArray(rule) && rule[1] === 'identifier'
      );
      expect(identifierRule).toBeDefined();
    });

    it('should transition to correct contexts based on commands', () => {
      const commandRules = splLanguage.tokenizer.command;
      
      // Stats commands should transition to stats context
      const statsRule = commandRules.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp &&
        (rule[0] as RegExp).test('stats') &&
        typeof rule[1] === 'object' &&
        (rule[1] as any).next === '@statsContext'
      );
      expect(statsRule).toBeDefined();

      // Table/fields commands should transition to field list context
      const tableRule = commandRules.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp &&
        (rule[0] as RegExp).test('table') &&
        typeof rule[1] === 'object' &&
        (rule[1] as any).next === '@fieldListContext'
      );
      expect(tableRule).toBeDefined();
    });
  });

  describe('Real SPL query tokenization scenarios', () => {
    it('should handle complex SPL query with context switches', () => {
      // This test validates that our context-aware tokenizer has the right rules
      // For a query like: search error | stats count by status | table count status
      
      // Validate that stats context has aggregation function highlighting
      const statsContext = splLanguage.tokenizer.statsContext;
      expect(statsContext.some(rule => 
        Array.isArray(rule) && rule[1] === 'predefined.spl-agg'
      )).toBe(true);
      
      // Validate that field list context does NOT have aggregation function highlighting
      const fieldListContext = splLanguage.tokenizer.fieldListContext;
      expect(fieldListContext.some(rule => 
        Array.isArray(rule) && rule[1] === 'predefined.spl-agg'
      )).toBe(false);
      
      // Validate that field list context treats everything as identifiers
      expect(fieldListContext.some(rule => 
        Array.isArray(rule) && rule[1] === 'identifier'
      )).toBe(true);
    });
  });

  describe('Specific use case validation', () => {
    it('should handle the exact scenario: stats count vs table count', () => {
      // This tests the exact scenario mentioned in the conversation
      
      // In stats context: count should be treated as aggregation function
      // Look for the specific rule that matches bare count/sum/etc without parentheses
      const statsContext = splLanguage.tokenizer.statsContext;
      const statsAggRule = statsContext.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp &&
        rule[1] === 'predefined.spl-agg' &&
        !(rule[0] as RegExp).toString().includes('\\(')
      );
      
      expect(statsAggRule).toBeDefined();
      const statsRegex = statsAggRule![0] as RegExp;
      expect(statsRegex.test('count')).toBe(true);
      
      // In field list context: count should NOT be treated as aggregation function
      const fieldListContext = splLanguage.tokenizer.fieldListContext;
      const fieldListAggRule = fieldListContext.find(rule => 
        Array.isArray(rule) && 
        rule[1] === 'predefined.spl-agg'
      );
      expect(fieldListAggRule).toBeUndefined();
      
      // Instead, it should be treated as a regular identifier
      const identifierRule = fieldListContext.find(rule => 
        Array.isArray(rule) && 
        rule[1] === 'identifier'
      );
      expect(identifierRule).toBeDefined();
      const identifierRegex = identifierRule![0] as RegExp;
      expect(identifierRegex.test('count')).toBe(true);
    });
  });

  describe('Function detection across contexts', () => {
    it('should detect isnotnull as a function in all contexts', () => {
      // Test that isnotnull function rule exists in relevant contexts
      const searchRules = splLanguage.tokenizer.searchContext;
      const evalRules = splLanguage.tokenizer.evalContext;
      const statsRules = splLanguage.tokenizer.statsContext;
      const generalRules = splLanguage.tokenizer.generalContext;
      
      // Check for always-function rule in each context
      [searchRules, evalRules, statsRules, generalRules].forEach(rules => {
        const funcRule = rules.find(rule => 
          Array.isArray(rule) && 
          rule[0] instanceof RegExp &&
          rule[1] === 'predefined.spl-function'
        );
        expect(funcRule).toBeDefined();
        const regex = funcRule![0] as RegExp;
        expect(regex.test('isnotnull')).toBe(true);
      });
    });

    it('should handle operators across contexts', () => {
      // Check that all contexts have operator rules
      [splLanguage.tokenizer.searchContext, splLanguage.tokenizer.evalContext, 
       splLanguage.tokenizer.statsContext, splLanguage.tokenizer.generalContext].forEach(rules => {
        const operatorRule = rules.find(rule => 
          Array.isArray(rule) && 
          rule[0] instanceof RegExp &&
          rule[1] === 'operator'
        );
        expect(operatorRule).toBeDefined();
        const regex = operatorRule![0] as RegExp;
        expect(regex.test('>')).toBe(true);
        expect(regex.test('=')).toBe(true);
        expect(regex.test('*')).toBe(true);
      });
    });

    it('should handle numbers in all contexts', () => {
      // Check that all contexts have number rules
      [splLanguage.tokenizer.searchContext, splLanguage.tokenizer.evalContext, 
       splLanguage.tokenizer.statsContext, splLanguage.tokenizer.generalContext].forEach(rules => {
        const numberRule = rules.find(rule => 
          Array.isArray(rule) && 
          rule[0] instanceof RegExp &&
          rule[1] === 'number'
        );
        expect(numberRule).toBeDefined();
        const regex = numberRule![0] as RegExp;
        expect(regex.test('100')).toBe(true);
        expect(regex.test('2.5')).toBe(true);
      });
    });

    it('should distinguish field names from field assignments', () => {
      // Check field assignment rules exist
      const generalRules = splLanguage.tokenizer.generalContext;
      const fieldAssignRule = generalRules.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp &&
        Array.isArray(rule[1]) &&
        rule[1].includes('identifier.spl-field-name')
      );
      expect(fieldAssignRule).toBeDefined();
      
      const regex = fieldAssignRule![0] as RegExp;
      expect(regex.test('type=')).toBe(true);
      expect(regex.test('field=')).toBe(true);
      expect(regex.test('src_ip')).toBe(false); // Should not match plain field names
    });
  });

  describe('Fixes for highlighting issues', () => {
    it('should handle subsearch command highlighting correctly', () => {
      // Validate subsearch context has the right structure
      const subsearchContext = splLanguage.tokenizer.subsearch;
      
      // Should have a specific rule for the search command
      const searchCommandRule = subsearchContext.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp &&
        (rule[0] as RegExp).test('search') &&
        rule[1] === 'keyword.spl-command'
      );
      expect(searchCommandRule).toBeDefined();
      
      // Should handle pipe delimiter correctly
      const pipeRule = subsearchContext.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp && 
        (rule[0] as RegExp).test('|') &&
        typeof rule[1] === 'object' &&
        (rule[1] as any).token === 'delimiter'
      );
      expect(pipeRule).toBeDefined();
      
      // Aggregation functions should only be highlighted when used with parentheses
      const aggFuncRule = subsearchContext.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp &&
        rule[1] === 'predefined.spl-agg'
      );
      expect(aggFuncRule).toBeDefined();
      const aggRegex = aggFuncRule![0] as RegExp;
      expect(aggRegex.test('count(')).toBe(true);
      expect(aggRegex.test('count')).toBe(false);
    });
    
    it('should handle field assignments vs special keywords correctly', () => {
      // Validate search context has special handling for index= etc.
      const searchContext = splLanguage.tokenizer.search;
      
      // Should have a rule that doesn't highlight index= in green
      const specialKeywordRule = searchContext.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp &&
        (rule[0] as RegExp).test('index=') &&
        Array.isArray(rule[1]) &&
        rule[1][0] === 'identifier'
      );
      expect(specialKeywordRule).toBeDefined();
      
      // Should still highlight custom assignments in green
      const fieldAssignmentRule = searchContext.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp &&
        (rule[0] as RegExp).test('customfield=') &&
        Array.isArray(rule[1]) &&
        rule[1][0] === 'identifier.spl-field-name'
      );
      expect(fieldAssignmentRule).toBeDefined();
    });
    
    it('should handle count inside sum() correctly', () => {
      // Validate that in all contexts, count inside sum() won't be pink
      // This is because we now only make aggregation functions pink when followed by parentheses
      
      const statsContext = splLanguage.tokenizer.statsContext;
      const generalContext = splLanguage.tokenizer.generalContext;
      
      // First check that sum( is detected as an aggregation function
      [statsContext, generalContext].forEach(context => {
        const aggRule = context.find(rule => 
          Array.isArray(rule) && 
          rule[0] instanceof RegExp &&
          rule[1] === 'predefined.spl-agg'
        );
        expect(aggRule).toBeDefined();
        const regex = aggRule![0] as RegExp;
        expect(regex.test('sum(')).toBe(true);
      });
      
      // Any count that's not followed by ( shouldn't match the agg function pattern in contexts
      // except statsContext where we intentionally keep it pink to match Splunk
      const generalAggRule = generalContext.find(rule => 
        Array.isArray(rule) && 
        rule[0] instanceof RegExp &&
        rule[1] === 'predefined.spl-agg'
      );
      const generalRegex = generalAggRule![0] as RegExp;
      expect(generalRegex.test('count')).toBe(false); // Should not match without parentheses
    });
  });
});
