import {
  check,
  extractNumbers,
  extractTickers,
  numbersFromToolResults,
  tickersFromToolResults
} from '../verification/hallucination-detector';
import type { ToolCallResult } from '../verification/verification.types';

describe('HallucinationDetector', () => {
  describe('extractNumbers', () => {
    it('should extract dollar amounts', () => {
      const result = extractNumbers('The portfolio is worth $1,234.56');
      expect(result[0].value).toBe(1234.56);
      expect(result[0].raw).toBe('$1,234.56');
    });

    it('should extract multiple dollar amounts', () => {
      const result = extractNumbers('Bought at $150.00, now worth $175.50');
      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(150);
      expect(result[1].value).toBe(175.5);
    });

    it('should extract percentages', () => {
      const result = extractNumbers('Performance: -3.2% YTD and +12.5% 1Y');
      const values = result.map((r) => r.value);
      expect(values).toContain(-3.2);
      expect(values).toContain(12.5);
    });

    it('should extract plain comma-separated numbers', () => {
      const result = extractNumbers('Total of 1,500.75 shares traded');
      expect(result.some((r) => r.value === 1500.75)).toBe(true);
    });

    it('should extract decimal plain numbers', () => {
      const result = extractNumbers('The ratio is 0.85 overall');
      expect(result.some((r) => r.value === 0.85)).toBe(true);
    });

    it('should ignore ordinals', () => {
      const result = extractNumbers('The 1st and 2nd quartile');
      const values = result.map((r) => r.value);
      expect(values).not.toContain(1);
      expect(values).not.toContain(2);
    });

    it('should return empty array for text without numbers', () => {
      expect(extractNumbers('No numbers here at all')).toHaveLength(0);
    });

    it('should handle large dollar amounts', () => {
      const result = extractNumbers('Portfolio value: $3,000,000.00');
      expect(result[0].value).toBe(3000000);
    });
  });

  describe('extractTickers', () => {
    it('should extract valid ticker symbols', () => {
      const result = extractTickers('Holdings include AAPL, MSFT, and NVDA');
      expect(result).toContain('AAPL');
      expect(result).toContain('MSFT');
      expect(result).toContain('NVDA');
    });

    it('should filter out common English words', () => {
      const result = extractTickers('THE TOTAL VALUE OF ALL HOLDINGS IS HIGH');
      expect(result).not.toContain('THE');
      expect(result).not.toContain('ALL');
      expect(result).not.toContain('HIGH');
      expect(result).not.toContain('TOTAL');
      expect(result).not.toContain('VALUE');
    });

    it('should filter out financial acronyms in COMMON_WORDS', () => {
      const result = extractTickers('ETF on NYSE with USD denomination');
      expect(result).not.toContain('ETF');
      expect(result).not.toContain('NYSE');
      expect(result).not.toContain('USD');
    });

    it('should return empty for text with no uppercase words', () => {
      expect(extractTickers('all lowercase text here')).toHaveLength(0);
    });

    it('should handle single-character tickers', () => {
      const result = extractTickers('Company X trades at $50');
      // "X" is not in COMMON_WORDS, so it should be extracted
      expect(result).toContain('X');
    });

    it('should deduplicate tickers', () => {
      const result = extractTickers('AAPL went up, AAPL is strong');
      expect(result.filter((t) => t === 'AAPL')).toHaveLength(1);
    });
  });

  describe('numbersFromToolResults', () => {
    it('should extract numbers from JSON tool results', () => {
      const toolResults: ToolCallResult[] = [
        {
          toolName: 'portfolio_summary',
          result: JSON.stringify({ totalValue: 50000, holdings: [{ value: 25000 }] })
        }
      ];
      const numbers = numbersFromToolResults(toolResults);
      expect(numbers.has(50000)).toBe(true);
      expect(numbers.has(25000)).toBe(true);
    });

    it('should extract numbers from string values in JSON', () => {
      const toolResults: ToolCallResult[] = [
        {
          toolName: 'portfolio_summary',
          result: JSON.stringify({ totalValue: '$1,500.00' })
        }
      ];
      const numbers = numbersFromToolResults(toolResults);
      expect(numbers.has(1500)).toBe(true);
    });

    it('should derive sums of number pairs', () => {
      const toolResults: ToolCallResult[] = [
        {
          toolName: 'test',
          result: JSON.stringify({ a: 100, b: 200 })
        }
      ];
      const numbers = numbersFromToolResults(toolResults);
      expect(numbers.has(300)).toBe(true);
    });

    it('should derive percentage relationships', () => {
      const toolResults: ToolCallResult[] = [
        {
          toolName: 'test',
          result: JSON.stringify({ total: 1000, part: 250 })
        }
      ];
      const numbers = numbersFromToolResults(toolResults);
      // 250/1000 * 100 = 25
      expect(numbers.has(25)).toBe(true);
    });

    it('should fall back to raw string extraction for non-JSON', () => {
      const toolResults: ToolCallResult[] = [
        {
          toolName: 'test',
          result: 'The price is $42.50 with 3.5% yield'
        }
      ];
      const numbers = numbersFromToolResults(toolResults);
      expect(numbers.has(42.5)).toBe(true);
      expect(numbers.has(3.5)).toBe(true);
    });

    it('should handle empty tool results', () => {
      const numbers = numbersFromToolResults([]);
      expect(numbers.size).toBe(0);
    });
  });

  describe('tickersFromToolResults', () => {
    it('should extract tickers from JSON tool results', () => {
      const toolResults: ToolCallResult[] = [
        {
          toolName: 'portfolio_summary',
          result: JSON.stringify({
            holdings: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }]
          })
        }
      ];
      const tickers = tickersFromToolResults(toolResults);
      expect(tickers.has('AAPL')).toBe(true);
      expect(tickers.has('MSFT')).toBe(true);
    });

    it('should extract tickers used as object keys', () => {
      const toolResults: ToolCallResult[] = [
        {
          toolName: 'test',
          result: JSON.stringify({ NVDA: { price: 800 }, TSLA: { price: 250 } })
        }
      ];
      const tickers = tickersFromToolResults(toolResults);
      expect(tickers.has('NVDA')).toBe(true);
      expect(tickers.has('TSLA')).toBe(true);
    });

    it('should fall back to raw string extraction for non-JSON', () => {
      const toolResults: ToolCallResult[] = [
        { toolName: 'test', result: 'Top holdings: AAPL, GOOG, AMZN' }
      ];
      const tickers = tickersFromToolResults(toolResults);
      expect(tickers.has('AAPL')).toBe(true);
      expect(tickers.has('GOOG')).toBe(true);
      expect(tickers.has('AMZN')).toBe(true);
    });

    it('should handle empty tool results', () => {
      const tickers = tickersFromToolResults([]);
      expect(tickers.size).toBe(0);
    });
  });

  describe('check', () => {
    const makeToolResult = (data: Record<string, unknown>): ToolCallResult[] => [
      { toolName: 'portfolio_summary', result: JSON.stringify(data) }
    ];

    it('should return valid when all numbers match tool data', () => {
      const toolResults = makeToolResult({ totalValue: 50000, change: 5.2 });
      const result = check(
        'Your portfolio is worth $50,000 with a 5.2% return.',
        toolResults
      );
      expect(result.isValid).toBe(true);
      expect(result.unsupportedClaims).toHaveLength(0);
    });

    it('should flag fabricated dollar amounts', () => {
      const toolResults = makeToolResult({ totalValue: 50000 });
      const result = check(
        'Your portfolio is worth $99,999.',
        toolResults
      );
      expect(result.isValid).toBe(false);
      expect(result.unsupportedClaims.length).toBeGreaterThan(0);
      expect(result.unsupportedClaims[0]).toContain('$99,999');
    });

    it('should allow numbers within rounding tolerance', () => {
      const toolResults = makeToolResult({ totalValue: 50000 });
      // 50100 is within 2% of 50000
      const result = check('The portfolio is worth $50,100.', toolResults);
      expect(result.isValid).toBe(true);
    });

    it('should flag fabricated ticker symbols', () => {
      const toolResults: ToolCallResult[] = [
        {
          toolName: 'portfolio_summary',
          result: JSON.stringify({ holdings: [{ symbol: 'AAPL' }] })
        }
      ];
      const result = check('Consider AAPL and ZZZQ for diversification.', toolResults);
      expect(result.isValid).toBe(false);
      expect(result.unsupportedClaims).toEqual(
        expect.arrayContaining([expect.stringContaining('ZZZQ')])
      );
    });

    it('should return valid with empty tool results', () => {
      const result = check('Any response text here with $100.', []);
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe('medium');
    });

    it('should return high confidence when numbers match and are present', () => {
      const toolResults = makeToolResult({ price: 150.5 });
      const result = check('The price is $150.50.', toolResults);
      expect(result.confidence).toBe('high');
    });

    it('should return medium confidence with 1-2 unsupported claims', () => {
      const toolResults = makeToolResult({ price: 150 });
      const result = check('The price is $150 but also $999.', toolResults);
      expect(result.confidence).toBe('medium');
    });

    it('should return low confidence with 3+ unsupported claims', () => {
      const toolResults = makeToolResult({ price: 150 });
      const result = check(
        'Prices: $999, $888, $777 are all fabricated.',
        toolResults
      );
      expect(result.confidence).toBe('low');
    });

    it('should handle response with no numbers or tickers', () => {
      const toolResults = makeToolResult({ totalValue: 50000 });
      const result = check(
        'Your portfolio looks diversified overall.',
        toolResults
      );
      expect(result.isValid).toBe(true);
    });

    it('should validate derived sum values', () => {
      const toolResults = makeToolResult({ a: 1000, b: 2000 });
      // 3000 = 1000 + 2000 (derived sum)
      const result = check('The combined value is $3,000.', toolResults);
      expect(result.isValid).toBe(true);
    });
  });
});
