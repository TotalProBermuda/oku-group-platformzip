# Dynamic session management handoff

## State

- Branch: `codex/session-management-dynamic-20261014`.
- Review fixes remain on this PR branch. Commit/push identifiers are supplied in the final handoff, not embedded here as a self-referencing hash. No merge, publish or deployment is authorized.
- This is an implementation/verification handoff, **not a production-readiness sign-off**. The migration is unapplied and baseline TypeScript failures remain.
- Audit completed before implementation: [audit and compatibility notes](dynamic-session-management-audit.md).

## Implemented changes

### Admin editing and policy

The existing experience Schedule interface now includes a reusable editor for defaults, explicitly selected same-series occurrences, and individual occurrence dates. It supports independent EN/ES/PT content/artwork, capacity, ticket prices/availability, operational primary/co-host roles, sponsor rosters and profile roles. Modes distinguish unchanged patches, inherit, override and intentional clear where valid.

The server-backed preview/apply endpoint is:

`/api/v1/admin/series/[id]/session-management`

- GET resolves effective values, sources, inventory and assignment options.
- POST persists a bounded, expiring preview and its payload-bound request identity.
- PATCH applies that stored preview atomically, rechecks authorization, versions, eligibility and inventory, and returns the accepted result on retry.
- Selected edits are limited to 50 explicitly named same-series occurrences. Default previews resolve at most 200 occurrences and disclose inheriting targets separately.
- Local schedule templates change Panama start time/duration, not occurrence dates. Creating a session with defaults is explicit and opt-in.
- Legacy roster/profile write endpoints are retired in favor of preview; their existing panels are read-only. Managed legacy content/catalog writes reject bypasses; remaining compatible writes use row locks.
- Capacity defaults are explicitly per occurrence. `Series.capacityTotal` is an aggregate and never a fallback. Without an explicit capacity default, an opted-in new session keeps its submitted capacity. Without opt-in, even an explicit default does not replace submitted capacity.
- Existing current-SERIES financial assignments support DRAFT/ACTIVE/PAUSED/RETIRED lifecycle changes through this preview/apply, SUPERADMIN only. Activation requires an active actor; status and legacy `isActive` stay synchronized. Snapshot versions include existing terms, scope, lifecycle, actor status and eligibility. Authorization is rechecked on retries. No identity, eligibility, rate, plan, link, attribution or earned amount is edited.
- Financial changes disclose every occurrence in the series, not session-only earnings. Shared GLOBAL/VENUE assignments remain read-only with canonical administration links; CAMPAIGN associations are not inferred. No SESSION financial scope or new commission rule is introduced.

### Commerce, attendance and notices

- Session inventory reconciliation counts counter commitments, pending order lines and active issued tickets. Checkout reservation/order creation, comp issuance, capacity edits and hold expiry use coordinated session locks. Sold-out capacity can increase.
- Product availability is checked server-side against crafted checkout requests. Existing line-item snapshots are not rewritten. New order/ticket entitlement snapshots preserve gift-bag admission treatment when session flags later change.
- Sold occurrence schedule changes require a nonblank postponement reason and an explicit supported ticket treatment. Pending-date holds pause sales/check-in; confirmed replacements preserve ticket/order identities.
- Linked occupancy windows are synchronized; conflict records remain available for operational review.
- Accepted changes and audit details commit with held, immutable localized notices. Recipients are normalized and deduplicated across an accepted change; a single notice can cover multiple affected occurrences.
- Recipient fallback is ticket contact, then purchased-order buyer. No-contact comps are skipped. Checkout locale, then legacy guest-contact locale, then English are used. Preview exposes counts, not contact details.
- The new notice outbox has **no sending handler, dispatcher registration, generic queue call, Redis dependency or inline fallback**.
- Admin admission and its `ExperienceCheckin` record commit in one transaction under the occurrence lock. Audit failure rolls admission back; SSE emits only after success. Isolated tests cover forced audit failure/retry, paused admission and concurrent duplicate scans.

### Main changed-file groups

- Additive storage: `prisma/schema.prisma`, `prisma/migrations/20261014160000_dynamic_session_management/migration.sql`. The standalone SQL was moved into the established tracked migration directory, not executed.
- Resolution/mutations: `src/server/series/sessionFields.ts`, `sessionState.ts`, `sessionManagement.ts`, `localizeSessions.ts`, `effectiveAssignments.ts`, `postponementNotices.ts`, `legacySessionGuard.ts`, and the new admin route.
- Admin UI: `SessionManagementEditor.tsx`, `SessionManagementNotice.tsx`, the existing schedule/host/sponsor panels, and EN/ES/PT admin catalogs.
- Compatibility/safety: existing session/series/host/sponsor/profile/catalog routes; public series/session APIs and artwork mapping; checkout, comp, hold, entitlement and check-in paths.
- Tests: isolated PostgreSQL integration, component rendering, fixture-only desktop/mobile Playwright coverage and updated existing server mocks.
- Review fixes: `sessionState.ts`, `claimAdmission.ts`, admin attendees route, `sessionFinancialAssignments.ts`, `sessionFields.ts`, `SessionManagementEditor.tsx`, three admin catalogs, capacity unit regressions and expanded integration/browser tests.
- Confirmation is opened/focused after React commits the preview, not from an unreliable pre-commit animation callback. Next dev output (`.next-dev`) is separate from production (`.next`); an opt-in build-validation preload blocks external network connections.
- Mockup Sandbox was not changed.

## Exact verification outcomes

| Command | Outcome |
|---|---|
| `npm test -- tests/server/series tests/server/commerce tests/components/session-management.test.tsx tests/server/partnerAssignmentAuthz.test.ts` | **Exit 0: 36 files passed; 1 isolated-DB file skipped. 177 tests passed, 31 skipped.** |
| `RUN_SESSION_MANAGEMENT_DB_TESTS=1 npx vitest run tests/server/series/sessionManagement.database.test.ts` | **Exit 0: 31/31 passed** against the separate local fixture DB, covering the 31 skipped above. |
| `npx playwright test tests/browser/session-management.spec.ts` | First run **exit 1: 18 passed, 2 editor-loading timeouts**. Second run **exit 1: 19 passed, 1 confirmation-focus failure**, subsequently fixed. Mobile viewport: 375×667. No final full-suite rerun, per user instruction. |
| `npx playwright test tests/browser/session-management.spec.ts --grep 'edits a SERIES referral lifecycle\|FB_DIRECTOR fixture\|confirmation dialog receives focus'` | Final targeted rerun **exit 0: 6/6 passed**, 3 desktop + 3 mobile. Covers both original timeouts and focus/keyboard confirmation. Other cases, including draft activation/retirement, passed in the preceding full runs. This is not a fresh full-suite 20/20 pass. |
| `npm run i18n:check` | **Passed**, EN/ES/PT parity across 23 namespaces. |
| `npx prisma validate` | **Passed.** |
| `npx tsc --noEmit --pretty false` | **Exit 2: 172 diagnostics.** Audit baseline: 181; prior pre-build handoff: 171. Additional generated TS2344 exposes the unchanged `partnerIdFromSearch` page export, also present in `main`. A new fixture TS2352 was fixed; no remaining new diagnostic category points to the feature. |
| `DATABASE_URL='postgresql://fixture@127.0.0.1:55432/oku_session_management_test' NODE_OPTIONS='--require=./scripts/validation/no-external-network.cjs' npm run build` | **Exit 0**, 311 generated static pages. Script: `prisma generate && next build`. Existing config skips types/lint, so this does not mean typecheck passed. Warnings: existing CSS `end` compatibility and optional BullMQ `@valkey/valkey-glide`. This build preceded the final fixture cast and small focus-effect fix; it was not redundantly rerun afterward, per user instruction. |

Exact logs:

- [Focused tests](validation/session-management-focused-tests.txt)
- [Isolated database tests](validation/session-management-isolated-db-tests.txt)
- [Desktop/mobile browser tests](validation/session-management-browser-tests.txt)
- [Baseline TypeScript diagnostics](validation/session-management-typescript-baseline.txt)
- [Final TypeScript diagnostics](validation/session-management-typescript-final.txt)
- [Prior 171-diagnostic pre-build comparison](validation/session-management-typescript-prebuild.txt)
- [Production build](validation/session-management-build.txt)
- [Initial browser run](validation/session-management-browser-initial.txt)
- [Final targeted browser run](validation/session-management-browser-targeted.txt)

These verified review-pass results supersede the earlier 174 passed/18 skipped, isolated DB 18/18, browser 12/12 and build-not-run handoff. They are not claims about that earlier checkpoint. Original audit baseline diagnostics are retained.

Browser tests deny unstubbed API calls and use a signed fixture session. They do not log in through demo auth, call live mutation APIs, execute payments, invoke translation providers or send mail. They cover locale editing, exact preview diffs, zero-target default previews, conflict recovery without losing drafts, focus/keyboard confirmation, optional defaults on create, and mobile overflow.

The database suite uses a hard-coded disposable database, never the configured project connection. It covers inheritance/reset/clear, locale and roster isolation, selected-target atomic rejection, staleness and idempotency, sold schedule protections, product disabling, purchased snapshots, held notices and forced notice-write rollback, cross-occurrence recipient deduplication, real concurrent reservations/comp issuance, hold expiry, occupancy synchronization and legacy sponsor merges.

The managed development server was restarted successfully. An unauthenticated 375px screenshot showed the language/login gate; the signed-in editor was verified through the fixture browser suite, not a live account.

## Schema / migration status

- Nullable defaults/modes, purchase entitlement/locale fields, change records and held-notice tables are authored as additive schema changes.
- The tracked migration is **review-only and unapplied to the configured/shared/production database**.
- Prisma client generation was run locally. No application-startup migration/DDL was added.
- Schema synchronization was performed **only** against the disposable local PostgreSQL fixture database on port 55432, named `oku_session_management_test`.
- No `prisma migrate deploy` or raw SQL was run against any shared/managed/production database. Production schema changes require the approved Replit Publish schema-diff review and publication flow. This handoff does not authorize or perform it. Missing `Series.sessionDefaults` in dev logs is consistent with deliberately leaving the shared schema unchanged.

## Remaining blockers and owner decisions

1. **Schema release blocker:** the tracked additive migration remains unapplied. Real-database use requires authorized schema review/application through the approved Replit Publish flow. No production validation writes or backfill were performed.
2. **TypeScript readiness:** 172 diagnostics remain, including one newly generated check of unchanged baseline source. Exact diagnostics are retained; successful build is not a passing typecheck.
3. **Validation provenance:** the full browser run was not repeated after the final focus fix; its affected cases passed in the final targeted run. The build likewise predates that small UI fix.
4. **Owner-only policies remain intentionally unsupported:** refunds, cancellation/financial adjustments, reissue, cross-session transfers, attendee-consent decisions, checked-in-attendee/group treatment, session-only earning/link semantics and notice release/delivery. Shared-scope financial administration and new economic terms remain in canonical tools, not this bounded series editor.

The live Wine Down record, production database, live attendee notices and deployment were not modified by this work. Test notice rows were created only in the isolated fixture database; no messages were sent.
