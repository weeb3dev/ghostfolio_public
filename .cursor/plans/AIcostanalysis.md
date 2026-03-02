# AI Cost Analysis — AgentForge

## Development & Testing Costs

### Actual Spend During Development (Feb 24–28, 2026)

All LLM cost data sourced from Langfuse production traces (12 traced generations across Feb 25–28).

| Cost Category | Amount |
|--------------|--------|
| **LLM API Costs (Anthropic — Claude Sonnet 4)** | |
| Traced production queries (12 generations) | $0.37 |
| Eval suite runs (~3 full runs during development, 50 tests each) | ~$4.70 |
| Untracted dev/debug queries (Cursor + direct API) | ~$5–10 (estimated) |
| **Total LLM API spend (estimated)** | **~$10–15** |
| | |
| **Token Consumption (from Langfuse traces)** | |
| Total input tokens (traced) | 85,049 |
| Total output tokens (traced) | 7,986 |
| Total tokens (traced) | 93,035 |
| Total API calls (traced) | 12 |
| | |
| **Development Tools** | |
| Cursor Ultra Plan | $200/month |
| Anthropic Claude Max Plan | $100/month |
| | |
| **Infrastructure** | |
| Railway (Basic plan — app + Postgres + Redis) | $5/month |
| Langfuse Cloud (free tier) | $0/month |

### Cost Per Eval Run

Each full eval suite run (50 tests) invokes the real Claude Sonnet 4 API. Based on Langfuse data:

| Metric | Value |
|--------|-------|
| Tests per run | 50 (LLM) + 62 (unit, free) |
| Avg input tokens per query | 7,087 |
| Avg output tokens per query | 666 |
| Avg cost per query | $0.031 |
| **Estimated cost per 50-test eval run** | **~$1.56** |

Single-tool queries average $0.019/query (4,449 input + 365 output tokens). Multi-tool queries average $0.056/query (12,364 input + 1,266 output tokens).

---

## Production Cost Projections

### Model Pricing (confirmed from Langfuse)

| Model | Input Price | Output Price |
|-------|-----------|-------------|
| Claude Sonnet 4 (`claude-sonnet-4-20250514`) | $3.00 / 1M tokens | $15.00 / 1M tokens |

### Assumptions

| Parameter | Value | Source |
|-----------|-------|--------|
| Queries per user per day | 5 | Estimated — casual portfolio check-ins |
| Avg input tokens per query | 7,087 | **Langfuse actual** (12 traced queries) |
| Avg output tokens per query | 666 | **Langfuse actual** |
| Avg cost per query | $0.031 | **Langfuse actual** |
| Mix: ~67% single-tool, ~33% multi-tool | Observed | 8 single / 4 multi in traced data |
| Verification overhead | <100ms, $0 LLM cost | Pure function, no API calls |
| Infrastructure | Railway Basic ($5) scales to ~$25-50 at higher loads | Railway pricing |

### Per-Query Cost Breakdown (from real data)

| Query Type | Input Tokens | Output Tokens | Avg Cost |
|-----------|-------------|---------------|----------|
| Single-tool (portfolio summary, asset lookup, etc.) | 4,449 | 365 | $0.019 |
| Multi-tool (compare portfolios, analyze + rebalance) | 12,364 | 1,266 | $0.056 |
| **Weighted average** | **7,087** | **666** | **$0.031** |

### Monthly Projections

| Scale | Users | Queries/Month | Monthly LLM Cost | Infrastructure | Total |
|-------|-------|---------------|-------------------|----------------|-------|
| **100 users** | 100 | 15,000 | ~$468 | ~$5 | **~$473/month** |
| **1,000 users** | 1,000 | 150,000 | ~$4,680 | ~$25 | **~$4,705/month** |
| **10,000 users** | 10,000 | 1,500,000 | ~$46,800 | ~$200 | **~$47,000/month** |
| **100,000 users** | 100,000 | 15,000,000 | ~$468,000 | ~$1,500 | **~$469,500/month** |

### Cost Per User Per Month

| Scale | Cost/User/Month |
|-------|----------------|
| 100 users | ~$4.73 |
| 1,000 users | ~$4.71 |
| 10,000 users | ~$4.70 |
| 100,000 users | ~$4.70 |

Cost is approximately linear — LLM API is the dominant expense (~99% of total). Infrastructure scales sub-linearly.

---

## Why Actual Costs Are Higher Than Initial Estimates

The initial cost analysis (drafted before Langfuse data was available) estimated ~$0.02/query based on assumed token counts (~2,250 input, ~850 output). Real Langfuse data shows the actual average is $0.031/query — roughly 55% higher — because:

1. **System prompt is larger than estimated:** The prompt includes identity, rules, congressional portfolio UUID mapping, and formatting instructions (~4,000+ tokens of context per query)
2. **Tool schemas add overhead:** 5 tool definitions with Zod schemas are serialized into every LLM call
3. **Multi-tool queries are expensive:** The 33% of queries that chain 2-3 tools accumulate context with each tool result injected back into the conversation

---

## Cost Optimization Strategies

### Quick Wins (applicable now)

- **System prompt compression:** The current prompt can likely be shortened by 30-40% without losing effectiveness — the congressional portfolio UUID table and formatting instructions are verbose
- **Model tiering:** Use Claude Haiku for simple single-tool queries (asset lookups, basic summaries), Sonnet only for multi-step reasoning. Haiku is ~10x cheaper — this alone could cut costs by 40-50% since 67% of queries are single-tool

### At 1,000+ Users

- **Response caching:** Common queries (e.g., "What's Pelosi's portfolio?") could be cached for 15-minute windows. Congressional portfolios update infrequently — caching could eliminate 30-50% of LLM calls
- **Prompt caching:** Anthropic's prompt caching feature could reduce input token costs for the repeated system prompt and tool schemas

### At 10,000+ Users

- **Pre-computed summaries:** Run batch portfolio analysis daily, serve from cache without LLM
- **Streaming responses:** Already supported by LangGraph — reduces perceived latency but not cost
- **Fine-tuned smaller model:** A fine-tuned model could replace Sonnet for routine single-tool queries

### At 100,000+ Users

- **Open-source LLM:** Llama or Mistral for commodity queries, Claude only for complex multi-step reasoning
- **Self-hosted inference:** Reduces per-token cost by ~80% at scale
- **CDN for static analysis:** Pre-computed congressional portfolio snapshots served without LLM

---

## Key Takeaways

1. **Real cost is $0.031/query** — 55% higher than naive estimates due to system prompt size and tool schema overhead
2. **LLM API dominates** — infrastructure is <1% of total cost at all scales ($5/month Railway vs $468+/month Anthropic)
3. **Input tokens are the main driver** — 7,087 avg input vs 666 avg output. System prompt compression is the highest-leverage optimization
4. **Verification adds zero LLM cost** — hallucination detection and domain constraint checking are pure functions (<100ms, $0)
5. **Eval suite is affordable** — ~$1.56 per full 50-test run, practical for CI integration
6. **Model tiering + caching could cut costs 50-70%** — most impactful optimization before scaling
7. **Development tooling ($305/month)** dwarfs LLM API costs during the build phase — Cursor Ultra + Claude Max + Railway