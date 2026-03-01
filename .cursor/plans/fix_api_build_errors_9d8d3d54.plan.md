---
name: Fix API Build Errors
overview: "The API server has build errors preventing it from serving requests, which causes the blank screen at localhost:4200. Two root causes need to be fixed: stale Prisma client (ChatMessage model not generated) and a webpack watch-mode issue with module resolution for @ghostfolio/agent/*."
todos:
  - id: prisma-migrate
    content: Run `npx prisma migrate dev --name added_chat_message` to create migration and regenerate client
    status: completed
  - id: restart-server
    content: Kill PID 26477, restart API server with `npm run start:server`
    status: completed
  - id: verify
    content: Check terminal for successful compilation and test localhost:4200/en in browser
    status: completed
isProject: false
---

# Fix API Build Errors Causing Blank Screen

## Root Cause Analysis

The blank screen at `localhost:4200/en` is caused by the **API server not running**. It failed to build and is stuck at "Build failed, waiting for changes to restart...". All endpoints (including `/api/v1/info`) return 500 because there's no API process to serve them.

The API server terminal ([`822888.txt`]) shows:

- The API initially compiled and ran successfully
- Code changes broke the build during watch mode
- There are now **3 webpack module-resolution errors** and **11 TypeScript errors**

### Error Category 1: `@ghostfolio/agent/`* Module Resolution (3 webpack + 3 TS errors)

Webpack cannot resolve `@ghostfolio/agent/agent.module` and `@ghostfolio/agent/agent.service`.

The path mapping in `[tsconfig.base.json](tsconfig.base.json)` line 20 is correct:

```
"@ghostfolio/agent/*": ["libs/agent/src/lib/*"]
```

and the target files exist at `libs/agent/src/lib/agent.module.ts` and `libs/agent/src/lib/agent.service.ts`.

**The initial build DID succeed** (terminal line 32: "webpack compiled successfully"), meaning the resolution configuration is correct. The failure started only after file changes triggered a watch rebuild that coincided with TS type errors. This is a known webpack watch-mode state corruption issue. **A server restart should fix this.**

### Error Category 2: `chatMessage` Not Found on PrismaService (6 TS errors)

The `ChatMessage` model exists in `[prisma/schema.prisma](prisma/schema.prisma)` (line 119), but:

- No migration was created (last migration is `20251103162035_added_oidc_to_provider`)
- The Prisma client was never regenerated, so `PrismaService` doesn't have a `chatMessage` property

This affects `[agent.controller.ts](apps/api/src/app/endpoints/agent/agent.controller.ts)` which uses `this.prismaService.chatMessage.`* in 6 places.

### Error Category 3: Cascading Type Errors (2 TS errors)

- `verified` not in `AgentChatResponse` (line 92) -- phantom error caused by the module resolution failure making `result` untyped
- `slice` not on `unknown` (line 141) -- phantom error from Map.get returning `unknown` due to broken types

Both resolve automatically when categories 1 and 2 are fixed.

## Fix Steps

### Step 1: Apply Prisma Schema and Regenerate Client

Run `prisma migrate dev` to create a migration for the `ChatMessage` model and regenerate the client:

```bash
npx prisma migrate dev --name added_chat_message
```

This creates the `ChatMessage` table in PostgreSQL AND regenerates the Prisma client with the `chatMessage` property.

Verify with: `npx prisma migrate status`

### Step 2: Restart the API Server

Kill the current broken build process (PID 26477) and restart:

```bash
# Kill the stuck server
kill 26477

# Restart
npm run start:server
```

The fresh build should:

- Pick up the regenerated Prisma client (fixing chatMessage errors)
- Resolve `@ghostfolio/agent/*` paths cleanly (fresh webpack compilation)

### Step 3: Verify

- Check the API server terminal for "webpack compiled successfully" and "No errors found"
- Visit `https://localhost:4200/en` -- should render the Ghostfolio UI
- Check browser DevTools -- `/api/v1/info` should return 200 with JSON

### If Module Resolution Still Fails After Restart

If `@ghostfolio/agent/*` still can't be resolved, the fallback fix is to clear the Nx cache and rebuild:

```bash
npx nx reset
npm run start:server
```

If it STILL fails, there may be an issue with the circular dependency between `libs/agent/` (which imports from `@ghostfolio/api/*`) and `apps/api/` (which imports from `@ghostfolio/agent/*`). In that case, we'd need to adjust the webpack config at `[apps/api/webpack.config.js](apps/api/webpack.config.js)` to explicitly add a tsconfig-paths alias.