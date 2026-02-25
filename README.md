<div align="center">

[<img src="https://avatars.githubusercontent.com/u/82473144?s=200" width="100" alt="Ghostfolio logo">](https://ghostfol.io)

# AgentForge

**AI Financial Agent for Congressional STOCK Act Portfolio Analysis**

Built on [Ghostfolio](https://github.com/ghostfolio/ghostfolio) · LangGraph.js + Claude Sonnet 4 · NestJS + Angular

</div>

---

AgentForge is a fork of [Ghostfolio](https://github.com/ghostfolio/ghostfolio) (open-source wealth management software) extended with an AI financial agent module. The agent analyzes congressional STOCK Act financial disclosures seeded as Ghostfolio portfolios — it can summarize holdings, assess risk, analyze transactions, look up assets, and suggest rebalancing strategies.

The agent uses a verification layer (hallucination detection + domain constraint checking) to ensure responses are grounded in tool data and never cross into financial advice.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Angular Frontend (apps/client)                         │
│  └── Chat UI → /api/v1/agent/chat                       │
├─────────────────────────────────────────────────────────┤
│  NestJS API (apps/api)                                  │
│  └── AgentModule (libs/agent)                           │
│       ├── AgentService        ← orchestrates everything │
│       ├── AgentGraph          ← LangGraph ReAct agent   │
│       ├── Tools (5)           ← Ghostfolio service calls│
│       └── Verification (2)    ← hallucination + domain  │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL (Prisma) + Redis                            │
├─────────────────────────────────────────────────────────┤
│  Langfuse (observability: traces, evals, cost tracking) │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent Framework | LangGraph.js + LangChain.js |
| LLM | Claude Sonnet 4 (Anthropic API) |
| Backend | NestJS (Ghostfolio) |
| Frontend | Angular + Angular Material |
| Database | PostgreSQL + Prisma ORM |
| Cache | Redis |
| Observability | Langfuse |
| Test Data | Congressional STOCK Act disclosures |

## Agent Tools

| Tool | Description |
|------|-------------|
| `portfolio_summary` | Total value, holdings, allocation %, performance metrics |
| `transaction_analysis` | Trade count, buy/sell breakdown, fees, most traded symbols |
| `asset_lookup` | Current price, 52-week high/low, sector/country data |
| `risk_assessment` | Concentration risk, sector/geographic/asset class allocation |
| `rebalance_suggestion` | Compare current vs target allocation, dollar adjustments |

## Verification Layer

Every agent response passes through two checks before reaching the user:

- **Hallucination Detector** — Extracts numbers and ticker symbols from the response and verifies each one traces back to tool output. Flags fabricated data with confidence scoring.
- **Domain Constraint Checker** — Blocks buy/sell recommendations, price targets, guaranteed returns, and copy-trade suggestions. Ensures financial disclaimers are present.

## Quick Start

### Prerequisites

- Node.js >= 22
- Docker (for PostgreSQL + Redis)
- Anthropic API key

### Setup

```bash
# Clone and install
git clone <your-fork-url>
cd ghostfolio
npm install

# Start PostgreSQL + Redis
docker compose -f docker/docker-compose.dev.yml up -d

# Configure environment
cp .env.example .env
# Edit .env — add DATABASE_URL, REDIS_HOST, ANTHROPIC_API_KEY

# Run database migrations and seed
npx prisma migrate deploy
npx prisma db seed

# Start the dev server
npm start
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development environment setup.

## Testing

The agent library has three test layers:

### Unit Tests (fast, no LLM, no DB)

Pure-function tests for the verification layer — hallucination detection and domain constraint checking.

```bash
npx jest --config libs/agent/jest.config.ts --testPathPatterns="(hallucination|domain)"
```

### Eval Suite (real LLM, mock services)

50 tests across 4 categories that invoke the real LangGraph agent against Claude Sonnet 4 with mocked Ghostfolio services returning realistic congressional portfolio data.

```bash
npx jest --config libs/agent/jest.config.ts --testPathPatterns=agent-eval
```

| Category | Count | What it tests |
|----------|-------|---------------|
| Happy Path | 20 | Portfolio queries, asset lookups, transactions, risk, rebalancing |
| Edge Cases | 10 | Few holdings, missing asset classes, unusual allocations |
| Adversarial | 10 | Copy-trade refusal, jailbreaks, prompt injection, panic selling |
| Multi-Step | 10 | Cross-portfolio comparison, multi-tool orchestration |

Requires `ANTHROPIC_API_KEY` in `.env`. Takes ~8 minutes (real API calls).

### Test Results

Test results are written to `test-results/agent/junit.xml` in JUnit XML format (via `jest-junit`). This file is generated after each test run and can be consumed by CI dashboards.

Coverage reports (when run with `--coverage`) go to `coverage/libs/agent/`.

```bash
# Run evals with coverage
npx jest --config libs/agent/jest.config.ts --testPathPatterns=agent-eval --coverage
```

### Latest Eval Results (Feb 2026)

```
Tests:       50 passed, 50 total
Time:        ~488s

  Happy Path:   20/20 ✓
  Edge Cases:   10/10 ✓
  Adversarial:  10/10 ✓
  Multi-Step:   10/10 ✓
```

## Project Structure

```
libs/agent/src/lib/
├── __tests__/
│   ├── agent-eval.spec.ts              # 50-test eval suite (real LLM)
│   ├── hallucination-detector.spec.ts  # Unit tests for hallucination detection
│   ├── domain-constraints.spec.ts      # Unit tests for domain constraints
│   ├── eval-helpers.ts                 # Shared test utilities + assertion helpers
│   └── langfuse-reporter.ts            # Pushes eval results to Langfuse datasets
├── tools/
│   ├── portfolio-summary.tool.ts
│   ├── transaction-analysis.tool.ts
│   ├── asset-lookup.tool.ts
│   ├── risk-assessment.tool.ts
│   └── rebalance-suggestion.tool.ts
├── verification/
│   ├── hallucination-detector.ts
│   ├── domain-constraints.ts
│   └── verification.types.ts
├── agent.graph.ts                      # LangGraph ReAct agent with system prompt
├── agent.module.ts                     # NestJS module
└── agent.service.ts                    # Orchestrates graph + verification + Langfuse
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for the agent LLM |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_HOST` | Yes | Redis hostname |
| `REDIS_PORT` | Yes | Redis port |
| `LANGFUSE_PUBLIC_KEY` | No | Langfuse public key for observability |
| `LANGFUSE_SECRET_KEY` | No | Langfuse secret key for observability |

See the upstream [Ghostfolio README](https://github.com/ghostfolio/ghostfolio) for the full list of Ghostfolio-specific environment variables.

## Congressional Portfolios

The eval suite tests against mock data modeled on 6 congressional portfolios:

| Politician | Portfolio Character |
|------------|-------------------|
| Nancy Pelosi | Large, tech-heavy ($2.3M+, AAPL/NVDA/MSFT dominant) |
| Tommy Tuberville | High-frequency trader (312 trades, mixed sectors) |
| Dan Crenshaw | Moderate, diversified (healthcare, energy, tech) |
| Ron Wyden | Conservative, index-heavy (VTI, BND, VXUS) |
| Marjorie Taylor Greene | Concentrated, high-risk (45% TSLA, DJT) |
| Josh Gottheimer | Small, finance-focused (JPM, GS, BAC) |

## Upstream

This project is a fork of [Ghostfolio](https://github.com/ghostfolio/ghostfolio) by [@dtslvr](https://github.com/dtslvr). Ghostfolio is licensed under [AGPLv3](https://www.gnu.org/licenses/agpl-3.0.html).

## License

© 2021 - 2026 [Ghostfolio](https://ghostfol.io) · Licensed under the [AGPLv3 License](https://www.gnu.org/licenses/agpl-3.0.html).
