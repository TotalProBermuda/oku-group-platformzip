---
name: Seed reseed FK gotcha
description: npm run seed crashes when re-run against a non-fresh DB due to an InvuIntegrationCredential -> Venue FK; use non-destructive scripts instead.
---

# Seed reseed FK gotcha

`prisma/seed.ts` starts with a clean-slate block that calls `venue.deleteMany()` (near the
top). `InvuIntegrationCredential` has a FK to `Venue` and is NOT deleted first, so on any
**non-fresh** database the reseed aborts with
`InvuIntegrationCredential_venueId_fkey` violation before later seed steps run. On a
truly fresh DB the seed works because there are no dependent rows.

**How to apply:** to backfill/provision data on a live or already-seeded dev DB, write a
small **non-destructive** one-off `tsx` script that upserts only what you need (and delete
it afterward) rather than running `npm run seed`. `tsx` resolves the `@/` path alias, so
scripts can import `src/server/...` services directly.

**Why:** re-running the full seed to apply one additive change risks the FK crash and, worse,
wipes real dev data via the clean-slate block. The FK-ordering bug itself is pre-existing and
was left unfixed (out of scope when encountered) — fixing it means deleting dependent rows
(e.g. InvuIntegrationCredential) before `venue.deleteMany()`.
