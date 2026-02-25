---
name: Phase 2 API Keys
overview: Obtain Anthropic and Langfuse API keys, configure them in `.env`, verify connectivity, and fix `.gitignore` to match project rules.
todos:
  - id: fix-gitignore
    content: Add .env.example and .env.dev to .gitignore (project rules require all .env files gitignored)
    status: completed
  - id: anthropic-key
    content: Obtain Anthropic API key from console.anthropic.com and add to .env as ANTHROPIC_API_KEY
    status: completed
  - id: langfuse-keys
    content: Obtain Langfuse public + secret keys from cloud.langfuse.com, add to .env with LANGFUSE_BASEURL
    status: completed
  - id: verify-keys
    content: Smoke-test Anthropic key with a curl request to confirm connectivity
    status: completed
  - id: commit-phase2
    content: Commit .gitignore fix (API keys are in .env which is already gitignored)
    status: completed
isProject: false
---

# Phase 2: Get Your API Keys

Corresponds to **Steps 7-8** of the [buildguide](/.cursor/plans/buildguide.md) (lines 131-161).

**Estimated time:** 15-30 minutes.

---

## Step 1: Fix `.gitignore` (housekeeping from Phase 1)

The [project rules](/.cursor/rules/general.mdc) state that `.env`, `.env.example`, and `.env.dev` must all be gitignored. Currently `[.gitignore](.gitignore)` only covers `.env` and `.env.prod`.

Add these two lines to `.gitignore`:

```
.env.example
.env.dev
```

Then commit the fix so these files aren't accidentally pushed.

---

## Step 2: Anthropic API Key (Required)

1. Go to [console.anthropic.com](https://console.anthropic.com), create an account (or sign in)
2. Navigate to **API Keys** and click **Create Key**
3. Copy the key (starts with `sk-ant-`)

This is the LLM that powers the agent (Claude Sonnet 4). New accounts get $5 in free credits (~500 queries).

---

## Step 3: Langfuse Keys (Required for Observability)

1. Go to [cloud.langfuse.com](https://cloud.langfuse.com), create a free account
2. Create a new project called `agentforge-ghostfolio`
3. Go to **Settings > API Keys > Create API Key**
4. Copy both the **public key** (`pk-lf-...`) and **secret key** (`sk-lf-...`)

Langfuse provides tracing, eval dashboards, and cost tracking for every agent invocation.

---

## Step 4: Update `.env` with API Keys

The current `[.env](.env)` already has commented-out placeholders from Phase 1 setup. Uncomment and populate them:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
LANGFUSE_PUBLIC_KEY=pk-lf-your-key
LANGFUSE_SECRET_KEY=sk-lf-your-key
LANGFUSE_BASEURL=https://cloud.langfuse.com
```

---

## Step 5: Verify API Keys Work

Run quick smoke tests to confirm connectivity before moving to Phase 3:

**Anthropic:**

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":50,"messages":[{"role":"user","content":"Say hello"}]}'
```

**Langfuse:** Verification will happen naturally in Phase 3 when we wire up the `langfuse-langchain` callback handler. No standalone CLI check needed -- just confirm the keys are non-empty and well-formed (`pk-lf-`* / `sk-lf-`*).

---

## Step 6: Commit Phase 2 Changes

```bash
git add .gitignore
git commit -m "chore: gitignore .env.example and .env.dev"
```

Note: `.env` itself is already gitignored so the API keys won't be committed.

---

## Notes

- The `.env` file is gitignored, so secrets stay local. The `.env.dev` and `.env.example` templates should also stay out of version control per project rules.
- Phase 3 (Agent Library) depends on these keys being set, specifically `ANTHROPIC_API_KEY` for the LLM and `LANGFUSE_*` for observability tracing.

