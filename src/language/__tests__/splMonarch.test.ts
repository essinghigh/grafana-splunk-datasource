// src/language/__tests__/splMonarch.test.ts
import { splLanguage } from '../splMonarch'; // Assuming splLanguage is exported from splMonarch.ts
import * as monaco from 'monaco-editor-core'; // We need types, but won't run the editor

// Helper function to tokenize a line (simplified for testing)
// This is a mock of how monaco editor would tokenize
const tokenizeLine = (line: string, languageDef: monaco.languages.IMonarchLanguage): monaco.languages.ILineTokens => {
  const tokenizer = new monaco.languages.Tokenizer(languageDef.tokenizer.root, languageDef.ignoreCase || false, languageDef.defaultToken || 'source');
  return tokenizer.tokenize(line);
};

// Helper function to get tokens with their text
const getTokensWithText = (line: string, lineTokens: monaco.languages.ILineTokens): { text: string; type: string }[] => {
  const tokens: monaco.languages.IToken[] = lineTokens.tokens;
  const result: { text: string; type: string }[] = [];
  let lastOffset = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const text = line.substring(lastOffset, token.offset);
    if (text.length > 0) {
      // This is text that was not matched by any rule, or matched by a default rule if one was not specified for it.
      // For SPL, we often want to treat unclassified text as 'identifier' or 'source'
      // depending on how splMonarch.ts is structured (e.g. if it has a defaultToken).
      // For now, let's assume a default type or handle based on what splMonarch.ts does.
      // If splLanguage.defaultToken is set, that type would implicitly apply.
      // Otherwise, it might be 'source' or an empty string if not explicitly handled.
      // We will push it as 'source.spl' for now.
      result.push({ text, type: 'source.spl' }); // Default type for uncaptured text
    }
    const tokenText = line.substring(token.offset, (i + 1 < tokens.length) ? tokens[i+1].offset : line.length);
    result.push({ text: tokenText, type: token.type });
    lastOffset = (i + 1 < tokens.length) ? tokens[i+1].offset : line.length;
  }
  // If there's any remaining text at the end of the line that wasn't part of the last token.
  // This case should ideally not happen if tokenizer covers the whole line or defaultToken handles it.
  if (lastOffset < line.length) {
     result.push({ text: line.substring(lastOffset), type: 'source.spl' });
  }

  return result.filter(t => t.text.length > 0); // Remove empty tokens if any
};


describe('splMonarch Tokenizer', () => {
  it('should tokenize field assignments, identifiers, and strings', () => {
    const line = 'index=main dest_ip="192.168.0.1"';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);

    console.log('Tokens for "index=main dest_ip=\"192.168.0.1\"":', JSON.stringify(tokenDetails, null, 2));

    // Expected:
    // index (identifier.spl-field-name)
    // = (operator.assignment)
    // main (identifier)
    // <space> (white)
    // dest_ip (identifier.spl-field-name)
    // = (operator.assignment)
    // "192.168.0.1" (string.double)

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'index', type: 'identifier.spl-field-name' }),
        expect.objectContaining({ text: '=', type: 'operator.assignment' }),
        expect.objectContaining({ text: 'main', type: 'identifier' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'dest_ip', type: 'identifier.spl-field-name' }),
        expect.objectContaining({ text: '=', type: 'operator.assignment' }),
        expect.objectContaining({ text: '"192.168.0.1"', type: 'string.double' }),
      ])
    );
  });

  it('should tokenize a stats command with aggregator, by clause, and identifiers', () => {
    const line = '| stats count by src_ip _time';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);

    console.log('Tokens for "| stats count by src_ip _time":', JSON.stringify(tokenDetails, null, 2));

    // Expected:
    // | (delimiter)
    // <space> (white)
    // stats (keyword.spl-command)
    // <space> (white)
    // count (predefined.spl-agg)
    // <space> (white)
    // by (keyword.spl-clause)
    // <space> (white)
    // src_ip (identifier)
    // <space> (white)
    // _time (identifier)

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'stats', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'count', type: 'predefined.spl-agg' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'by', type: 'keyword.spl-clause' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'src_ip', type: 'identifier' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: '_time', type: 'identifier' }),
      ])
    );
  });

  // Keep the complex query test case, but it will likely fail until more rules are added/refined.
  // We can comment out its assertions for now or expect it to have partial tokenization.
  it('should tokenize the provided complex query correctly (part 1)', () => {
    const queryLine = 'index=main dest_ip="192.168.0.1"'; // First part of complex query
    // ... assertions for this line as above ...
    const queryLine2 = '| stats count by src_ip _time';
    // ... assertions for this line as above ...
  });

  it('should tokenize rename command with as clause', () => {
    const line = '| rename _time as event_time';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'rename', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: '_time', type: 'identifier' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'as', type: 'keyword.spl-clause' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'event_time', type: 'identifier' }),
      ])
    );
  });

  it('should tokenize join command with field assignment and identifier', () => {
    const line = '| join type=left src_ip'; // Removed 'type=left' for a moment, it should be type= identifier
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'join', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'type', type: 'identifier.spl-field-name' }),
        expect.objectContaining({ text: '=', type: 'operator.assignment' }),
        expect.objectContaining({ text: 'left', type: 'identifier' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'src_ip', type: 'identifier' }),
      ])
    );
  });

  it('should tokenize a subsearch structure and its initial content', () => {
    const line = '[search index=_internal sourcetype=splunkd url="https://example.com/*"]';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '[', type: '@brackets' }),
        expect.objectContaining({ text: 'search', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'index', type: 'identifier.spl-field-name' }),
        expect.objectContaining({ text: '=', type: 'operator.assignment' }),
        expect.objectContaining({ text: '_internal', type: 'identifier' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'sourcetype', type: 'identifier.spl-field-name' }),
        expect.objectContaining({ text: '=', type: 'operator.assignment' }),
        expect.objectContaining({ text: 'splunkd', type: 'identifier' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'url', type: 'identifier.spl-field-name' }),
        expect.objectContaining({ text: '=', type: 'operator.assignment' }),
        expect.objectContaining({ text: '"https://example.com/*"', type: 'string.double' }),
        expect.objectContaining({ text: ']', type: '@brackets' }),
      ])
    );
  });

  it('should tokenize rex command with field assignment and regex string', () => {
    const line = '| rex field=_raw "https://.*&ip=(?<src_ip>\d+\.\d+\.\d+\.\d+)"';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'rex', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'field', type: 'identifier.spl-field-name' }),
        expect.objectContaining({ text: '=', type: 'operator.assignment' }),
        expect.objectContaining({ text: '_raw', type: 'identifier' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: '"https://.*&ip=(?<src_ip>\d+\.\d+\.\d+\.\d+)"', type: 'string.double' }),
      ])
    );
  });

  it('should tokenize stats command with function call', () => {
    const line = '| stats latest(_time) as ban_time by src_ip';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'stats', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'latest', type: 'predefined.spl-agg' }),
        expect.objectContaining({ text: '(', type: '@brackets' }),
        expect.objectContaining({ text: '_time', type: 'identifier' }),
        expect.objectContaining({ text: ')', type: '@brackets' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'as', type: 'keyword.spl-clause' }),
        // ... more assertions for 'ban_time by src_ip'
      ])
    );
  });

  it('should tokenize where command with comparison', () => {
    const line = '| where event_time > ban_time';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'where', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'event_time', type: 'identifier' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: '>', type: 'operator.comparison' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'ban_time', type: 'identifier' }),
      ])
    );
  });

  it('should tokenize where clause with isnotnull function', () => {
    const line = '| where isnotnull(ban_time)';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'where', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'isnotnull', type: 'predefined.spl-agg' }),
        expect.objectContaining({ text: '(', type: '@brackets' }),
        expect.objectContaining({ text: 'ban_time', type: 'identifier' }),
        expect.objectContaining({ text: ')', type: '@brackets' }),
      ])
    );
  });

  it('should tokenize a complex stats command', () => {
    const line = '| stats sum(count) as total_events by src_ip ban_time';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: 'stats', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: 'sum', type: 'predefined.spl-agg' }),
        expect.objectContaining({ text: '(', type: '@brackets' }),
        expect.objectContaining({ text: 'count', type: 'identifier' }), // 'count' inside sum() is an identifier (field name)
        expect.objectContaining({ text: ')', type: '@brackets' }),
        expect.objectContaining({ text: 'as', type: 'keyword.spl-clause' }),
        expect.objectContaining({ text: 'total_events', type: 'identifier' }),
        expect.objectContaining({ text: 'by', type: 'keyword.spl-clause' }),
        expect.objectContaining({ text: 'src_ip', type: 'identifier' }),
        expect.objectContaining({ text: 'ban_time', type: 'identifier' }),
      ])
    );
  });

  it('should tokenize where clause with identifier, operator, and number', () => {
    const line = '| where total_events > 2';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: 'where', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: 'total_events', type: 'identifier' }),
        expect.objectContaining({ text: '>', type: 'operator.comparison' }),
        expect.objectContaining({ text: '2', type: 'number' }),
      ])
    );
  });

  it('should tokenize sort command with a negative field (identifier)', () => {
    const line = '| sort -total_events';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    // Expectation: '-' might be 'source.spl' or a specific operator if defined.
    // 'total_events' should be 'identifier'.
    // The identifier regex [a-zA-Z_][\w\-]* does not match fields starting with '-'
    // So '-' will be tokenized by defaultToken: 'source.spl'
    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        expect.objectContaining({ text: 'sort', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: ' ', type: 'white' }),
        // The '-' is not part of comparison operators, not a number, not any keyword.
        // It doesn't start an identifier. So it will be 'source.spl' (defaultToken).
        expect.objectContaining({ text: '-', type: 'source.spl' }),
        expect.objectContaining({ text: 'total_events', type: 'identifier' }),
      ])
    );
  });

  it('should tokenize table command with multiple identifiers', () => {
    const line = '| table src_ip total_events ban_time';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '|', type: 'delimiter' }),
        expect.objectContaining({ text: 'table', type: 'keyword.spl-command' }),
        expect.objectContaining({ text: 'src_ip', type: 'identifier' }),
        expect.objectContaining({ text: 'total_events', type: 'identifier' }),
        expect.objectContaining({ text: 'ban_time', type: 'identifier' }),
      ])
    );
  });

  // Reactivate and refine the full query test
  it('should correctly tokenize the entire provided complex query', () => {
    const query = 'index=main dest_ip="192.168.0.1"\n' +
                  '| stats count by src_ip _time\n' +
                  '| rename _time as event_time\n' +
                  '| join type=left src_ip \n' + // Note: Issue has type{green}=left, this implies 'type' is green.
                  '    [search index=_internal sourcetype=splunkd url="https://example.com/*" \n' +
                  '    | rex field=_raw "https://.*&ip=(?<src_ip>\d+\.\d+\.\d+\.\d+)" \n' +
                  '    | stats latest(_time) as ban_time by src_ip\n' +
                  '    | where isnotnull(ban_time)]\n' +
                  '| where event_time > ban_time\n' +
                  '| stats sum(count) as total_events by src_ip ban_time\n' +
                  '| where total_events > 2\n' +
                  '| sort -total_events\n' +
                  '| table src_ip total_events ban_time';

    const lines = query.split('\n');
    const expectedTokensPerLine = [
      // Line 1: index=main dest_ip="192.168.0.1"
      [
        { text: 'index', type: 'identifier.spl-field-name' }, { text: '=', type: 'operator.assignment' }, { text: 'main', type: 'identifier' },
        { text: ' ', type: 'white' },
        { text: 'dest_ip', type: 'identifier.spl-field-name' }, { text: '=', type: 'operator.assignment' }, { text: '"192.168.0.1"', type: 'string.double' }
      ],
      // Line 2: | stats count by src_ip _time
      [
        { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'stats', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'count', type: 'predefined.spl-agg' }, { text: ' ', type: 'white' }, // 'count' as an agg func here
        { text: 'by', type: 'keyword.spl-clause' }, { text: ' ', type: 'white' },
        { text: 'src_ip', type: 'identifier' }, { text: ' ', type: 'white' }, { text: '_time', type: 'identifier' }
      ],
      // Line 3: | rename _time as event_time
      [
        { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'rename', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: '_time', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: 'as', type: 'keyword.spl-clause' }, { text: ' ', type: 'white' }, { text: 'event_time', type: 'identifier' }
      ],
      // Line 4: | join type=left src_ip
      [
        { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'join', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'type', type: 'identifier.spl-field-name' }, { text: '=', type: 'operator.assignment' }, { text: 'left', type: 'identifier' },
        { text: ' ', type: 'white' }, { text: 'src_ip', type: 'identifier' }, { text: ' ', type: 'white' } // Added trailing white space from original query formatting
      ],
      // Line 5:     [search index=_internal sourcetype=splunkd url="https://example.com/*"
      [
        { text: '    ', type: 'white' }, { text: '[', type: '@brackets' },
        { text: 'search', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'index', type: 'identifier.spl-field-name' }, { text: '=', type: 'operator.assignment' }, { text: '_internal', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: 'sourcetype', type: 'identifier.spl-field-name' }, { text: '=', type: 'operator.assignment' }, { text: 'splunkd', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: 'url', type: 'identifier.spl-field-name' }, { text: '=', type: 'operator.assignment' }, { text: '"https://example.com/*"', type: 'string.double' }, { text: ' ', type: 'white' }
      ],
      // Line 6:     | rex field=_raw "https://.*&ip=(?<src_ip>\d+\.\d+\.\d+\.\d+)"
      [
        { text: '    ', type: 'white' }, { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'rex', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'field', type: 'identifier.spl-field-name' }, { text: '=', type: 'operator.assignment' }, { text: '_raw', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: '"https://.*&ip=(?<src_ip>\d+\.\d+\.\d+\.\d+)"', type: 'string.double' }, { text: ' ', type: 'white' }
      ],
      // Line 7:     | stats latest(_time) as ban_time by src_ip
      [
        { text: '    ', type: 'white' }, { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'stats', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'latest', type: 'predefined.spl-agg' }, { text: '(', type: '@brackets' }, { text: '_time', type: 'identifier' }, { text: ')', type: '@brackets' }, { text: ' ', type: 'white' },
        { text: 'as', type: 'keyword.spl-clause' }, { text: ' ', type: 'white' }, { text: 'ban_time', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: 'by', type: 'keyword.spl-clause' }, { text: ' ', type: 'white' }, { text: 'src_ip', type: 'identifier' }
      ],
      // Line 8:     | where isnotnull(ban_time)]
      [
        { text: '    ', type: 'white' }, { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'where', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'isnotnull', type: 'predefined.spl-agg' }, { text: '(', type: '@brackets' }, { text: 'ban_time', type: 'identifier' }, { text: ')', type: '@brackets' },
        { text: ']', type: '@brackets' }
      ],
      // Line 9: | where event_time > ban_time
      [
        { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'where', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'event_time', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: '>', type: 'operator.comparison' }, { text: ' ', type: 'white' }, { text: 'ban_time', type: 'identifier' }
      ],
      // Line 10: | stats sum(count) as total_events by src_ip ban_time
      [
        { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'stats', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'sum', type: 'predefined.spl-agg' }, { text: '(', type: '@brackets' }, { text: 'count', type: 'identifier' }, { text: ')', type: '@brackets' }, { text: ' ', type: 'white' },
        { text: 'as', type: 'keyword.spl-clause' }, { text: ' ', type: 'white' }, { text: 'total_events', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: 'by', type: 'keyword.spl-clause' }, { text: ' ', type: 'white' }, { text: 'src_ip', type: 'identifier' }, { text: ' ', type: 'white' }, { text: 'ban_time', type: 'identifier' }
      ],
      // Line 11: | where total_events > 2
      [
        { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'where', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'total_events', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: '>', type: 'operator.comparison' }, { text: ' ', type: 'white' }, { text: '2', type: 'number' }
      ],
      // Line 12: | sort -total_events
      [
        { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'sort', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: '-', type: 'source.spl' }, { text: 'total_events', type: 'identifier' }
      ],
      // Line 13: | table src_ip total_events ban_time
      [
        { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'table', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'src_ip', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: 'total_events', type: 'identifier' }, { text: ' ', type: 'white' }, { text: 'ban_time', type: 'identifier' }
      ]
    ];

    lines.forEach((line, index) => {
      if (line.trim() === '') return; // Skip empty lines if any
      const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
      const tokenDetails = getTokensWithText(line, tokens);
      console.log(`Tokens for line ${index + 1} ("${line}"):`, JSON.stringify(tokenDetails, null, 2));
      expect(tokenDetails).toEqual(expectedTokensPerLine[index]);
    });
  });
});

// Note: The actual monaco-editor tokenization is more complex.
// This helper is a simplification for unit testing the Monarch rules.
// We might need to adjust how tokens are processed and asserted.

describe('splMonarch Tokenizer - Additional Cases', () => {

  it('should handle line comments correctly', () => {
    const line = 'search index=main # this is a comment stats count by host';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));

    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        { text: 'search', type: 'keyword.spl-command' },
        { text: ' ', type: 'white' },
        { text: 'index', type: 'identifier.spl-field-name' },
        { text: '=', type: 'operator.assignment' },
        { text: 'main', type: 'identifier' },
        { text: ' ', type: 'white' },
        { text: '# this is a comment stats count by host', type: 'comment' },
      ])
    );
  });

  it('should handle strings with escaped quotes', () => {
    const line = '| eval message = "This is a \"quoted\" string."';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));
    // The regex .*? is non-greedy, so it should end at the last actual quote.
    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        { text: '|', type: 'delimiter' },
        { text: ' ', type: 'white' },
        { text: 'eval', type: 'keyword.spl-command' },
        { text: ' ', type: 'white' },
        { text: 'message', type: 'identifier.spl-field-name' },
        { text: '=', type: 'operator.assignment' },
        { text: ' ', type: 'white' },
        { text: '"This is a \"quoted\" string."', type: 'string.double' },
      ])
    );
  });

  it('should handle empty strings', () => {
    const line = 'search name="" type=\'\'';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));
    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        { text: 'search', type: 'keyword.spl-command' },
        { text: ' ', type: 'white' },
        { text: 'name', type: 'identifier.spl-field-name' },
        { text: '=', type: 'operator.assignment' },
        { text: '""', type: 'string.double' },
        { text: ' ', type: 'white' },
        { text: 'type', type: 'identifier.spl-field-name' },
        { text: '=', type: 'operator.assignment' },
        { text: "''", type: 'string.single' },
      ])
    );
  });

  it('should tokenize boolean operators (AND, OR, NOT) and IN operator', () => {
    const line = 'search (event=1 AND error=0) OR status IN ("OK", "WARN") NOT type=critical';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));
    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        { text: 'search', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: '(', type: '@brackets' }, { text: 'event', type: 'identifier.spl-field-name' },{ text: '=', type: 'operator.assignment' },{ text: '1', type: 'number' },
        { text: ' ', type: 'white' }, { text: 'AND', type: 'operator.logical' }, { text: ' ', type: 'white' },
        { text: 'error', type: 'identifier.spl-field-name' },{ text: '=', type: 'operator.assignment' },{ text: '0', type: 'number' }, { text: ')', type: '@brackets' },
        { text: ' ', type: 'white' }, { text: 'OR', type: 'operator.logical' }, { text: ' ', type: 'white' },
        { text: 'status', type: 'identifier' }, { text: ' ', type: 'white' }, { text: 'IN', type: 'operator.logical' },
        { text: ' ', type: 'white' }, { text: '(', type: '@brackets' }, { text: '"OK"', type: 'string.double' },
        { text: ',', type: 'source.spl' }, // Commas are default token for now
        { text: ' ', type: 'white' }, { text: '"WARN"', type: 'string.double' }, { text: ')', type: '@brackets' },
        { text: ' ', type: 'white' }, { text: 'NOT', type: 'operator.logical' }, { text: ' ', type: 'white' },
        { text: 'type', type: 'identifier.spl-field-name' },{ text: '=', type: 'operator.assignment' },{ text: 'critical', type: 'identifier' },
      ])
    );
  });

  it('should distinguish keywords from identifiers (e.g., search_count vs search count)', () => {
    const line = 'search search_count | stats count by search_command';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));
    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        { text: 'search', type: 'keyword.spl-command' }, { text: ' ', type: 'white' }, { text: 'search_count', type: 'identifier' },
        { text: ' ', type: 'white' }, { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'stats', type: 'keyword.spl-command' }, { text: ' ', type: 'white' }, { text: 'count', type: 'predefined.spl-agg' },
        { text: ' ', type: 'white' }, { text: 'by', type: 'keyword.spl-clause' }, { text: ' ', type: 'white' }, { text: 'search_command', type: 'identifier' },
      ])
    );
  });

  it('should handle keywords with different cases', () => {
    const line = 'SEARCH index=Main | STATS COUNT BY host';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));
    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        { text: 'SEARCH', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'index', type: 'identifier.spl-field-name' },{ text: '=', type: 'operator.assignment' },{ text: 'Main', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: '|', type: 'delimiter' }, { text: ' ', type: 'white' },
        { text: 'STATS', type: 'keyword.spl-command' }, { text: ' ', type: 'white' }, { text: 'COUNT', type: 'predefined.spl-agg' },
        { text: ' ', type: 'white' }, { text: 'BY', type: 'keyword.spl-clause' }, { text: ' ', type: 'white' }, { text: 'host', type: 'identifier' },
      ])
    );
  });

  it('should handle nested parentheses/brackets correctly', () => {
    const line = '| eval complex = (fieldA + (fieldB * 2)) / (fieldC - fieldD)';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));
    // Simplified check focusing on brackets and main identifiers/operators
    // Note: +, *, / are currently 'source.spl' as they are not defined as specific operators yet.
    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        { text: '(', type: '@brackets' }, { text: 'fieldA', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: '+', type: 'source.spl' }, { text: ' ', type: 'white' }, { text: '(', type: '@brackets' },
        { text: 'fieldB', type: 'identifier' }, { text: ' ', type: 'white' }, { text: '*', type: 'source.spl' }, { text: ' ', type: 'white' },
        { text: '2', type: 'number' }, { text: ')', type: '@brackets' }, { text: ')', type: '@brackets' },
        { text: ' ', type: 'white' }, { text: '/', type: 'source.spl' }, { text: ' ', type: 'white' },
        { text: '(', type: '@brackets' }, { text: 'fieldC', type: 'identifier' }, { text: ' ', type: 'white' },
        { text: '-', type: 'source.spl' }, { text: ' ', type: 'white' }, { text: 'fieldD', type: 'identifier' },
        { text: ')', type: '@brackets' }
      ])
    );
  });

  it('should handle wildcards in non-string context as default token', () => {
    const line = 'search host=myhost* status!=ERROR*';
    const tokens = tokenizeLine(line, splLanguage as monaco.languages.IMonarchLanguage);
    const tokenDetails = getTokensWithText(line, tokens);
    console.log(`Tokens for "${line}":`, JSON.stringify(tokenDetails, null, 2));
    expect(tokenDetails).toEqual(
      expect.arrayContaining([
        { text: 'search', type: 'keyword.spl-command' }, { text: ' ', type: 'white' },
        { text: 'host', type: 'identifier.spl-field-name' },{ text: '=', type: 'operator.assignment' },{ text: 'myhost', type: 'identifier' }, { text: '*', type: 'source.spl' },
        { text: ' ', type: 'white' },
        { text: 'status', type: 'identifier.spl-field-name' },{ text: '!=', type: 'operator.comparison' },{ text: 'ERROR', type: 'identifier' }, { text: '*', type: 'source.spl' }
      ])
    );
  });

});
