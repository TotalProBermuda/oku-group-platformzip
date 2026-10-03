# Refund coordinator implementation gate

Status: rule-level model tested; no live integration, migration or financial action.

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
