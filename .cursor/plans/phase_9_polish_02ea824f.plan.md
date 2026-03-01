---
name: Phase 9 Polish
overview: "Polish the AgentForge MVP: fix token counting and Langfuse cost tracking, run evals against the live deployment, create the agent library README, and add a smoke test script."
todos:
  - id: fix-token-counting
    content: "Fix tokensUsed: 0 in agent.service.ts — extract token counts from AIMessage usage_metadata, return real totals, and send a Langfuse generation() with model name + token usage so Langfuse can compute costs"
    status: completed
  - id: smoke-test
    content: Create scripts/smoke-test.ts — HTTP-based script that POSTs to live /api/v1/agent/chat with 3-5 queries and validates responses
    status: completed
  - id: agent-readme
    content: Create libs/agent/README.md with architecture diagram, tool reference, verification docs, setup/eval instructions, and contributing guidelines
    status: completed
  - id: run-evals
    content: Run existing eval suite locally to confirm 50/50, then run smoke-test against live Railway URL
    status: completed
isProject: false
---

# Phase 9: Polish and Open Source

Phase 9 from [buildguide.md](.cursor/plans/buildguide.md) — iterate on eval failures, write docs, clean up rough edges.

---

## Step 29 — Run Evals Against Live Deployment

The eval suite passes 50/50 locally with mocked services. The buildguide calls for running evals against the deployed Railway API.

The eval suite uses mocked Ghostfolio services (not HTTP calls), so it tests agent logic rather than deployment plumbing. Plan:

- Confirm the existing mocked eval suite still passes 50/50 locally
- Create a lightweight **smoke test script** (`scripts/smoke-test.ts`) that actually `POST`s to the live `/api/v1/agent/chat` endpoint with 3-5 representative queries and validates responses (non-empty response, valid confidence, `verified: true`)
- Run the smoke test against the live Railway URL

## Step 29b — Fix Token Counting + Langfuse Cost Tracking

**Problem**: `[agent.service.ts](libs/agent/src/lib/agent.service.ts)` line 202 returns `tokensUsed: 0` (placeholder). Langfuse dashboard shows $0.00 cost and 0 tokens for all users/traces because token and model metadata are never sent to Langfuse.

**Root cause**: The Langfuse trace is created with `trace()` but never receives:

- Model name (needed for cost calculation)
- Input/output token counts (needed for usage tracking)

LangGraph's Anthropic messages carry token usage in `response_metadata.usage` or `usage_metadata` on AIMessage objects.

**Fix** (in `[agent.service.ts](libs/agent/src/lib/agent.service.ts)`):

1. After `agentGraph.invoke()`, find all AIMessage objects in `result.messages`
2. Extract `usage_metadata` (`input_tokens`, `output_tokens`) from each AIMessage
3. Sum total input + output tokens across all AI messages
4. Return the real count in `AgentChatResponse.tokensUsed`
5. Send a **Langfuse generation** (not just a span) with:
  - `model: 'claude-sonnet-4-20250514'`
  - `usage: { input: totalInputTokens, output: totalOutputTokens }`
  - This is what Langfuse needs to compute cost — generations with model + token counts

**Reference**: Langfuse tracks costs via `generation()` objects, not `trace()` or `span()`. The current code only uses `trace()` + `span()` + `score()`, which is why costs show $0.00.

## Step 30 — Agent Library README

`[libs/agent/README.md](libs/agent/README.md)` does not exist. Create it with:

1. One-paragraph description
2. Architecture diagram (Mermaid — message flow: user -> agent graph -> tools -> verification -> response)
3. Setup instructions (prerequisites, env vars, install, run)
4. How congressional portfolio seeding works
5. How to run evals (unit tests + full eval suite)
6. Tool reference table (name, input schema, output, which Ghostfolio service)
7. How the verification layer works
8. Contributing guidelines
9. License (AGPL-3.0)

---

## Out of Scope

- New features or tools
- UI redesign
- CI/CD pipeline
- Demo video (manual task, not code)

