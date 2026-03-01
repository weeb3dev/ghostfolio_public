---
name: Politician Portfolio Surfacing
overview: Inject politician name-to-userId mapping into the agent so it can resolve "Nancy Pelosi" to the correct UUID, add a "STOCK Act" quick-action button to the chat UI, and ensure politician users are visible/labeled in the admin panel.
todos:
  - id: system-prompt
    content: Add politician name-to-userId mapping to SYSTEM_PROMPT in libs/agent/src/lib/agent.graph.ts
    status: completed
  - id: stock-act-button
    content: Add STOCK Act quick-action button to agent-chat-page.component.html
    status: completed
  - id: verify-seed
    content: Run database:seed:congress and verify politician users appear in admin panel
    status: completed
isProject: false
---

# Politician Portfolio Surfacing

## Problem

The agent's system prompt has **no production mapping** from politician names to user IDs. The mapping only exists in test code ([eval-helpers.ts](libs/agent/src/lib/__tests__/eval-helpers.ts), [agent-eval.spec.ts](libs/agent/src/lib/__tests__/agent-eval.spec.ts)). When a user asks "What is Nancy Pelosi's portfolio?", the LLM has no way to resolve her name to `337a40b0-7ecb-43f4-ae71-94e8790f526c`.

## Computed User IDs (deterministic from seed script)

- Nancy Pelosi: `337a40b0-7ecb-43f4-ae71-94e8790f526c`
- Tommy Tuberville: `af472e58-de71-4662-a27b-5902d74fe44d`
- Dan Crenshaw: `a2aa0fbf-ab13-49f3-ae88-de9f8ea16a83`
- Ron Wyden: `0ff48c0d-ab84-4d47-a8a4-9d51417c3f56`
- Marjorie Taylor Greene: `e3060e1e-9992-4a98-a5d3-969dae3cb140`
- Josh Gottheimer: `ddc9a016-db9f-416c-a61e-ef2b1bf2a2d7`

---

## Change 1: Inject politician mapping into agent system prompt

**File:** [libs/agent/src/lib/agent.graph.ts](libs/agent/src/lib/agent.graph.ts)

Add a section to the `SYSTEM_PROMPT` constant that lists all available politician portfolios with their user IDs:

```
AVAILABLE CONGRESSIONAL PORTFOLIOS (STOCK Act disclosures):
When users ask about a politician's portfolio, use the corresponding userId:
- Nancy Pelosi: 337a40b0-7ecb-43f4-ae71-94e8790f526c
- Tommy Tuberville: af472e58-de71-4662-a27b-5902d74fe44d
- Dan Crenshaw: a2aa0fbf-ab13-49f3-ae88-de9f8ea16a83
- Ron Wyden: 0ff48c0d-ab84-4d47-a8a4-9d51417c3f56
- Marjorie Taylor Greene: e3060e1e-9992-4a98-a5d3-969dae3cb140
- Josh Gottheimer: ddc9a016-db9f-416c-a61e-ef2b1bf2a2d7
```

This mirrors the pattern already used in test code (lines 314-322 of `agent-eval.spec.ts`) but makes it available in production.

---

## Change 2: Add "STOCK Act" quick-action button to agent chat

**File:** [apps/client/src/app/pages/agent-chat/agent-chat-page.component.html](apps/client/src/app/pages/agent-chat/agent-chat-page.component.html)

Add a fourth button inside the `.suggested-prompts` div (after "Risk analysis", line 62):

```html
<button
  mat-stroked-button
  (click)="messageText = 'List all available STOCK Act congressional portfolios and give me a brief summary of each.'; onSendMessage()"
>
  STOCK Act
</button>
```

No TypeScript changes needed -- same inline pattern as the existing buttons.

---

## Change 3: Verify politician users are seeded and visible in admin

The admin panel screenshot shows only 1 user (`d5b5b45c-...`), meaning either:

- The seed script hasn't been run yet, or
- The politician users exist but pagination/filtering hides them

**Action:** Run `npm run database:seed:congress` (defined in [package.json](package.json) line 26) to ensure the 6 politician users exist, then verify they appear in the admin Users list.

The admin users component ([admin-users.component.ts](apps/client/src/app/components/admin-users/admin-users.component.ts)) already shows all users via `AdminService.fetchUsers()` with pagination -- no filter excludes `ANONYMOUS` provider users. The politician users should show once seeded.

---

## Out of Scope (future improvement)

- Adding politician name labels to the admin user list (currently shows raw UUIDs only -- would require schema changes or a display name lookup)
- Creating a dedicated "list politicians" tool for the agent (the system prompt approach is sufficient for 6 politicians)

