# Reconciled release candidate — 3 October 2026

## Source reconciliation completed

- GitHub main: `2b016f88c947ef420ad6ba44b670771b158ea995`; PR #107 is already merged.
- Replit clean HEAD: `8b5c6cc140a3ce114f299adea51f30111e79ff60`.
- Preserved unchanged Replit history on `codex/replit-reconciliation-20261003` in the existing GitHub repository. This is a source recovery point, not a database backup or proof of a rollback deployment.
- Combined that snapshot with current main locally on `codex/reconciled-release-20261003`, with no merge conflicts and no Replit checkout changes.
- All 23 Replit-only files retained, including schema declarations, referrer identity/access changes, navigation, web-font fallback changes, configuration, project notes and an existing asset. No broad reset or overwrite performed.

## Findings and classifications

1. **Schema drift:** PasswordlessToken, RateLimitBucket, CommissionAllocationAdjustment, normalized ticket/reservation email fields and customerLocale have matching historical migration SQL already in main. These declarations were missing from main's schema. Restoring source declarations is not evidence of production schema parity; do not apply DDL or approve a Publish schema change on that assumption. Prisma schema validation passed using a dummy URL without connecting to a database.
2. **Access drift:** Replit admits ATTENDEE to the /referrer server-side identity check and adds PARTNER_SELLER to referrer roles. Existing active identity checks and audit-linked actor lookup were preserved. Because this differs from main's access policy, keep this candidate under review rather than silently promoting it. Broader endpoint access/revocation coverage remains required.
3. **Navigation regression fixed:** Replit's shared dashboard helper omitted ADMIN_FINANCE. Restored its existing /admin/payouts destination and added finance-only and mixed-role tests. No permissions granted.
4. **Startup contradiction fixed in candidate:** Replit notes say Publish owns production schema changes, but the production start script still ran migrate resolve and migrate deploy. The legacy-named script now only execs the web server. Mocked executable tests verify default/configured ports and no npx/database commands. This has NOT been deployed. Manual post-merge.sh still invokes migrate deploy; do not install/run it as a reconciliation step.
5. **Onboarding remains unfinished:** Existing token-purpose schema does not establish a 24-hour invitation implementation. passwordless.ts still uses one 15-minute TTL and 15-minute email copy. No invitations sent or token lifetimes changed in this pass.

## Test evidence

```sh
npx vitest run tests/server/payments tests/server/cybersource tests/server/commerce tests/server/reservations tests/server/rbac/roleSplitAuthz.test.ts tests/server/dashboardNavigation.test.ts tests/server/referrerShareSurface.test.ts
```

Local candidate: **208 tests passed across 30 files**. `git diff --check` passed. `prisma validate` passed. Tests use isolated mocks; no real payment, refund, invitation, database migration or live customer data operation was performed. This is not a full build, real-device or production certification.

## Release hold / remaining checks

- Review preserved access-policy differences and test linked-identity ownership/revocation across every referrer endpoint.
- Read-only production schema parity and deployment configuration inspection; no migration permitted under current authorization.
- Clean dependency installation/build/type checks and role-specific browser tests.
- Identify and verify a prior working deployment as rollback. Source snapshot alone does not suffice.
- No merge or production deployment of this combined candidate until these gates pass. Avoid switching the live Replit checkout to the review branch.
- Cumulative refund/idempotency and partial/bundle reconciliation still need separate implementation; this candidate must not be represented as solving those.

No pull/republish needed for this draft. After approved merge only, the standard Replit commands are:

```sh
git status
GIT_EDITOR=true git pull --no-rebase origin main
```

Stop on conflicts or any proposed database removal/migration; do not use db push --accept-data-loss.
