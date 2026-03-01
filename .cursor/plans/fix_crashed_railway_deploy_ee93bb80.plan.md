---
name: Fix Crashed Railway Deploy
overview: Restore the Postgres service that was accidentally overwritten by an app deploy, then redeploy the ghostfolio-agent service.
todos:
  - id: restore-postgres
    content: Rollback the Postgres service to its previous deployment (4e00960c) — either via Railway dashboard or CLI redeploy
    status: completed
  - id: redeploy-agent
    content: Once Postgres is healthy, redeploy the ghostfolio-agent service
    status: completed
  - id: verify-site
    content: Confirm both services are active and the site is responding
    status: completed
isProject: false
---

# Fix Crashed Railway Deployment

## Root Cause

The Railway MCP `deploy` tool was linked to the **Postgres** service when triggered. Deployment `2b4c2791` pushed the app's Dockerfile to the Postgres service, replacing the `ghcr.io/railwayapp-templates/postgres-ssl:17` database image. This took down Postgres, which caused `ghostfolio-agent` to crash-loop on `prisma migrate deploy` (P1001: Can't reach database).

## Fix Steps

### Step 1 — Restore the Postgres service

The Postgres service needs to be rolled back to its previous working deployment (`4e00960c`, image `ghcr.io/railwayapp-templates/postgres-ssl:17`).

**Option A (Railway Dashboard — recommended):** Go to the Railway project dashboard, click on the Postgres service, find deployment `4e00960c` (the last successful one before the bad deploy), and click "Redeploy" or "Rollback".

**Option B (Railway CLI):** Use `railway redeploy` targeting the Postgres service with the previous deployment ID:

```bash
railway redeploy --deployment 4e00960c-d96d-4d97-a415-d4f2d4e293a2
```

The Postgres volume (`postgres-volume`) should still have the data intact since volumes persist across deployments.

### Step 2 — Wait for Postgres to come up

After the Postgres rollback, wait for the service to show "Active" / healthy in the Railway dashboard. The Redis service (separate from Postgres) should already be running fine.

### Step 3 — Redeploy ghostfolio-agent

Once Postgres is back, redeploy the `ghostfolio-agent` service. Its current deployment (`4c176bd7`) has the correct code but just needs Postgres to be available. A simple restart/redeploy should work:

```bash
railway link --service ghostfolio-agent
railway redeploy
```

Or use the Railway MCP `deploy` tool with `service: "ghostfolio-agent"` explicitly.

### Step 4 — Verify

Confirm both services show "Active" in the Railway dashboard, then test the site.

## Prevention

After fixing, re-link the CLI to `ghostfolio-agent` so future deploys always target the right service.