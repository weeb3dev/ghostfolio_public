---
name: Fix Missing ChatMessage Migration
overview: The agent 500 errors are caused by a missing Prisma migration for the `ChatMessage` table. The model exists in schema.prisma but was never migrated (likely added via `prisma db push` locally). Production runs `prisma migrate deploy` which only applies existing migration files, so the table was never created on Railway.
todos:
  - id: gen-migration
    content: Generate the ChatMessage migration file with `prisma migrate dev --name add_chat_message --create-only`, then resolve it locally
    status: completed
  - id: redeploy
    content: Redeploy to Railway via the deploy MCP tool so entrypoint runs `prisma migrate deploy` with the new migration
    status: completed
  - id: verify
    content: Check Railway deploy logs for successful migration and test the agent chat endpoint
    status: completed
isProject: false
---

# Fix Missing ChatMessage Migration

## Root Cause

The Railway deploy logs confirm the exact error:

```
PrismaClientKnownRequestError: 
The table `public.ChatMessage` does not exist in the current database.
  code: 'P2021'
```

The `ChatMessage` model exists in [prisma/schema.prisma](prisma/schema.prisma) (lines 119-134) but there is **no corresponding migration file** in `prisma/migrations/`. During development it was likely synced via `prisma db push`, which modifies the local DB directly without creating a migration. The production entrypoint ([docker/entrypoint.sh](docker/entrypoint.sh)) runs `prisma migrate deploy`, which only applies existing migration SQL files — so the table was never created on Railway.

## Errors Explained

- **500 on `/api/v1/agent/conversations`**: `prismaService.chatMessage.groupBy()` hits a non-existent table
- **500 on `/api/v1/agent/chat`**: `prismaService.chatMessage.findMany()` hits a non-existent table
- **401 on `/api/v1/user`**: Normal behavior — the Angular frontend makes an initial unauthenticated request before login. Auth is actually working (logs show a valid user ID on the agent endpoints)

## Fix

### Step 1: Generate the migration locally

Run against the local dev database (which already has the table via `db push`):

```bash
npx prisma migrate dev --name add_chat_message --create-only
```

The `--create-only` flag generates the migration SQL file without applying it (since the local DB already has the table). This will create a file like `prisma/migrations/2026XXXX_add_chat_message/migration.sql` containing:

```sql
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL,
    "toolCalls" JSONB,
    "tokensUsed" INTEGER,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");
CREATE INDEX "ChatMessage_userId_idx" ON "ChatMessage"("userId");
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Then mark it as applied locally so `migrate dev` doesn't try to re-run it:

```bash
npx prisma migrate resolve --applied <migration_name>
```

### Step 2: Redeploy to Railway

Use the Railway MCP `deploy` tool. The entrypoint will run `prisma migrate deploy`, which will now find and apply the new ChatMessage migration.

### Step 3: Verify

Pull the deploy logs via `get-logs` MCP tool and confirm:

- Migration applied successfully (no P2021 errors)
- Agent chat endpoint works (test via browser or curl)

