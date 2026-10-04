# Launch execution log — 3 October 2026

## 4 October: membership policy calculation implementation

- Owner approved implementing the recommended annual 30-day refund structure and
  described membership value as private dinners, specialised products, keynotes,
  entertainment and year-round discounts. No event price/deduction value invented.
- Implemented a quote-only engine for explicitly accepted new annual USD terms.
  Actual paid principal is prorated; included access and separately purchased
  tickets are not double-deducted. Only disclosed redeemed extra values count.
  Billing/service exceptions, renewals, legacy terms, unknown payment/redemption
  evidence and existing refund operations require review.
- 27 focused tests pass. No live imports, migration, access changes, automatic
  refund, invitations, payments or production settings. Customer/admin request
  screens and persistent source records remain unimplemented, explicitly gated.
- Existing Membership lacks verified payment/policy/redemption/request records;
  manual Patron enrollment does not prove a payment was captured. The exact new
  schema and production migration require separate review before route integration.
- Ten-item tracker: #2 advanced; #1 and #3–#10 not closed by this work.

## Batch A: release baseline (partial)

- Fetched GitHub main: ce36935b7adc30f0d2acf8cea4baa7ae66950a60.
  This matches the user's last Replit pull. No source diff from the preceding
  type-safety branch; work starts on a new branch from main.
- Read live /admin/launch-readiness. Displayed check: 10/3/2026 9:11:01 AM.
  NO_GO, two blocking failures: demo mode enabled and 22 @oku.local accounts.
  CyberSource active/readiness checks, database reachability, schema-sync check,
  configuration presence and transactional-email configuration report passing.
  These dashboard checks do not certify settlement, schema parity independently,
  email delivery or authorization. No test-alert button used.
- Banesco readiness still awaits its official specification.
- Production revision and a usable rollback deployment are not yet verified.
  No production deployment authorized by this report. Demo remediation remains
  owner-gated; no accounts, permissions or deployment settings changed.

## Batch B1: ticket refund input boundary

- Reject blank order IDs, unsafe integer amounts and unexpected fields before
  querying orders or selecting a gateway. Retain the existing valid request
  contract and refund permission check. No rate or refund-policy changes.
- Added 14 isolated route tests: malformed/ambiguous inputs, valid contract,
  trimmed ID and denied permission. Prisma/provider/auth are mocked.
- Targeted ticket + reservation boundary tests: 26 passed in 2 files.
- Release regression selection: 253 passed in 38 files. git diff --check passed.
- No real payment, refund, payout, invitation, database mutation or migration.
- This narrow fix does NOT solve cumulative refunds, concurrent requests,
  asynchronous gateway settlement or bundle restoration.

## Confirmed larger payment gaps / next design gate

Ticket refund route checks each request against original total and calls the
gateway before durable local transaction recording. Reservation refund likewise
uses original intent amount, records the attempt after the gateway call and
treats accepted/pending provider results as refunded. A timeout must not simply
be treated as safe to retry. Full ticket refund capacity release uses only
order.sessionId, not each bundle entitlement.

Required design before implementation:

1. Persist a uniquely keyed refund operation BEFORE gateway submission and
   atomically reserve its amount against the remaining refundable balance.
2. Distinguish requested, submitted/pending, unknown, definitively failed and
   settled. Unknown/pending operations continue reserving balance.
3. Bind key to payment, amount/currency and request fingerprint. Same key with
   different input conflicts; same operation cannot submit twice.
4. Reconcile using authoritative provider child-transaction identifiers and
   amounts. Do not retry unknown operations blindly or infer settlement from
   HTTP acceptance.
5. Apply ledger/entitlement/capacity effects idempotently per affected session
   after authoritative outcome, with durable retry of local postprocessing.
6. Verify whether existing tables/indexes support this model. Any needed schema
   migration is isolated, reviewed and NOT applied to production under present
   authorization. Refund eligibility and fee/tax allocation remain owner decisions.

Other nine-area acceptance work remains open per LAUNCH_EXECUTION_PLAN_2026_10_03.md.
Neither baseline reconciliation nor the entire cart flow is marked complete.

## Batch C1: contact ownership and reservation continuity

Base main 07bbb124. Ticket checkout previously displayed the entered email on
success even when the server assigned the order to a different signed-in account.
Now signed-in name/email prefill is provided, account email is read-only in the
form, and the server rejects mismatches against the current account email before
order/hold mutations. Confirmation uses the server-returned email. No profile is
overwritten, marketing opt-in remains false by default, and guest checkout remains.
Contact fields gain browser autofill hints and 16px text. CATCH/other supported
concept links now preselect a preference without skipping availability or review;
the selected option has an accessible pressed state.

Evidence:
- 19 new isolated tests cover account mismatch/missing account/normalized match,
  absence of order-side effects on rejection, and allowed/invalid concept hints.
- Regression selection: 272 passed across 40 files. git diff --check passes.
- Actual checkout component in isolated fixture at 390px: signed-in account
  prefilled, no document overflow, simulated bank return auto-completed; duplicate
  callback produced exactly two total confirm calls (challenge plus continuation).
  Success displayed buyer@example.invalid. No real gateway/database/email used.
- Actual reservation wizard fixture at 390px: CATCH pressed on entry; Continue
  advanced to Details without selecting again; document width 390px.
- Full tsc still fails on existing repository debt (406 output lines with shared
  client/dependencies). No diagnostics matched changed source/test files. This is
  not a clean full type-check or production certification.

New audit lead: unauthenticated checkout resolves an existing user by supplied
email before catalog eligibility checks; catalog policy queries that user's
membership/newsletter/invitations. Verify unproven email cannot confer restricted
pricing/access. Do not mistake this batch's signed-in mismatch guard for resolving
that separate guest-eligibility issue. Any production access-policy change remains
review-gated. No live exploit attempted.

## Onboarding delivery safety pass

On isolated branch from 2bd7322e, failed/uncertain passwordless email delivery now
revokes that exact token hash (only if unused/unrevoked), then propagates failure.
A concurrently issued token is not revoked by this cleanup. If cleanup itself
fails the operation still throws; durable email delivery/outbox remains separate.
No real email, token, account, role, database or financial changes were performed.

Authentication tests: 21 passed, including four new delivery/resend/lifetime checks.
24-hour invitation remains incomplete: current REFERRER_INVITE is consumed as a
login bearer credential. A separate non-login onboarding invitation/exchange must
be designed; extending the existing login credential is not approved by this work.
The ten-workstream checklist carries evidence from the independent guest-eligibility
and refund-model branches; those source fixes are not implicitly merged here.

## Sign-in recovery pass

Based on main 26db4227 (user confirmed clean Replit fast-forward). Verification
previously left submitting=true when signOut/signIn rejected; session lookup also
had no recovery path. Extracted tested exchange helper catches failures without
logging credentials or automatically replaying the token, requires a session before
navigation, and limits destination to a local path. Form adds same-tick duplicate
submission guard and one-time fragment read to survive StrictMode effect replay.
EN/ES/PT recovery copy added; translation parity passed.

31 authentication tests passed, including ten new exchange cases. Actual page in
local isolated fixture: fabricated fragment token survives mount, simulated auth
failure shows recovery alert and enabled button. At 320px document width is 320px.
No real auth request, email or database was used. 24-hour invitation remains open:
REFERRER_INVITE presently signs in directly and cannot safely be extended unchanged.
