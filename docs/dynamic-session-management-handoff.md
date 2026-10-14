# Dynamic session management handoff

## State

- Branch: `codex/session-management-dynamic-20261014`.
- Changes remain uncommitted in the working tree. No merge, push, publish or deployment was performed.
- Implementation was stopped at the user's request after desktop/mobile browser validation. **The original task is not complete and this is not a production-readiness sign-off.**
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

### Commerce, attendance and notices

- Session inventory reconciliation counts counter commitments, pending order lines and active issued tickets. Checkout reservation/order creation, comp issuance, capacity edits and hold expiry use coordinated session locks. Sold-out capacity can increase.
- Product availability is checked server-side against crafted checkout requests. Existing line-item snapshots are not rewritten. New order/ticket entitlement snapshots preserve gift-bag admission treatment when session flags later change.
- Sold occurrence schedule changes require a nonblank postponement reason and an explicit supported ticket treatment. Pending-date holds pause sales/check-in; confirmed replacements preserve ticket/order identities.
- Linked occupancy windows are synchronized; conflict records remain available for operational review.
- Accepted changes and audit details commit with held, immutable localized notices. Recipients are normalized and deduplicated across an accepted change; a single notice can cover multiple affected occurrences.
- Recipient fallback is ticket contact, then purchased-order buyer. No-contact comps are skipped. Checkout locale, then legacy guest-contact locale, then English are used. Preview exposes counts, not contact details.
- The new notice outbox has **no sending handler, dispatcher registration, generic queue call, Redis dependency or inline fallback**.

### Main changed-file groups

- Additive storage: `prisma/schema.prisma`, `prisma/session-management-additive.sql`.
- Resolution/mutations: `src/server/series/sessionFields.ts`, `sessionState.ts`, `sessionManagement.ts`, `localizeSessions.ts`, `effectiveAssignments.ts`, `postponementNotices.ts`, `legacySessionGuard.ts`, and the new admin route.
- Admin UI: `SessionManagementEditor.tsx`, `SessionManagementNotice.tsx`, the existing schedule/host/sponsor panels, and EN/ES/PT admin catalogs.
- Compatibility/safety: existing session/series/host/sponsor/profile/catalog routes; public series/session APIs and artwork mapping; checkout, comp, hold, entitlement and check-in paths.
- Tests: isolated PostgreSQL integration, component rendering, fixture-only desktop/mobile Playwright coverage and updated existing server mocks.
- Mockup Sandbox was not changed.

## Exact verification outcomes

| Command | Outcome |
|---|---|
| `npm test -- tests/server/series tests/server/commerce tests/components/session-management.test.tsx tests/server/partnerAssignmentAuthz.test.ts` | **35 files passed; 1 isolated-DB file skipped in this invocation. 174 tests passed, 18 skipped.** |
| `RUN_SESSION_MANAGEMENT_DB_TESTS=1 npx vitest run tests/server/series/sessionManagement.database.test.ts` | **18/18 passed** against the separate local fixture database. |
| `npx playwright test tests/browser/session-management.spec.ts` | **12/12 passed: 6 desktop, 6 mobile.** The mobile viewport is 375×667. |
| `npm run i18n:check` | **Passed**, EN/ES/PT parity across 23 namespaces. |
| `npx prisma validate` | **Passed.** |
| `npx tsc --noEmit --pretty false` | **Failed: 171 diagnostic headers remain, versus 181 in the pre-change baseline.** No new diagnostic file/error-code category was found; introduced diagnostics and touched admission/issuance errors were fixed. |
| `npm run build` | **Not run. No successful production build is claimed.** The script is `prisma generate && next build`. The known standalone TypeScript failures remain a build-readiness blocker. |

Exact logs:

- [Focused tests](validation/session-management-focused-tests.txt)
- [Isolated database tests](validation/session-management-isolated-db-tests.txt)
- [Desktop/mobile browser tests](validation/session-management-browser-tests.txt)
- [Baseline TypeScript diagnostics](validation/session-management-typescript-baseline.txt)
- [Final TypeScript diagnostics](validation/session-management-typescript-final.txt)

Browser tests deny unstubbed API calls and use a signed fixture session. They do not log in through demo auth, call live mutation APIs, execute payments, invoke translation providers or send mail. They cover locale editing, exact preview diffs, zero-target default previews, conflict recovery without losing drafts, focus/keyboard confirmation, optional defaults on create, and mobile overflow.

The database suite uses a hard-coded disposable database, never the configured project connection. It covers inheritance/reset/clear, locale and roster isolation, selected-target atomic rejection, staleness and idempotency, sold schedule protections, product disabling, purchased snapshots, held notices and forced notice-write rollback, cross-occurrence recipient deduplication, real concurrent reservations/comp issuance, hold expiry, occupancy synchronization and legacy sponsor merges.

The managed development server was restarted successfully. An unauthenticated 375px screenshot showed the language/login gate; the signed-in editor was verified through the fixture browser suite, not a live account.

## Schema / migration status

- Nullable defaults/modes, purchase entitlement/locale fields, change records and held-notice tables are authored as additive schema changes.
- The SQL file is **review-only and unapplied to the configured/shared/production database**.
- Prisma client generation was run locally. No application-startup migration/DDL was added.
- Schema synchronization was performed **only** against the disposable local PostgreSQL fixture database on port 55432, named `oku_session_management_test`.
- The new feature requires the additive schema to be approved/applied through the project's normal database-change process before use against a real database. This handoff does not authorize that operation.

## Remaining blockers and owner decisions

1. **Original-scope gap: scoped referrer editing is not integrated into the new preview/apply workflow.** Applicable existing GLOBAL/VENUE/SERIES assignments are displayed with a link to the canonical Referrals administration. Profile display roles are editable, but financial assignments remain managed by their existing tools. No SESSION referral scope or new commission/link eligibility was invented. CAMPAIGN assignments remain in canonical scope administration.
2. **TypeScript/build readiness:** the 171 remaining baseline diagnostics are recorded exactly above. A production build has not been run or verified. Baseline sandbox alias/import errors, translation-model typing and unrelated legacy API/test typing remain; these were not concealed as a passing typecheck.
3. **Schema approval:** real-database use is blocked until the additive schema is reviewed and applied with authorization. No production validation writes or backfill were performed.
4. **Owner-only policies remain intentionally unsupported:** refunds, cancellation/financial adjustments, reissue, cross-session transfers, attendee-consent decisions, checked-in-attendee/group treatment, session-only earning/link semantics and notice release/delivery.

The live Wine Down record, production database, live attendee notices and deployment were not modified by this work. Test notice rows were created only in the isolated fixture database; no messages were sent.
