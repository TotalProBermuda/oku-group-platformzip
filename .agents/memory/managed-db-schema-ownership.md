---
name: Managed database schema ownership
description: Deployment and schema-parity rules for the project's Replit-managed PostgreSQL databases.
---

Replit Publish is the only owner of production schema changes. Production and development application startup commands must not run `prisma migrate deploy` or other DDL.

**Why:** Startup-time Prisma migrations can conflict with Publish's development-to-production schema synchronization. A failed Prisma ledger entry then crash-loops Autoscale promotion even when the application build is healthy.

**How to apply:** Keep startup commands limited to client generation when needed and starting the application. Apply schema source changes to development through the configured post-merge flow, inspect the Publish schema diff, and proceed only when it contains no unintended removals or data-loss warnings.

Before publishing feature-branch schema changes, confirm development contains both the new objects and all production-backed models from intervening merges.

**Why:** A stale feature branch can merge valid new models while silently dropping newer schema declarations. Publish then interprets the omissions as instructions to delete live tables or columns.

**How to apply:** Compare the development-to-production diff after schema reconciliation. Restore omitted declarations before publishing; never approve a destructive diff merely to unblock a release.