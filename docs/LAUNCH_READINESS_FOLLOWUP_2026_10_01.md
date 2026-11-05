# Launch-readiness follow-up — 1 October 2026

Base: main `b54af0a1`. This is a targeted follow-up, not launch certification.

## Implemented and tested

- Reservation refund boundary rejects malformed JSON, misspelled fields, strings, nulls and non-positive/fractional amounts. Previously invalid JSON or a string amount silently requested a full refund. An explicit `{}` still requests the existing full-refund behaviour.
- Refund service rejects unsafe integer amounts and amounts exceeding the original payment before any gateway call. **This is not cumulative refund accounting or concurrency protection.**
- Admin navigation wraps on narrow screens, offers 44px mobile controls and viewport-contained dropdowns. Moving keyboard focus into a dropdown no longer starts the close timer. Escape closes and returns focus to the trigger. Role filtering is unchanged.

## Evidence

- 170 tests passed / 26 files: `vitest run tests/server/payments tests/server/cybersource tests/server/commerce tests/server/reservations tests/server/rbac/roleSplitAuthz.test.ts`.
- New refund tests use mocked authorization, Prisma and gateway functions. No refund, charge, invitation, email, or payout was executed.
- Live Superadmin dashboard at 390px: document width 743px; overflow was the six admin-navigation groups.
- Isolated Vite fixture renders the actual patched AdminNav and CSS, not a mock menu. At 390px and 320px: document width equals viewport width. Superadmin Departments dropdown fits within screen; keyboard Tab reaches its first link. F&B Director exposes only its existing Core/Restaurant Ops groups at 320px; Escape returns focus to the collapsed trigger. Device emulation is not physical-device certification.
- Existing Replit merge was concluded as `d00a1835` after 43 focused tests; no uncommitted files remained. Existing shared dashboard helper retained alongside incoming account/phone links.
- Full application build/typecheck and all role workflows are not certified by these targeted tests. Previous full typecheck had 468 diagnostics with reused dependencies; a clean-build gate remains.

## Live blockers observed (read-only UI)

`/admin/launch-readiness`, checked 2026-10-01 07:47 UTC, reported **NO_GO**, four blocking gates:

1. Demo mode enabled.
2. 22 demo accounts present.
3. Active gateway check older than 24 hours.
4. Panama gateway readiness repeats that same stale-check condition.

Database reachability, schema check, required configuration presence and transactional-email configuration reported passing. These are dashboard observations, not an independent schema audit, delivery guarantee or settlement verification. Banesco payout readiness still awaits the official bank specification. No test-alert button was used.

## Code-review blockers (not repaired by this patch)

- Ticket refund endpoint compares each request to original order total, not cumulative refunds, and calls the gateway before the database transaction. Concurrent requests/lost gateway responses need durable idempotency and reconciliation. Multi-session capacity release currently uses only `order.sessionId`.
- Reservation refund service likewise lacks cumulative refund accounting and writes `PAYMENT_REFUNDED` ledger events even on failed gateway results (`ok:false`). Ledger handling must be reviewed before changing event semantics.
- CyberSource webhook ticket-payment updates can overwrite newer state with late notifications; unknown event types fall back to a PAYMENT_AUTHORIZED ledger event. Its reservation refund branch checks CAPTURED inside a block that excludes CAPTURED, making that transition unreachable. Partial versus full refund notifications need authoritative amount/transaction mapping, not a blanket status change.
- Partner invitations still use shared passwordless login tokens. A 24-hour onboarding invitation must be distinct from short-lived authentication; do not lengthen login tokens to simulate onboarding.
- Per-role personal-route access, all dashboard mobile workflows, event bundle/refund semantics, actual iOS/Android shortcut installation and all email clients remain unverified.

## Decisions / release gates

Do not delete demo accounts, change access settings, issue live payments/refunds, or change database structure under this patch. Those remain for owner review. Do not bypass the live NO_GO gates or interpret passing unit tests as a launch approval.

No schema, permission, commission, tax or gateway-setting changes are included. Before any deploy: inspect the complete Replit release diff and ensure no generated migration is proposed. Rollback this code-only patch by reverting its commit and republishing the prior compatible release; never use `db push --accept-data-loss`.

After merge, Replit shell:

```sh
GIT_EDITOR=true git pull --no-rebase origin main
git status --short
```

If a conflict appears, stop and reconcile it rather than discarding Replit-only work. Publication and live verification must be recorded separately from merge.
