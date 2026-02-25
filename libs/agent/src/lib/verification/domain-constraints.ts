import type { DomainConstraintResult } from './verification.types';

interface ForbiddenPattern {
  regex: RegExp;
  label: string;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  // Buy/sell recommendations
  {
    regex: /you should\s+(buy|sell|purchase|invest in|get rid of)/i,
    label: 'Direct buy/sell recommendation'
  },
  {
    regex: /I recommend\s+(buying|selling|purchasing|investing in)/i,
    label: 'Direct investment recommendation'
  },
  {
    regex: /\b(sell immediately|buy now|act fast|don'?t miss)\b/i,
    label: 'Urgency-based investment advice'
  },
  {
    regex: /\b(must buy|must sell|need to buy|need to sell)\b/i,
    label: 'Imperative investment advice'
  },

  // Price targets
  {
    regex: /(stock|price|share)\s+will\s+(reach|hit|go to|climb to|drop to)\s*\$/i,
    label: 'Specific price target prediction'
  },
  {
    regex: /price target\s*(of|is|:)\s*\$/i,
    label: 'Stated price target'
  },

  // Guaranteed outcomes
  {
    regex: /guaranteed\s+(returns?|profits?|gains?|income)/i,
    label: 'Guaranteed outcome claim'
  },
  {
    regex: /you will\s+(make|earn|gain|profit)\s+\d/i,
    label: 'Promised specific return'
  },
  {
    regex: /risk[\s-]*free\s+(return|investment|profit)/i,
    label: 'Risk-free claim'
  },
  {
    regex: /can'?t\s+(lose|fail|go wrong)/i,
    label: 'Infallibility claim'
  },

  // Copy-trade advice
  {
    regex: /copy\s+(pelosi|tuberville|crenshaw|wyden|greene|gottheimer|their|his|her)\s+trades?/i,
    label: 'Copy-trade suggestion'
  },
  {
    regex: /trade\s+like\s+(pelosi|tuberville|crenshaw|wyden|greene|gottheimer|a?\s*politician)/i,
    label: 'Copy-trade suggestion'
  },
  {
    regex: /follow\s+(their|his|her)\s+(trades?|strategy|portfolio)/i,
    label: 'Follow-trade suggestion'
  },
  {
    regex: /replicate\s+(their|his|her|this)\s+(trades?|strategy|portfolio)/i,
    label: 'Replicate-trade suggestion'
  }
];

const DISCLAIMER_PATTERNS = [
  /not a financial advisor/i,
  /not investment advice/i,
  /informational\s+(analysis|purposes)\s+only/i
];

const CONFIDENCE_PATTERN = /\[Confidence:\s*(Low|Medium|High)\]/i;

function containsFinancialData(text: string): boolean {
  return /\$\d/.test(text) || /\d+(\.\d+)?\s*%/.test(text);
}

/**
 * Check the agent's response against domain constraints:
 * forbidden advisory patterns and required disclaimer/confidence elements.
 */
export function check(agentResponse: string): DomainConstraintResult {
  const violations: string[] = [];
  const missingElements: string[] = [];

  for (const { regex, label } of FORBIDDEN_PATTERNS) {
    if (regex.test(agentResponse)) {
      violations.push(label);
    }
  }

  if (containsFinancialData(agentResponse)) {
    const hasDisclaimer = DISCLAIMER_PATTERNS.some((p) =>
      p.test(agentResponse)
    );
    if (!hasDisclaimer) {
      missingElements.push('Financial disclaimer');
    }

    if (!CONFIDENCE_PATTERN.test(agentResponse)) {
      missingElements.push('Confidence indicator [Confidence: Low/Medium/High]');
    }
  }

  const passed = violations.length === 0 && missingElements.length === 0;

  return { passed, violations, missingElements };
}
