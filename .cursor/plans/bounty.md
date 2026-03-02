# $500 Bounty — AgentForge: Congressional STOCK Act Portfolio Intelligence

## The Customer

**Retail investors and financial transparency advocates** who want to track and analyze congressional stock trading activity.

Members of Congress are required to disclose their stock trades under the [STOCK Act](https://en.wikipedia.org/wiki/STOCK_Act), but the raw disclosure data is fragmented, filed as PDFs, and difficult to analyze systematically. A growing community of retail investors (r/wallstreetbets, Quiver Quantitative, Capitol Trades, Unusual Whales) tracks these trades because congressional members consistently outperform the S&P 500 — raising questions about information asymmetry and insider knowledge.

**The pain:** disclosure data exists but is scattered across government filing systems, requires manual parsing, and offers no portfolio-level analysis. Investors can see individual trades but can't easily answer questions like "What's Pelosi's current sector exposure?" or "How does Tuberville's risk profile compare to Crenshaw's?"

## The Feature(s)

### Congressional Portfolio Seeding Pipeline
A data ingestion pipeline that:
- Fetches Senate/House trade disclosures from publicly hosted S3 datasets ([house-stock-watcher](https://housestockwatcher.com/), [senate-stock-watcher](https://senatestockwatcher.com/))
- Normalizes STOCK Act value ranges (e.g., "$1,001–$15,000") to midpoint dollar amounts
- Resolves historical prices via Yahoo Finance at the time of each trade
- Seeds the data as full Ghostfolio portfolio accounts — one per politician (6 portfolios: Pelosi, Tuberville, Crenshaw, Wyden, Greene, Gottheimer)

### AI Agent with Congressional Portfolio Tools
Five tools exposed to the LangGraph ReAct agent via Ghostfolio's API:

| Tool | What It Does |
|------|-------------|
| `portfolio_summary` | Total value, holdings, allocation %, performance metrics for any congressional portfolio |
| `transaction_analysis` | Trade count, buy/sell breakdown, fees, most traded symbols |
| `asset_lookup` | Current price, 52-week range, sector/country data for any ticker |
| `risk_assessment` | Concentration risk, sector/geographic/asset class allocation analysis |
| `rebalance_suggestion` | Compare current allocation vs a target, calculate dollar adjustments needed |

### API and Data Persistence

**Chat endpoints** (authenticated via `@Inject(REQUEST)` with `RequestWithUser`):
- `POST /api/v1/agent/chat` — Send a message; the agent processes the query, calls tools, runs verification, and stores both user and assistant messages
- `GET /api/v1/agent/conversations` — List all conversations for the authenticated user
- `GET /api/v1/agent/conversations/:conversationId` — Retrieve full message history for a specific conversation

**Data storage:**
- **ChatMessage** Prisma model persists every conversation turn (role, content, confidence score, tool calls, token usage) tied to user accounts
- Congressional portfolio data lives in Ghostfolio's native schema — `Account`, `Order`, and `SymbolProfile` records in PostgreSQL, fully queryable through the existing portfolio API
- All agent tool calls read live data from these database records via Ghostfolio's `PortfolioService`, `OrderService`, and `SymbolProfileService` — no external APIs at query time

### Verification Layer
Every response passes through:
- **Hallucination Detector** — cross-references numbers and ticker symbols against raw tool output (2% tolerance, derived sums/percentages)
- **Domain Constraint Checker** — blocks buy/sell recommendations, price targets, guaranteed returns, and copy-trade suggestions; enforces disclaimers and confidence tags

### Observability (Langfuse)
- Every agent invocation is traced end-to-end: tool calls, LLM latency, token usage, cost
- REST API-based eval reporter pushes all 112 test results as dataset items to the `agentforge-congressional-evals` dataset
- Production-ready monitoring without SDK compatibility issues (direct REST API integration)

## The Data Source

**Primary — House disclosures:**
`https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json`
Fields: `representative`, `transaction_date` (MM/DD/YYYY), `ticker`, `type` (purchase/sale), `amount` (range string)

**Primary — Senate disclosures:**
`https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json`
Fields: `senator`, `transaction_date`, `ticker`, `type`, `amount` (range string)

These are publicly hosted S3 datasets maintained by the [house-stock-watcher](https://housestockwatcher.com/) and [senate-stock-watcher](https://senatestockwatcher.com/) projects, which scrape and structure STOCK Act filings into machine-readable JSON.

**Secondary:** Yahoo Finance API — used during the seeding pipeline to resolve historical prices for each trade at its filing date.

**Storage:** All congressional trade data is ingested into Ghostfolio's PostgreSQL database as native portfolio records (STOCK Act value ranges normalized to midpoint dollar amounts). The agent accesses this data exclusively through Ghostfolio's existing API layer (`PortfolioService`, `OrderService`, etc.) — not through any external API at query time.

**End-to-end flow:** STOCK Act S3 data → seeding script → Ghostfolio's native Prisma models (`Account`, `Order`, `SymbolProfile`) → `PortfolioService` / `OrderService` → agent tools → verification layer → chat API → Angular UI. The new data source is fully integrated into Ghostfolio's existing architecture and exposed to the agent through the app.

## The Impact

### For Retail Investors
- **Portfolio-level analysis** of congressional trades that previously required manual spreadsheet work
- **Natural language queries** — ask "What's Pelosi's tech exposure?" instead of scrolling through hundreds of disclosure PDFs
- **Risk-aware analysis** — the verification layer prevents the agent from crossing into financial advice territory, keeping the tool educational rather than advisory

### For the Ghostfolio Ecosystem
- **New use case** — demonstrates Ghostfolio as a platform for institutional/public portfolio analysis, not just personal wealth management
- **Agent module pattern** — the `libs/agent/` library provides a reusable template for adding AI agents to Ghostfolio with proper verification, observability, and testing
- **112-test eval suite** — 50 agent behavioral evals (happy paths, edge cases, adversarial inputs, multi-step reasoning), 34 hallucination detector tests, and 28 domain constraint tests

### For Financial Transparency
- Makes congressional trading data more accessible and analyzable
- Enforces responsible analysis through domain constraints (no copy-trade suggestions, no "buy what they buy" advice)
- Demonstrates that AI agents in finance can be built with safety guardrails from day one