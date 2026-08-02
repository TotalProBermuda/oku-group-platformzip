---
name: ISCL payout lifecycle
description: InfluencerSubCommissionLedger payoutStatus must not flip to PAID before bank adapter includes those rows in the payable file.
---

# ISCL (InfluencerSubCommissionLedger) payout lifecycle

## The rule
`payoutStatus` on `InfluencerSubCommissionLedger` rows must NOT be set to `PAID` at `exportBatch` time. The `exportPayload` / SHA-256 hash covers only `LedgerEntry` influencer commissions — ISCL rows are tracked on the batch but are not yet in the bank file. Flipping to `PAID` before a transfer instruction exists marks a referrer paid when no money moved.

The canonical lifecycle is:
```
payoutBatchId=null,   PENDING  → eligible, unbatched
payoutBatchId=<id>,   PENDING  → batched / export-pending (NOT paid)
payoutStatus=PAID              → deferred; only valid after bank adapter
                                  includes subCommissionLines in payable file
```

**Why:** ProofPay requires that a PAID status corresponds to an actual payment instruction in the bank file. "Batched" and "exported" are metadata states, not settlement states for ISCL rows.

**How to apply:** When the bank-file adapter (`BANESCO_PANAMA_PENDING_SPEC` or successor) is extended to emit transfer rows for `subCommissionLines`, add the `updateMany PENDING→PAID` flip inside the `exportBatch` transaction at that point — not before.

## What is complete (Step 4 partial)
- `attachSubCommissionsToBatch` — stamps `payoutBatchId` atomically
- `detachSubCommissionsFromBatch` / `releaseSubCommissionsInternal` — clears `payoutBatchId` on reject/discard
- `getBatchDetail` — returns `subCommissionLines`, `subCommissionTotalCents`, `subCommissionLineCount` separately from `batch.totalCents`
- `commissionPendingCents` (referrer feed) — includes ALL `payoutStatus=PENDING` rows regardless of `payoutBatchId`
- `commissionBatched` — true when a PENDING row has `payoutBatchId` set; signals "in batch, awaiting payment" not "paid"

## Relevant files
- `src/server/payouts/payoutBatchService.ts` — `exportBatch`, sub-commission block comment (Step 4 PARTIAL), `getBatchDetail`
- `src/server/referrals/myReferralsSource.ts` — `commissionPendingCents`, `commissionBatched` computation
- `replit.md` — architecture decision "Event-referrer ticketing surface (convergence complete for Steps 1–3; Step 4 partial)"
