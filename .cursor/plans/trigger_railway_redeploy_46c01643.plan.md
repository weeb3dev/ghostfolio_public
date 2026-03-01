---
name: Trigger Railway redeploy
overview: Trigger a manual Railway deployment to get the latest commit (userId auto-injection + UI improvements) live in production.
todos:
  - id: trigger-deploy
    content: Trigger manual Railway deploy for ghostfolio-agent service and monitor until SUCCESS
    status: completed
isProject: false
---

# Trigger Railway Redeploy

## Problem

The currently running Railway deployment (`b8079f09`, created `18:09 UTC`) predates our latest push (`4f03d938a` at `21:11 UTC`). Railway did not auto-deploy. This means:

- The userId auto-injection is NOT live
- The chat UI improvements (markdown rendering, input visibility fix) may also be missing

## Fix

Use the Railway MCP `deploy` tool to trigger a manual deploy of the `ghostfolio-agent` service from the current workspace, then monitor until it reaches SUCCESS status.

One command: `deploy` with `workspacePath` and `service: "ghostfolio-agent"`.