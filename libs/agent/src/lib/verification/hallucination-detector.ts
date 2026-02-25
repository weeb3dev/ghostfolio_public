import type {
  HallucinationCheckResult,
  NumberMatch,
  ToolCallResult
} from './verification.types';

const COMMON_WORDS = new Set([
  'I',
  'A',
  'AM',
  'AN',
  'AS',
  'AT',
  'BE',
  'BY',
  'DO',
  'GO',
  'IF',
  'IN',
  'IS',
  'IT',
  'ME',
  'MY',
  'NO',
  'OF',
  'OK',
  'ON',
  'OR',
  'SO',
  'TO',
  'UP',
  'US',
  'WE',
  'CEO',
  'CFO',
  'COO',
  'CTO',
  'ETF',
  'FAQ',
  'GDP',
  'IPO',
  'LLC',
  'LTD',
  'NYSE',
  'SEC',
  'USA',
  'USD',
  'YTD',
  'NOT',
  'THE',
  'AND',
  'FOR',
  'ARE',
  'BUT',
  'ALL',
  'CAN',
  'HER',
  'HIS',
  'HOW',
  'ITS',
  'MAY',
  'NEW',
  'NOW',
  'OLD',
  'OUR',
  'OUT',
  'OWN',
  'SAY',
  'SHE',
  'TOO',
  'USE',
  'LOW',
  'HIGH',
  'BUY',
  'TOP',
  'HAS',
  'HAD',
  'WAS',
  'PER',
  'NET',
  'NOTE',
  'ALSO',
  'EACH',
  'THAT',
  'THIS',
  'FROM',
  'WITH',
  'HAVE',
  'BEEN',
  'SOME',
  'OVER',
  'THAN',
  'SUCH',
  'ONLY',
  'VERY',
  'WHEN',
  'WHAT',
  'YOUR',
  'RISK',
  'SELL',
  'HOLD',
  'TOTAL',
  'VALUE'
]);

const ROUNDING_TOLERANCE = 0.02;

/**
 * Extract dollar amounts, percentages, and plain numbers from text.
 * Ignores ordinals (1st, 2nd), dates, and list indices.
 */
export function extractNumbers(text: string): NumberMatch[] {
  const matches: NumberMatch[] = [];

  const dollarRegex = /\$[\d,]+(?:\.\d+)?/g;
  let match: RegExpExecArray | null;

  while ((match = dollarRegex.exec(text)) !== null) {
    const raw = match[0];
    const value = parseFloat(raw.replace(/[$,]/g, ''));
    if (!isNaN(value)) {
      matches.push({ value, raw, index: match.index });
    }
  }

  const percentRegex = /(?<!\w)([-+]?\d+(?:,\d{3})*(?:\.\d+)?)\s*%/g;
  while ((match = percentRegex.exec(text)) !== null) {
    const raw = match[0];
    const value = parseFloat(match[1].replace(/,/g, ''));
    if (!isNaN(value)) {
      matches.push({ value, raw, index: match.index });
    }
  }

  const plainNumberRegex =
    /(?<![$%\w])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+)(?!\s*(?:%|st|nd|rd|th|\/))(?![,\d])/g;
  while ((match = plainNumberRegex.exec(text)) !== null) {
    const raw = match[0];
    const value = parseFloat(raw.replace(/,/g, ''));
    if (
      !isNaN(value) &&
      !matches.some((m) => m.index === match!.index) &&
      value !== 0
    ) {
      matches.push({ value, raw, index: match.index });
    }
  }

  return matches;
}

/**
 * Extract potential ticker symbols (1-5 uppercase letters) from text,
 * filtering out common English words.
 */
export function extractTickers(text: string): string[] {
  const tickerRegex = /\b([A-Z]{1,5})\b/g;
  const tickers = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = tickerRegex.exec(text)) !== null) {
    const candidate = match[1];
    if (!COMMON_WORDS.has(candidate)) {
      tickers.add(candidate);
    }
  }

  return Array.from(tickers);
}

function collectNumbersRecursive(obj: unknown, numbers: Set<number>): void {
  if (typeof obj === 'number' && isFinite(obj)) {
    numbers.add(obj);
    return;
  }

  if (typeof obj === 'string') {
    const parsed = parseFloat(obj.replace(/[$,]/g, ''));
    if (!isNaN(parsed) && isFinite(parsed)) {
      numbers.add(parsed);
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectNumbersRecursive(item, numbers);
    }
    return;
  }

  if (obj !== null && typeof obj === 'object') {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      collectNumbersRecursive(value, numbers);
    }
  }
}

function collectTickersRecursive(obj: unknown, tickers: Set<string>): void {
  if (typeof obj === 'string') {
    const match = /^[A-Z]{1,5}$/.exec(obj);
    if (match && !COMMON_WORDS.has(obj)) {
      tickers.add(obj);
    }

    const embedded = obj.match(/\b[A-Z]{1,5}\b/g);
    if (embedded) {
      for (const t of embedded) {
        if (!COMMON_WORDS.has(t)) {
          tickers.add(t);
        }
      }
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectTickersRecursive(item, tickers);
    }
    return;
  }

  if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(
      obj as Record<string, unknown>
    )) {
      if (/^[A-Z]{1,5}$/.test(key) && !COMMON_WORDS.has(key)) {
        tickers.add(key);
      }
      collectTickersRecursive(value, tickers);
    }
  }
}

/**
 * Collect all numbers from tool results, including derived values
 * (percentages of totals, sums of arrays).
 */
export function numbersFromToolResults(
  toolResults: ToolCallResult[]
): Set<number> {
  const numbers = new Set<number>();

  for (const tr of toolResults) {
    try {
      const parsed: unknown = JSON.parse(tr.result);
      collectNumbersRecursive(parsed, numbers);
    } catch {
      // Tool returned non-JSON — extract numbers from raw string
      const rawNumbers = extractNumbers(tr.result);
      for (const n of rawNumbers) {
        numbers.add(n.value);
      }
    }
  }

  // Derive common aggregations: sums and percentages
  const baseNumbers = Array.from(numbers);
  for (let i = 0; i < baseNumbers.length; i++) {
    for (let j = i + 1; j < baseNumbers.length; j++) {
      const sum = baseNumbers[i] + baseNumbers[j];
      numbers.add(sum);

      const total = baseNumbers[i];
      if (total !== 0) {
        numbers.add((baseNumbers[j] / total) * 100);
      }
      const total2 = baseNumbers[j];
      if (total2 !== 0) {
        numbers.add((baseNumbers[i] / total2) * 100);
      }
    }
  }

  return numbers;
}

/**
 * Collect all ticker symbols from tool results.
 */
export function tickersFromToolResults(
  toolResults: ToolCallResult[]
): Set<string> {
  const tickers = new Set<string>();

  for (const tr of toolResults) {
    try {
      const parsed: unknown = JSON.parse(tr.result);
      collectTickersRecursive(parsed, tickers);
    } catch {
      const extracted = extractTickers(tr.result);
      for (const t of extracted) {
        tickers.add(t);
      }
    }
  }

  return tickers;
}

function isWithinTolerance(
  responseValue: number,
  knownNumbers: Set<number>
): boolean {
  for (const known of knownNumbers) {
    const denominator = Math.max(Math.abs(known), 1);
    if (Math.abs(responseValue - known) / denominator < ROUNDING_TOLERANCE) {
      return true;
    }
  }
  return false;
}

/**
 * Main verification entry point.
 * Checks the agent's response against raw tool results for
 * unsupported numerical claims and fabricated tickers.
 */
export function check(
  agentResponse: string,
  toolResults: ToolCallResult[]
): HallucinationCheckResult {
  if (toolResults.length === 0) {
    return { isValid: true, unsupportedClaims: [], confidence: 'medium' };
  }

  const unsupportedClaims: string[] = [];

  const responseNumbers = extractNumbers(agentResponse);
  const knownNumbers = numbersFromToolResults(toolResults);

  for (const num of responseNumbers) {
    if (!isWithinTolerance(num.value, knownNumbers)) {
      unsupportedClaims.push(
        `Unsupported number: ${num.raw} (value: ${num.value})`
      );
    }
  }

  const responseTickers = extractTickers(agentResponse);
  const knownTickers = tickersFromToolResults(toolResults);

  for (const ticker of responseTickers) {
    if (!knownTickers.has(ticker)) {
      unsupportedClaims.push(`Unsupported ticker symbol: ${ticker}`);
    }
  }

  const isValid = unsupportedClaims.length === 0;

  let confidence: HallucinationCheckResult['confidence'];
  if (isValid && responseNumbers.length > 0) {
    confidence = 'high';
  } else if (unsupportedClaims.length <= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { isValid, unsupportedClaims, confidence };
}
