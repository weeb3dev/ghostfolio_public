---
name: Langfuse Eval Integration
overview: Rewrite langfuse-reporter.ts to use the Langfuse REST API directly via fetch() instead of the langfuse SDK, bypassing the CJS/ESM incompatibility that prevents it from working in Jest. Wire it into the eval suite so every test run pushes dataset items with scores to the Langfuse dashboard.
todos:
  - id: rewrite-reporter
    content: Rewrite langfuse-reporter.ts to use Langfuse REST API via fetch() instead of SDK -- remove Jest bailout, add fetchApi() helper with Basic Auth, keep same EvalResult interface
    status: completed
  - id: wire-eval-suite
    content: Update agent-eval.spec.ts to properly await Langfuse report calls (collect promises, flush in afterAll) instead of fire-and-forget
    status: completed
  - id: smoke-test
    content: Run a single eval test to verify data appears in Langfuse dashboard under the agentforge-congressional-evals dataset
    status: completed
isProject: false
---

# Fix Langfuse Eval Reporting (Build Guide Step 25)

## Problem

`langfuse-reporter.ts` has a Jest bailout on line 44 -- `if (process.env['JEST_WORKER_ID'] !== undefined) return;` -- because the `langfuse` v3 SDK's CJS bundle crashes in Jest's VM context. Since evals only run via Jest, **nothing ever gets sent to Langfuse**.

## Solution

Replace the `langfuse` SDK usage with **direct REST API calls via `fetch()`**. The Langfuse public API is simple (Basic Auth, JSON bodies) and has zero module-loading issues.

### Langfuse REST API Details

- **Base URL**: `LANGFUSE_BASEURL` env var (`https://us.cloud.langfuse.com`)
- **Auth**: Basic Auth -- username = `LANGFUSE_PUBLIC_KEY`, password = `LANGFUSE_SECRET_KEY`
- **Create dataset**: `POST /api/public/v2/datasets` with `{ name, description, metadata }`
- **Create dataset item**: `POST /api/public/dataset-items` with `{ datasetName, input, expectedOutput, metadata }`
- **Create score** (optional, for dashboard charts): `POST /api/public/scores` attached to a trace

---

## Changes

### 1. Rewrite [libs/agent/src/lib/**tests**/langfuse-reporter.ts](libs/agent/src/lib/__tests__/langfuse-reporter.ts)

- Remove `require('langfuse')` and the Jest bailout guard
- Add a private `fetchApi(path, body)` method that does `fetch(baseUrl + path)` with Basic Auth header (`Buffer.from(publicKey + ':' + secretKey).toString('base64')`)
- `ensureDataset()`: `POST /api/public/v2/datasets` -- idempotent, creates `agentforge-congressional-evals` if it doesn't exist
- `report(result)`: `POST /api/public/dataset-items` with:
  - `datasetName`: `'agentforge-congressional-evals'`
  - `input`: `{ query: result.input }`
  - `expectedOutput`: `{ criteria: result.expectedOutput }`
  - `metadata`: `{ category, testName, passed, latencyMs, tokensUsed, toolsCalled, actualOutput: result.actualOutput, timestamp }`
- `flush()`: becomes a no-op (fetch is synchronous per-call, no batching needed)
- Keep `enabled` getter: still checks for env vars, but **remove** the Jest check

### 2. Update [libs/agent/src/lib/**tests**/agent-eval.spec.ts](libs/agent/src/lib/__tests__/agent-eval.spec.ts)

- The `reportAfterTest` helper already fires `reporter.report()` -- no structural changes needed
- Make `reportAfterTest` `await` the report call instead of fire-and-forget, so items are guaranteed sent before test teardown (or at least add them to a promise queue flushed in `afterAll`)
- In `afterAll`, `await reporter.flush()` is already there -- may add a small delay to ensure all in-flight requests complete

### 3. Validate env config

- Confirm `.env` has `LANGFUSE_BASEURL=https://us.cloud.langfuse.com` (it does)
- `jest.setup.ts` already loads `.env` via `dotenv` (confirmed)

---

## What You'll See After

- Running `npx nx test agent --testPathPattern=agent-eval` will push ~50 dataset items to Langfuse
- Dashboard will show the `agentforge-congressional-evals` dataset with items tagged by category
- Each item has input (query), expected output (assertion criteria), and metadata (pass/fail, latency, tools called, actual response)

