# Payment notification guards — 2026-10-01

Base: main `0229e2a9`. Code-only patch; no schema, credentials, financial settings, permissions, customer communications or real transactions changed.

## Fixed

- Unsupported event types no longer create a fabricated PAYMENT_AUTHORIZED ledger entry.
- Ticket-payment lookup is restricted to CYBERSOURCE, including reference-based lookup.
- Delayed capture/authorization notifications cannot revive REFUNDED or VOIDED payments. Delayed declines cannot overwrite SUCCEEDED.
- An authorization pending review no longer marks the ticket payment SUCCEEDED.
- Payment updates compare the stored status to the status read. A concurrent state change returns 503 for redelivery rather than overwriting it or silently losing the event.
- Outbox failures return 503 before payment updates. A duplicate-key outbox result still allows reconciliation to finish after a previous interrupted delivery.

## Verification

180 tests pass across 27 files, including 10 new mocked route-boundary tests. Signature rejection remains covered. No production notification was replayed. No gateway, database or email provider is used by the new tests. `git diff --check` passes.

```sh
npx vitest run tests/server/payments tests/server/cybersource tests/server/commerce tests/server/reservations tests/server/rbac/roleSplitAuthz.test.ts
```

## Deliberately not claimed fixed

This is not complete financial reconciliation. Existing refund event handling still needs partial/full amount reconciliation and original-versus-child transaction correlation. Reservation intent transitions and their unreachable CAPTURED-to-REFUNDED branch are unchanged. Durable cumulative refunds, request idempotency, order fulfilment reconciliation and transaction identity matching remain launch gates. Audit entries may repeat on duplicate deliveries. Existing handling of ordinary authorization/transmitted notifications is retained; it does not independently prove settlement.

Gateway event contracts and subscription/redelivery configuration need read-only verification plus approved staging end-to-end tests before rollout. Unit tests prove the local branch behaviour, not provider delivery or actual settlement. This patch should remain undeployed until that review. The live NO_GO findings in LAUNCH_READINESS_FOLLOWUP_2026_10_01.md remain outstanding.

Rollback: revert the code-only commit. No database rollback required. Replit command after an approved merge:

```sh
GIT_EDITOR=true git pull --no-rebase origin main
```

Do not run database push/reset or approve generated schema changes.
