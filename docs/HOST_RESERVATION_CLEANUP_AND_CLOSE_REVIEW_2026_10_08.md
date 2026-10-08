# Host reservation cleanup and close controls — 2026-10-08

## Red-team findings

- The Floor Control board and Host Dashboard already supported reservation status transitions, but neither offered a cross-date, searchable review surface for old demo/test bookings.
- A reservation row is not disposable test data by appearance alone. It can be linked to status history, capacity holds, referral attribution, guest communications, payment intents, INVU bindings, revenue, and ledger events.
- Before this change, the status API could accept a cancellation/no-show transition from a seated booking. The normal UI mostly hid those actions, but the server did not enforce the service boundary.
- A seated guest who left without buying needed a recorded outcome. A generic completion did not say whether the party spent $0 or whether the POS close was simply still pending.
- An INVU bind racing an explicit no-sale close could have left a completed zero-sale reservation with a newly attached POS order unless both operations used the same reservation lock.

## Changes

- Added a reservation search/review panel to `/host/operations` and `/host/dashboard`. Search accepts guest name, email, phone, booking code, notes, or source context and returns the latest 50 matches in the caller's venue (SUPERADMIN can search across venues).
- Each candidate must be reviewed individually, explicitly checked as test/demo, and given an audit reason before the host can cancel it out of the active queue.
- This is an audited soft archive, not a physical purge. It preserves the reservation and history, releases active capacity holds, marks open handoffs cancelled, and emits a ledger event.
- The server rejects cleanup for seated, completed, cancelled, no-show, payment-intent, revenue-bearing, or INVU-bound reservations. It repeats the decision under the reservation advisory lock, so a stale screen cannot bypass the current state.
- The status service now prevents a seated reservation from being cancelled or marked no-show. Its normal status action is close; an accidental completed-to-seated recovery remains only when no POS binding or revenue exists.
- Both host views offer an explicit “Close — no purchase” action. It requires an audit reason, records $0 revenue, leaves commission eligibility false, releases capacity, and completes the reservation only if no payment or POS evidence exists. The check is revalidated under the same reservation lock used by INVU binding.
- If an INVU check is bound, or the reservation has payment evidence, the no-purchase path is blocked; hosts must resolve it through the normal payment/POS close/reconciliation workflow.

## Data and release safety

- No live or production reservations were queried, cancelled, deleted, or modified during implementation.
- The three user-identified genuine reservations (Shanna Sertima, Treville B., Shamina Green) were not touched and are not special-cased; no record is auto-classified or auto-archived.
- No Prisma schema or migration change is included. No permission grants, commission rules, taxes, or financial settings were changed.
- Physical deletion/purge remains intentionally unavailable because it would remove audit and relational evidence and was outside the granted “do not delete data” authority. Already-cancelled demo rows remain retained but are out of the active queue.

## Verification

- Host/reservation/commerce/RBAC tests: 36 test files, 193 passing.
- Archive/no-sale policy and review-route tests cover seated/POS/payment protections, venue scoping, minimum search/reason checks, and explicit audit confirmation.
- Production build was run with a local-only NEXTAUTH_SECRET. The build output showed unrelated autoprefixer warnings and missing local DATABASE_URL during optional static data reads; generated app routes successfully. Do not treat that as a production database health test.
- Full repository TypeScript check is known to report pre-existing errors across unrelated seeds, routes, test helpers and translations; changed-file diagnostics produced no errors.

## Operator steps after release

1. In either host view, search a specific clue such as `test`, `demo`, an exact guest name, email, or booking code.
2. Verify the venue, guest, date/time, party size, status, contact, and notes. Do not archive a booking based on a test-like name alone.
3. For a confirmed unseated test booking, explain the test fixture and check the confirmation. The action is recorded as cancellation with preserved audit history.
4. For a seated booking, close it normally; choose “Close — no purchase” only if there is genuinely no sale and no payment/POS binding. Otherwise sync/reconcile the bound INVU check.
