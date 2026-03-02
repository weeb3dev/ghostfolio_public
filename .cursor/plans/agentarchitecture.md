# Agent Architecture Document — AgentForge

## Domain & Use Cases

**Domain:** Finance — Congressional STOCK Act portfolio analysis

**Why this domain:** Finance is a high-stakes domain where verification matters. A wrong number in a portfolio summary or an unsolicited buy recommendation creates real liability. This makes it an ideal proving ground for production agent patterns: every response must be grounded in tool data, every claim must be verifiable, and domain constraints must be enforced automatically.

**Specific problems solved:**
- Analyzing congressional STOCK Act financial disclosures stored as Ghostfolio portfolios
- Answering natural language questions about portfolio holdings, performance, risk, and transactions
- Providing rebalancing analysis against target allocations
- Ensuring all responses include appropriate financial disclaimers and never cross into financial advice

**Target users:** Retail investors, financial transparency researchers, and journalists analyzing congressional trading patterns.

---

## Agent Architecture

### Framework: LangGraph.js + LangChain.js

**Why LangGraph.js:** The entire Ghostfolio codebase is TypeScript (Angular + NestJS + Nx monorepo, Node >=22.18.0). LangGraph.js provides a ReAct agent pattern with native TypeScript support, stateful multi-step workflows, and tool binding — without introducing a Python dependency into the stack.

**Why not alternatives:**
- LangChain Python — would require a separate Python service, adding deployment complexity to an already complex Nx monorepo
- CrewAI — multi-agent is overkill for a single-domain assistant
- Custom — LangGraph's `createReactAgent` handles the tool-calling loop, conversation history, and state management out of the box

### Reasoning Approach: ReAct (Reason + Act)

The agent uses `createReactAgent` from `@langchain/langgraph/prebuilt` with Claude Sonnet 4 as the LLM. The ReAct pattern allows the agent to reason about which tools to call, execute them with correct parameters, observe results, decide whether more tools are needed, and synthesize a final response from all tool outputs.

### LLM: Claude Sonnet 4 (Anthropic API)

Model string: `claude-sonnet-4-20250514`. Selected for strong function-calling support, reliable structured output, and the ability to follow complex system prompt constraints (financial disclaimers, domain restrictions, confidence scoring). Temperature set to 0 for deterministic responses.

### Tool Design: Factory Pattern with NestJS DI

Tools are created via factory functions that receive NestJS-injected services:

```
createPortfolioSummaryTool(portfolioService) → DynamicStructuredTool
```

This bridges NestJS's dependency injection container with LangChain's plain-function tool interface. Tools cannot use NestJS DI directly (they are plain functions), so the `AgentService` instantiates them at runtime with its own injected services via `buildGraph()`. The graph is rebuilt per-request because `PortfolioService` uses `@Inject(REQUEST)`, making the entire service chain request-scoped (`onModuleInit` is never called on request-scoped providers).

### Tool-to-Service Mapping

| Tool | Factory Signature | Ghostfolio Service | Key Method |
|------|------------------|-------------------|------------|
| `portfolio_summary` | `createPortfolioSummaryTool(portfolioService)` | `PortfolioService` | `getDetails()`, `getPerformance()` |
| `transaction_analysis` | `createTransactionAnalysisTool(orderService)` | `OrderService` | `getOrders()` |
| `asset_lookup` | `createAssetLookupTool(dataProviderService)` | `DataProviderService` | `getQuotes()` |
| `risk_assessment` | `createRiskAssessmentTool(portfolioService)` | `PortfolioService` | `getDetails()` |
| `rebalance_suggestion` | `createRebalanceSuggestionTool(portfolioService)` | `PortfolioService` | `getDetails()` |

All tools use Zod input schemas for validation. Every tool returns structured JSON on success and a consistent error shape on failure (try/catch everywhere). All service calls pass `impersonationId: ''` as required by Ghostfolio's API signatures.

### System Prompt Design

The system prompt is rebuilt per-request via `buildSystemPrompt(userId)` and enforces:
1. **Identity:** Ghostfolio financial assistant
2. **Current User:** Injects the authenticated `userId` so the agent never asks "What is your user ID?"
3. **Critical Rules:** ALWAYS use tools for data (never fabricate numbers), MUST NOT provide buy/sell recommendations, include disclaimer ("I am not a financial advisor"), confidence scoring (`[Confidence: Low/Medium/High]`), never suggest copying politician trades
4. **Available Congressional Portfolios:** Maps politician names to deterministic UUIDs (generated via SHA-256 hash of name, formatted as UUID) so the agent can resolve "Pelosi portfolio" to the correct userId
5. **Formatting instructions:** Markdown-friendly output

The system prompt was iterated multiple times based on eval failures — wrong tool selection, missing disclaimers, fabricated numbers, and the agent asking for user IDs were all caught by evals and fixed via prompt revisions.

### Authentication Pattern

The codebase uses `@Inject(REQUEST) private readonly request: RequestWithUser` — not a custom `@AuthUser` decorator. The controller extracts `this.request.user.id` for the authenticated userId. JWT auth guard + `HasPermission(permissions.accessAgentChat)` gate access.

---

## Verification Strategy

### Why Verification Matters

In finance, a hallucinated number or an unsolicited buy recommendation creates real risk. The verification layer runs on every response before it reaches the user — it's not optional.

### Implementation: Two Independent Checks

**1. Hallucination Detector**
- Extracts all numbers from the agent's response (dollar amounts, percentages, plain numbers — ignoring ordinals and dates)
- Extracts all ticker symbols (filtering out common English words: I, A, CEO, ETF, GDP, etc.)
- Cross-references each against raw tool output data with 2% tolerance: `Math.abs(a - b) / Math.max(Math.abs(b), 1) < 0.02` where `b` is the known tool-sourced value
- Derives additional valid numbers from tool results: sums of pairs, percentages (value/total × 100)
- Checks for fabricated ticker symbols (symbols mentioned but not found in tool results)
- Returns confidence score: high if all numbers match and at least one number was verified, medium if no numbers present or 1-2 unsupported, low if 3+
- If tool results are empty, returns valid with medium confidence (nothing to check against)

**2. Domain Constraint Checker**
- Scans for forbidden patterns (case-insensitive regex using phrase-level matching and word boundaries to avoid false positives like "buyback"):
  - Buy/sell recommendations: "you should buy/sell", "I recommend buying/selling", "sell immediately", "buy now"
  - Price targets: "stock/price will reach/hit $"
  - Guaranteed outcomes: "guaranteed returns/profit", "you will make/earn X%", "risk-free"
  - Copy-trade advice: "copy trades", "trade like", "follow their/his/her trades"
- Checks for required elements (only when response contains $ or %): financial disclaimer ("not a financial advisor", "not investment advice", or "informational analysis/purposes only") and confidence tag (`[Confidence: Low/Medium/High]`)
- Returns: `{ passed, violations[], missingElements[] }`

### Verification Failure Handling

In `agent.service.ts`, after graph invocation:
- **Domain violation:** Response is replaced entirely with a safe fallback message, confidence set to "low", verified = false
- **Hallucination detected:** Warning appended to response ("⚠️ Some figures could not be verified"), confidence set to "low", verified = false
- Domain violations take precedence over hallucination warnings

### Why Separate from the LLM

Both checkers are pure functions — no LLM calls, no API dependencies, no database queries. This means:
- **Independently testable:** 62 unit tests (34 hallucination + 28 domain constraint) run in milliseconds, zero cost
- **Model-agnostic:** Works regardless of which LLM is behind the agent
- **Deterministic:** Same input always produces same verification result
- **Zero latency impact:** Adds <100ms to total response time

---

## Eval Results

### Test Suite: 112 Tests, 3 Layers

**Layer 1: Verification Unit Tests (62 tests, fast, free)**
Pure-function tests for hallucination detection (34 tests) and domain constraint checking (28 tests). No LLM, no database. Tests number extraction, ticker extraction, rounding tolerance, forbidden pattern matching, word boundary edge cases, and required element checking.

**Layer 2: Agent Eval Suite (50 tests, real LLM, ~$2-5 per run)**

| Category | Count | Avg Latency | Pass Rate |
|----------|-------|-------------|-----------|
| Happy Path | 20 | 8.3s | 100% |
| Edge Cases | 10 | 7.6s | 100% |
| Adversarial | 10 | 10.5s | 100% |
| Multi-Step | 10 | 12.6s | 100% |
| **Total** | **50** | **9.2s avg** | **100%** |

**Layer 3: Langfuse Eval Reporter**
After each test, results are pushed to a Langfuse dataset (`agentforge-congressional-evals`) via direct REST API calls (`fetch()` with Basic Auth). The Langfuse SDK was abandoned for eval reporting due to CJS/ESM incompatibility in Jest's VM context.

### What Each Category Tests

- **Happy Path (20):** Standard queries across all 6 congressional portfolios and all 5 tools — portfolio value, top holdings, YTD performance, trading fees, asset prices, sector exposure, risk levels, rebalancing
- **Edge Cases (10):** Few holdings, missing asset classes, unusual allocations, crypto queries on equity-only portfolios, delisted tickers
- **Adversarial (10):** Copy-trade refusal, "buy the same stocks" refusal, jailbreak attempts, system prompt injection, panic selling amplification, guaranteed return claims, trade execution requests
- **Multi-Step (10):** Cross-portfolio comparison (risk_assessment ×2), portfolio analysis + rebalancing (3 tools chained), performance + specific holding analysis

### Failure Analysis During Development

The eval suite caught real issues during iterative development:
- **Wrong tool selection:** Agent called `asset_lookup` instead of `portfolio_summary` for portfolio-level questions → fixed via system prompt clarification
- **Missing disclaimers:** Agent omitted financial disclaimer on short responses → fixed via system prompt enforcement ("ALWAYS include disclaimer")
- **Fabricated numbers:** Agent interpolated performance numbers not in tool output → caught by hallucination detector, fixed via prompt instruction ("Only use numbers from tool results")
- **User ID prompting:** Agent asked "What is your user ID?" instead of using the injected userId → fixed by adding `CURRENT USER` section to system prompt with `buildSystemPrompt(userId)`

---

## Observability Setup

### Tool: Langfuse (open source, cloud-hosted)

### What We're Tracking

| Capability | Implementation |
|-----------|---------------|
| **Full traces** | Every request: input → LLM reasoning → tool calls → tool results → verification → final output |
| **Latency breakdown** | LLM call time, tool execution time, verification time, total response time |
| **Token usage** | Input/output tokens per request, extracted from `AIMessage.usage_metadata` |
| **Cost tracking** | Dollar cost per trace via Langfuse `generation()` with model name + token counts |
| **Eval datasets** | All 50 eval test results pushed to Langfuse dataset via REST API |
| **Verification scores** | Langfuse `score()` for hallucination pass/fail, domain constraint pass/fail, latency |
| **Error tracking** | Failed tool calls, verification failures, LLM errors — all captured in trace spans |

### Critical Implementation Detail: generation() for Cost Tracking

Langfuse computes costs from `generation()` objects that include `model` and `usage` fields — `trace()` and `span()` alone show $0.00 cost and 0 tokens. The fix:

```typescript
trace?.generation({
  name: 'llm',
  model: 'claude-sonnet-4-20250514',
  usage: { input: inputTokens, output: outputTokens, total: totalTokens }
});
```

Token usage is extracted from LangGraph's AIMessage objects via `msg.usage_metadata` (input_tokens, output_tokens).

### Langfuse Singleton Pattern

Langfuse is instantiated as a module-level singleton (`getLangfuse()`) outside the NestJS class to avoid per-request instantiation. This is necessary because `AgentService` is request-scoped (forced by `PortfolioService`'s `@Inject(REQUEST)` dependency chain).

### Insights Gained

- Average response time: ~9.2s (dominated by LLM inference, not tool execution)
- Tool execution: <500ms per call — the bottleneck is always the LLM
- Multi-step queries (2-3 tool chains): average 12.6s — within the 15s target
- Verification: adds <100ms overhead — negligible compared to LLM calls
- Most expensive queries: adversarial (10.5s avg) and multi-step (12.6s avg) due to longer reasoning chains

---

## Open Source Contribution

**Type:** Documentation — Comprehensive build guide/tutorial published publicly

**What was released:** A 1,937-line battle-tested build guide (`buildguideV2.md`) that serves as a complete step-by-step tutorial for adding an AI agent module to Ghostfolio (or any NestJS + Angular Nx monorepo). The guide includes:

- 56 numbered steps across 9 phases (Environment Setup → Polish)
- Exact terminal commands, file paths, and copy-paste AI prompts for Cursor/Claude Code
- 12 documented bugs encountered during the original build, with fixes baked into the instructions
- Framework selection rationale (LangGraph.js vs alternatives)
- Tool factory pattern with NestJS DI integration
- Verification layer design (hallucination detection + domain constraints)
- Eval suite construction (112 tests across 3 layers)
- Langfuse observability integration (including the generation() gotcha for cost tracking)
- Railway deployment with safety warnings (service targeting)
- Troubleshooting appendix, MCP tools reference, architecture diagrams (Mermaid)

**Where to find it:** [github.com/weeb3dev/ghostfolio_public](https://github.com/weeb3dev/ghostfolio_public) — `.cursor/plans/buildguideV2.md`

**Additional documentation:** The repository README includes complete architecture documentation, tool reference, setup guide, and full eval results for all 50 agent eval tests.