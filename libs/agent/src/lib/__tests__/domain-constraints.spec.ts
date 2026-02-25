import { check } from '../verification/domain-constraints';

describe('DomainConstraintChecker', () => {
  describe('forbidden patterns — buy/sell recommendations', () => {
    it('should flag "you should buy"', () => {
      const result = check('You should buy AAPL right now.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('buy/sell')])
      );
    });

    it('should flag "you should sell"', () => {
      const result = check('You should sell your TSLA position.');
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should flag "I recommend buying"', () => {
      const result = check('I recommend buying more NVDA shares.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('recommendation')])
      );
    });

    it('should flag "I recommend selling"', () => {
      const result = check('I recommend selling all tech stocks.');
      expect(result.passed).toBe(false);
    });

    it('should flag "sell immediately"', () => {
      const result = check('You need to sell immediately before it drops.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('Urgency')])
      );
    });

    it('should flag "buy now"', () => {
      const result = check('Buy now while the price is low!');
      expect(result.passed).toBe(false);
    });

    it('should flag "must buy" / "must sell"', () => {
      const result = check('You must buy this stock before earnings.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('Imperative')])
      );
    });
  });

  describe('forbidden patterns — price targets', () => {
    it('should flag specific price target predictions', () => {
      const result = check('The stock will reach $500 by end of year.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('price target')])
      );
    });

    it('should flag stated price targets', () => {
      const result = check('My price target is $200 for this stock.');
      expect(result.passed).toBe(false);
    });
  });

  describe('forbidden patterns — guaranteed outcomes', () => {
    it('should flag guaranteed returns', () => {
      const result = check('This strategy offers guaranteed returns of 10%.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('Guaranteed')])
      );
    });

    it('should flag "you will make" with specific numbers', () => {
      const result = check('You will make 50% profit on this trade.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('Promised')])
      );
    });

    it('should flag risk-free claims', () => {
      const result = check('This is a risk-free investment opportunity.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('Risk-free')])
      );
    });

    it('should flag infallibility claims', () => {
      const result = check("This strategy can't lose in the long run.");
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('Infallibility')])
      );
    });
  });

  describe('forbidden patterns — copy-trade advice', () => {
    it('should flag "copy Pelosi trades"', () => {
      const result = check('You should copy Pelosi trades for maximum gains.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('Copy-trade')])
      );
    });

    it('should flag "trade like Tuberville"', () => {
      const result = check('Trade like Tuberville to beat the market.');
      expect(result.passed).toBe(false);
    });

    it('should flag "follow their trades"', () => {
      const result = check('I suggest you follow their trades closely.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('Follow-trade')])
      );
    });

    it('should flag "replicate their strategy"', () => {
      const result = check('You could replicate their strategy easily.');
      expect(result.passed).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([expect.stringContaining('Replicate-trade')])
      );
    });
  });

  describe('clean responses — should pass', () => {
    it('should pass an analytical response with disclaimer and confidence', () => {
      const response = [
        'The Pelosi portfolio is worth $3,200,000 with 47 holdings.',
        'Top holding: AAPL at 15.2% allocation.',
        'I am not a financial advisor. This is informational analysis only, not investment advice.',
        '[Confidence: High]'
      ].join('\n');
      const result = check(response);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.missingElements).toHaveLength(0);
    });

    it('should pass a response without financial data (no disclaimer needed)', () => {
      const result = check(
        'I can help you analyze your portfolio. What would you like to know?'
      );
      expect(result.passed).toBe(true);
      expect(result.missingElements).toHaveLength(0);
    });

    it('should pass a plain refusal response', () => {
      const result = check(
        'I can only provide factual portfolio analysis, not investment advice.'
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('missing elements', () => {
    it('should flag missing disclaimer when response contains dollar amounts', () => {
      const result = check(
        'The portfolio is worth $50,000. [Confidence: High]'
      );
      expect(result.passed).toBe(false);
      expect(result.missingElements).toEqual(
        expect.arrayContaining([expect.stringContaining('disclaimer')])
      );
    });

    it('should flag missing confidence when response contains percentages', () => {
      const result = check(
        'YTD return is 12.5%. I am not a financial advisor. This is informational analysis only, not investment advice.'
      );
      expect(result.passed).toBe(false);
      expect(result.missingElements).toEqual(
        expect.arrayContaining([expect.stringContaining('Confidence')])
      );
    });

    it('should flag both missing disclaimer and confidence', () => {
      const result = check('The portfolio returned 8.3% this year.');
      expect(result.passed).toBe(false);
      expect(result.missingElements).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should list multiple violations when response has several forbidden patterns', () => {
      const result = check(
        'You should buy AAPL. Guaranteed returns of 20%. Copy Pelosi trades.'
      );
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });

    it('should not trigger on "buyback" substring', () => {
      const result = check(
        'The company announced a stock buyback program. Not investment advice. [Confidence: Medium]'
      );
      // "buyback" does not match "you should buy" pattern
      expect(result.violations).toHaveLength(0);
    });

    it('should not trigger on analytical language about buying/selling', () => {
      const response = [
        'The portfolio had 15 buy orders and 8 sell orders this quarter.',
        'I am not a financial advisor. This is informational analysis only, not investment advice.',
        '[Confidence: High]'
      ].join('\n');
      const result = check(response);
      expect(result.violations).toHaveLength(0);
    });

    it('should handle empty string input', () => {
      const result = check('');
      expect(result.passed).toBe(true);
    });

    it('should accept alternative disclaimer wording', () => {
      const result = check(
        'The value is $100. This is not investment advice. [Confidence: Medium]'
      );
      expect(result.missingElements).toHaveLength(0);
    });
  });
});
