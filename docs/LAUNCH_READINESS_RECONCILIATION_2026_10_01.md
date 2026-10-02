# Launch-readiness reconciliation — 1 October 2026

## Scope and release verdict

Resume checkout continuity, payment safety, onboarding, dashboard discovery and mobile readiness after the unrelated client Wi-Fi investigation. This is a code/evidence reconciliation, not a certification that every module works in production. Launch remains **not verified**.

No cards charged, refunds/payouts issued, invitations sent, financial settings changed, permissions expanded, production data deleted or database structure changed in this pass. Replit currently redirects to login; deployment inspection is blocked until sign-in.

## Completed versus deployed

| Work | Evidence | Remaining verification |
|---|---|---|
| Checkout continuation after 3DS, uncertain-response handling, ticket/account links, phone-shortcut instructions, ticket email improvements | PR #103 merged; earlier 94 automated tests and isolated browser scenarios documented in LAUNCH_READINESS_2026_10_01.md | Reconcile deployed revision; real-device and lifecycle email coverage |
| Reject malformed reservation refund requests; mobile admin navigation | PR #104 merged; 170 tests previously passed locally and in Replit | Production revision and mobile browser verification |
| Webhook terminal-state/provider guards, race/retry handling | PR #105 confirmed merged at b3d9b94f9af3ef543a2241909f0afd69b329480e | Deployment and broader reconciliation remain unverified |
| Unsafe post-merge database push removed | Previously merged and user-reported republished | Preserve safe hook configuration; never use db push --accept-data-loss |
| Failed reservation refunds no longer emit PAYMENT_REFUNDED | Current patch and three new mock cases | Review/merge/deploy this patch; no live refund performed |

Current focused command:

```sh
./node_modules/.bin/vitest run tests/server/payments tests/server/cybersource tests/server/commerce tests/server/reservations tests/server/rbac/roleSplitAuthz.test.ts
```

Result: **183 tests passed, 27 files**. `git diff --check` passed. These are focused tests, not a clean full-build certification. Earlier full TypeScript checking reported 468 diagnostics with reused dependencies; a clean dependency/build assessment remains required.

## Unfinished execution backlog

| Priority | Area | Outstanding work / acceptance evidence |
|---|---|---|
| P0 | Release reconciliation | Identify deployed SHA and Replit local merge changes; retain rollback SHA; confirm no migration/settings/permission changes before any deployment. Historical PR #54 and #7 require comparison against current main, not blind merging. |
| P0 | Payment/refund correctness | Durable idempotency and cumulative refund limits under concurrency; partial versus full refund state; child-transaction correlation; per-session bundle inventory release; reconciliation after lost synchronous responses. Reservation webhook CAPTURED/refund branch needs review. Accepted refund requests are not proof of settlement. |
| P0 | Launch gates | Last observed live report at 07:47 UTC on 1 October was NO_GO: demo mode enabled, 22 demo accounts, stale CyberSource readiness checks (two reported gates). Recheck now; do not remove accounts or change security/settings without authorization. |
| P1 | Both checkout flows | Mobile guest/account entry, expired quotes, duplicate submits, cancelled/failed/returned 3DS, interrupted network, receipt/ticket access, exact fee breakdown and safe optional post-purchase recommendations. No new live payment without approval. |
| P1 | Events / reservations | Verify scoped single-session, selected-session and series-pass behavior; atomic capacity; sales cutoff and late override; cancellation/postponement; partial refund entitlements. Verify regular/holiday/split-shift/event hours and Panama timezone across input, server validation, email and operations displays. |
| P1 | Onboarding | Separate 24-hour onboarding invite from short-lived login tokens; resend/revocation/replay behavior; owner versus seller versus independent affiliation; no unintended commission reassignment. Invitations require approval to send. |
| P1 | Returning-user navigation | Test dashboard, tickets, orders and beneficiary access for each existing role. Resolve usability without silently broadening permissions. |
| P1 | Mobile coverage | Superadmin, F&B director, events, host, partner, seller, referrer, beneficiary and payout screens: 320/390px overflow, touch targets, keyboard, forms, menus, errors and full task completion. Prior admin-navigation fixture coverage is not whole-product certification. |
| P1 | Beneficiary / payouts | Bank-detail capture already exists at /my/beneficiary with own-session GET/PATCH, encrypted-account model and approval/readiness controls. Validate complete onboarding, masking, access, documents and audit flow. Banesco Panama renderer is explicitly unimplemented pending official bank file specification; generic CSV/NACHA must not be represented as bank approved. |
| P2 | Email / content | Preview all lifecycle emails/locales and mobile layouts; verify delivery separately. Confirm CATCH sign-photo hero, editable descriptions/hours, and admin entry points against live site. |
| P2 | Device shortcuts | Existing /save-to-phone guide is English-only. Verify iOS/Android instructions, return destination and referral preservation. Do not claim offline/PWA support based solely on a shortcut. |
| P2 | Reviews | Post-verified-INVU-close Google/TripAdvisor prompting not located in searched source. Define eligibility, deduplication, consent and retry rules; no customer messages without approval. |
| P1 | Operational readiness | Clean build and dependency/security assessment; background-worker monitoring, delivery/reconciliation alerts, backups and restore rehearsal with isolated data. |

## Review-required decisions

- Official Banesco batch-file specification, bank validation/acceptance and payout approval roles.
- Financial fee/tax rules and refund policy, including fee/tax treatment and multi-event allocations; no rate changes authorized here.
- Production demo-mode/account cleanup, database migrations and permission changes.
- Approved real-payment/refund test amount, account and reconciliation procedure.
- Whether later post-purchase suggestions should prioritize other events, restaurants or a brand message; never interrupt ticket access.

## Safe next sequence

1. Merge the narrow failed-refund ledger guard after focused tests/review.
2. Restore Replit sign-in and identify deployment revision and rollback; assess drift before publishing.
3. Re-run live read-only readiness and isolated browser checkout/mobile checks.
4. Implement remaining no-migration safety/UI fixes in small independently tested PRs.
5. Leave money movement, migrations, permission changes and bank acceptance explicitly blocked for owner review.

Replit pull, only after the corresponding PR is merged and with a clean/no-unfinished-merge checkout:

```sh
git status
GIT_EDITOR=true git pull --no-rebase origin main
```

Stop on conflicts; do not reset away Replit changes or run a data-loss database push. Pulling is not deployment verification.
