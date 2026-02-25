---
name: Phase 1 Environment Setup
overview: Get Ghostfolio running locally with PostgreSQL, Redis, a populated .env, and a seeded database -- establishing a working baseline before any agent code is written.
todos:
  - id: verify-node
    content: Verify Node.js >=22.18.0 is installed
    status: completed
  - id: npm-install
    content: Run npm install (includes prisma generate postinstall)
    status: completed
  - id: create-env
    content: Copy .env.dev to .env and fill in all <INSERT_*> placeholders with dev secrets
    status: completed
  - id: docker-up
    content: Start PostgreSQL and Redis via docker compose -f docker/docker-compose.dev.yml up -d
    status: completed
  - id: db-setup
    content: Run npm run database:setup (prisma db push + seed)
    status: completed
  - id: start-verify
    content: Start server (npm run start:server) + client (npm run start:client), verify at https://localhost:4200/en
    status: completed
  - id: git-init
    content: Initialize git repo with initial commit as baseline for agent development
    status: completed
isProject: false
---

# Phase 1: Environment Setup

## Context

The workspace is an existing Ghostfolio fork at `/Users/n0destradamus/Documents/GhostfolioAIagent`. The Nx monorepo structure, Docker configs, and Prisma schema are all in place. We need to wire up the local environment and get the app running.

**Important:** The buildguide has several inaccuracies vs the actual repo. This plan reflects what the repo actually expects.

---

## Step 1: Verify Node.js Version

The repo requires Node `>=22.18.0` (per [package.json](package.json) line 206). The buildguide incorrectly says "20+".

```bash
node -v
```

If below 22.18.0, install via `nvm install 22` or download from nodejs.org.

---

## Step 2: Install Dependencies

```bash
npm install
```

This also runs `prisma generate` as a postinstall hook (line 37 of `package.json`). Expect 2-5 minutes. Peer dependency warnings are normal -- do not use `--force`.

---

## Step 3: Create the `.env` File

No `.env` exists yet. Per [DEVELOPMENT.md](DEVELOPMENT.md) line 10, copy `.env.dev` and populate the placeholders:

```bash
cp .env.dev .env
```

Then fill in the `<INSERT_*>` placeholders in `.env`:

- `REDIS_PASSWORD` -- any string (e.g. `ghostfolio-redis-dev`)
- `POSTGRES_PASSWORD` -- any string (e.g. `ghostfolio-pg-dev`)
- `ACCESS_TOKEN_SALT` -- random string (e.g. generate with `openssl rand -hex 16`)
- `JWT_SECRET_KEY` -- random string (e.g. generate with `openssl rand -hex 16`)

The resulting `DATABASE_URL` will interpolate to:
`postgresql://user:<your-pg-password>@localhost:5432/ghostfolio-db`

We will also add comment placeholders for the AI keys needed in Phase 2:

```
# Phase 2 (not yet):
# ANTHROPIC_API_KEY=
# LANGFUSE_PUBLIC_KEY=
# LANGFUSE_SECRET_KEY=
# LANGFUSE_BASEURL=
```

---

## Step 4: Start PostgreSQL and Redis via Docker

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

Verify with `docker ps` -- expect two containers: `gf-postgres-dev` (port 5432) and `gf-redis-dev` (port 6379).

The compose file ([docker/docker-compose.dev.yml](docker/docker-compose.dev.yml)) extends [docker/docker-compose.yml](docker/docker-compose.yml) and reads credentials from the root `.env` file.

**Port conflict handling:** If 5432 or 6379 are in use, either stop the conflicting service or override in `.env` with `POSTGRES_PORT=5433` / `REDIS_PORT=6380` (the compose file supports this via `${POSTGRES_PORT:-5432}` syntax).

---

## Step 5: Initialize Database Schema and Seed

The buildguide says `prisma migrate dev` but Ghostfolio actually uses `db push` for dev:

```bash
npm run database:setup
```

This runs two things (per `package.json` line 26):

1. `prisma db push` -- syncs the Prisma schema to Postgres (no migration files)
2. `prisma db seed` -- runs [prisma/seed.mts](prisma/seed.mts) which creates two default tags (`EMERGENCY_FUND`, `EXCLUDE_FROM_ANALYSIS`)

---

## Step 6: Start Dev Servers and Verify

The buildguide says `npm run start:dev` but that script does not exist. Ghostfolio runs server and client separately:

**Terminal 1 -- API server:**

```bash
npm run start:server
```

This runs `nx run api:copy-assets && nx run api:serve --watch` and serves the NestJS API on port 3333.

**Terminal 2 -- Angular client:**

```bash
npm run start:client
```

This runs the Angular dev server with HMR on port 4200.

**Verify:** Open `https://localhost:4200/en` in a browser (note: HTTPS, not HTTP). You should see the Ghostfolio login page. Create a new user via "Get Started" -- the first user gets the `ADMIN` role.

---

## Step 7: Initialize Git for Agent Development

The workspace is not currently a git repo. We should initialize one and make an initial commit to track our changes:

```bash
git init
git add .
git commit -m "chore: initial commit — ghostfolio fork baseline"
```

This gives us a clean baseline to diff against as we add agent code in subsequent phases.

---

## Buildguide vs Reality: Key Corrections


| Buildguide Says                                 | Actual                                                          |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Node.js 20+                                     | Node.js >=22.18.0                                               |
| `npm run start:dev`                             | `npm run start:server` + `npm run start:client` (two terminals) |
| `npx prisma migrate dev`                        | `npm run database:setup` (uses `db push`, not migrations)       |
| `DATABASE_URL` with ghostfolio/ghostfolio creds | Uses `user`/`<your-password>` per `.env.dev` template           |
| `http://localhost:4200`                         | `https://localhost:4200/en` (HTTPS + locale path)               |


