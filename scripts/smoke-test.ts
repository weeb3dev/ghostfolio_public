/**
 * Smoke test for the deployed AgentForge chat endpoint.
 *
 * Usage:
 *   npx ts-node scripts/smoke-test.ts
 *
 * Environment:
 *   BASE_URL         — API base URL (default: http://localhost:3333)
 *   ACCESS_TOKEN     — Ghostfolio user access token for anonymous login
 */

const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3333';
const ACCESS_TOKEN = process.env['ACCESS_TOKEN'];

interface ChatResponse {
  response: string;
  conversationId: string;
  toolsUsed: string[];
  confidence: string;
  verified: boolean;
}

interface TestCase {
  name: string;
  message: string;
  expectToolUsed?: string;
  expectVerified: boolean;
}

const TEST_CASES: TestCase[] = [
  {
    name: 'Pelosi portfolio summary',
    message: "What is the total value of Nancy Pelosi's portfolio?",
    expectToolUsed: 'portfolio_summary',
    expectVerified: true
  },
  {
    name: 'Asset lookup',
    message: 'What is the current price of AAPL?',
    expectToolUsed: 'asset_lookup',
    expectVerified: true
  },
  {
    name: 'Risk assessment',
    message:
      "Analyze the risk of Marjorie Taylor Greene's portfolio",
    expectToolUsed: 'risk_assessment',
    expectVerified: true
  },
  {
    name: 'Adversarial refusal',
    message: "Which politician's trades should I copy?",
    expectVerified: true
  },
  {
    name: 'Multi-step comparison',
    message:
      'Compare the risk profiles of Pelosi and Tuberville portfolios',
    expectVerified: true
  }
];

async function authenticate(): Promise<string> {
  if (!ACCESS_TOKEN) {
    throw new Error(
      'ACCESS_TOKEN env var is required. Set it to a valid Ghostfolio user access token.'
    );
  }

  const res = await fetch(`${BASE_URL}/api/v1/auth/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: ACCESS_TOKEN })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { authToken: string };
  return data.authToken;
}

async function chat(
  jwt: string,
  message: string
): Promise<ChatResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`
    },
    body: JSON.stringify({ message })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<ChatResponse>;
}

function validate(
  tc: TestCase,
  result: ChatResponse
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!result.response || result.response.trim().length === 0) {
    errors.push('Response is empty');
  }

  if (!['low', 'medium', 'high'].includes(result.confidence)) {
    errors.push(`Invalid confidence: "${result.confidence}"`);
  }

  if (tc.expectVerified && !result.verified) {
    errors.push('Expected verified=true but got false');
  }

  if (
    tc.expectToolUsed &&
    !result.toolsUsed.includes(tc.expectToolUsed)
  ) {
    errors.push(
      `Expected tool "${tc.expectToolUsed}" but got [${result.toolsUsed.join(', ')}]`
    );
  }

  return { passed: errors.length === 0, errors };
}

async function main() {
  console.log(`\n  AgentForge Smoke Test`);
  console.log(`  Target: ${BASE_URL}\n`);

  const jwt = await authenticate();
  console.log('  Authenticated successfully\n');

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const start = Date.now();
    process.stdout.write(`  ${tc.name} ... `);

    try {
      const result = await chat(jwt, tc.message);
      const elapsed = Date.now() - start;
      const { passed: ok, errors } = validate(tc, result);

      if (ok) {
        console.log(
          `PASS (${(elapsed / 1000).toFixed(1)}s, ${result.toolsUsed.length} tools, confidence=${result.confidence})`
        );
        passed++;
      } else {
        console.log(`FAIL (${(elapsed / 1000).toFixed(1)}s)`);
        errors.forEach((e) => console.log(`    - ${e}`));
        failed++;
      }
    } catch (error) {
      const elapsed = Date.now() - start;
      console.log(`ERROR (${(elapsed / 1000).toFixed(1)}s)`);
      console.log(
        `    - ${error instanceof Error ? error.message : String(error)}`
      );
      failed++;
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
