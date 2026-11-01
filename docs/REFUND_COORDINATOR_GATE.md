# Refund coordinator implementation gate

Status: rule model plus review-gated SQL coordinator tested in isolated embedded
PostgreSQL; no live integration, migration or financial action.

Existing Payment stores one reference; PaymentAttempt has no refund operation kind
or unique operation key. Neither can reliably reserve a cumulative refund amount
before gateway submission while preserving immutable operation identity.

The pure refundAdmission module is deliberately unused by live routes. It must
only run with the complete history inside a serialized transaction/parent-row
lock. Never call it against a stale snapshot as an alleged concurrency fix.

Next storage design must provide:
1. Unique payment-scoped idempotency key, immutable amount/currency and fingerprint
   including the entitlement/refund allocation; authenticated actor and timestamps.
2. RESERVED/SUBMITTED/UNKNOWN/SETTLED/FAILED states, provider child transaction ID,
   durable submission claim and reconciliation cursor. Timeout is UNKNOWN, not FAILED.
3. Serialize reservations on the payment; commit the operation before networking.
   Never hold a database transaction open while awaiting the gateway.
4. Recover crash before/after submission without blindly resending. Provider
   idempotency/reference lookup capability must be verified before integration.
5. Durable exactly-once postprocessing for ledger, tickets, per-session capacity
   and commission reversal after authoritative settlement. Accepted is not settled.
6. Historical refund reconciliation before enabling the coordinator: incomplete
   old histories must block safely, not assume zero refunded.

Migration remains approval-gated. Refund policy and amount allocation for partial
bundle refunds also require owner sign-off. No production DDL in this batch.

Evidence: 23 model tests, plus 26 existing request-validation tests = 49 passing.
Initial run had two test parameterization failures (array spread into arguments);
corrected fixture shape and reran successfully. No gateway or database invoked.

## Persistence implementation pass

`refundCoordinator.ts` adds account-row serialization, payment-scoped replay keys,
allocation fingerprint binding, committed submission claims, unknown-result balance
retention and terminal reconciliation checks. No production route imports it.
The schema is a TEST FIXTURE, deliberately outside `prisma/migrations`.

Eight isolated PGlite tests exercise cumulative limits, concurrent caller admission,
replay conflicts, disk persistence through engine close/reopen, verified-history
gate, pending versus settled evidence, mismatched/contradictory outcomes and
definitive failure. Together with existing admission and ticket boundary tests:
45 passed in 3 files. PGlite serializes its single connection: this is NOT evidence
that competing connections/workers have passed the required PostgreSQL lock tests.

Reproduction (no DATABASE_URL, no real gateway; install only in temporary runtime):
```
npm install --prefix /private/tmp/oku-refund-test-runtime --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.3.14
REFUND_TEST_PGLITE_MODULE=/private/tmp/oku-refund-test-runtime/node_modules/@electric-sql/pglite/dist/index.js npx vitest run tests/integration/refundCoordinator.test.ts tests/server/payments/refundAdmission.test.ts tests/server/payments/ticketRefundRequestValidation.test.ts
```
Without the explicit module environment variable the integration suite SKIPS;
a skipped suite is not acceptance. The isolated disk fixture contains test IDs only.

Still required before activation:
- Reviewed real schema/Prisma migration, source Payment/PaymentIntent foreign keys,
  immutable account enrollment and reconciled historical refunds. Do not set
  historyVerified for existing captures on assumptions or solely local event logs.
- Multi-connection PostgreSQL tests including serialization failure retry.
- Trusted provider lookup adapter and durable evidence/audit retention. The
  reconcile function accepts internal evidence; never expose it as request JSON.
- Worker recovery for abandoned SUBMITTED claims. Never retry them blindly.
- Exactly-once effects ledger, per-ticket/session restoration and shared ticket
  type/add-on counter allocation. No inventory is changed by this coordinator.
- Explicit approved refund policy/fee-tax allocation and controlled financial test.

Do not merge/activate this as if it fixes the existing refund routes. The old route
continues to need replacement, and no live refund should be used to test this draft.
