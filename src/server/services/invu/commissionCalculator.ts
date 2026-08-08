/**
 * Commission Formula Engine — pure function, no DB access.
 *
 * Formula:
 *   percentageComponent = min(eligible × percentageBps / 10000, percentageCapCents ?? ∞)
 *   perPersonComponent  = (guestCount ?? 0) × (perPersonCents ?? 0)
 *   grossCommission     = max(percentageComponent, perPersonComponent)
 *   maxTakeRateCap      = eligible × (maxTakeRateBps ?? ∞) / 10000
 *   finalCommission     = min(grossCommission, maxTakeRateCap)
 *
 * All amounts are in integer cents. Fractional results are floored (Math.floor).
 *
 * Revenue basis resolution (for INVU correctness):
 *   COMMISSIONABLE_CENTS / GROSS_MINUS_TAX → snapshot.grossCents − snapshot.taxCents
 *   (equivalent to TableSession.commissionableCents; discounts and tips must NOT
 *    be re-subtracted for INVU — they are already absent from grossCents)
 *   GROSS_MINUS_TAX_MINUS_TIP → gross − tax − tip
 *   GROSS_MINUS_TAX_MINUS_DISCOUNT_REFUND_TIP → gross − tax − discount − refund − tip
 *   MANUAL_REVIEW → returns 0; caller must set status = HELD_FOR_REVIEW
 */

import type { CommissionRule } from "@prisma/client";

export type FinancialSnapshot = {
  grossCents: number;
  taxCents: number;
  tipCents: number;
  discountCents: number;
  refundCents: number;
  /** Pre-computed by aggregation service; used for COMMISSIONABLE_CENTS basis. */
  commissionableCents: number;
};

export type CalculationTrace = {
  revenueBasis: CommissionRule["revenueBasis"];
  eligibleNetRevenueCents: number;
  guestCount: number;
  percentageComponentCents: number;
  percentageCapAppliedCents: number | null;   // set when cap actually binds
  perPersonComponentCents: number;
  maxTakeRateCapCents: number | null;          // set when cap actually binds
  finalCommissionCents: number;
  /** True if basis was MANUAL_REVIEW (caller should set HELD_FOR_REVIEW). */
  requiresManualReview: boolean;
};

export function computeCommission(params: {
  snapshot: FinancialSnapshot;
  guestCount: number | null;
  rule: CommissionRule;
}): CalculationTrace {
  const { snapshot, rule } = params;
  const guestCount = params.guestCount ?? 0;

  // ── Eligible net via revenue basis ────────────────────────────────────────
  let eligibleNetRevenueCents = 0;
  let requiresManualReview = false;

  switch (rule.revenueBasis) {
    case "COMMISSIONABLE_CENTS":
    case "GROSS_MINUS_TAX":
      // INVU: gross is already post-discount; tips are not in gross.
      // Do NOT subtract discountCents or tipCents again.
      eligibleNetRevenueCents = Math.max(0, snapshot.commissionableCents);
      break;

    case "GROSS_MINUS_TAX_MINUS_TIP":
      eligibleNetRevenueCents = Math.max(
        0,
        snapshot.grossCents - snapshot.taxCents - snapshot.tipCents
      );
      break;

    case "GROSS_MINUS_TAX_MINUS_DISCOUNT_REFUND_TIP":
      eligibleNetRevenueCents = Math.max(
        0,
        snapshot.grossCents -
          snapshot.taxCents -
          snapshot.discountCents -
          snapshot.refundCents -
          snapshot.tipCents
      );
      break;

    case "MANUAL_REVIEW":
      requiresManualReview = true;
      eligibleNetRevenueCents = 0;
      break;

    default:
      // Exhaustiveness guard — new basis values default to commissionable.
      eligibleNetRevenueCents = Math.max(0, snapshot.commissionableCents);
  }

  // ── Zero-amount guard ─────────────────────────────────────────────────────
  if (requiresManualReview || eligibleNetRevenueCents <= 0) {
    return {
      revenueBasis: rule.revenueBasis,
      eligibleNetRevenueCents,
      guestCount,
      percentageComponentCents: 0,
      percentageCapAppliedCents: null,
      perPersonComponentCents: 0,
      maxTakeRateCapCents: null,
      finalCommissionCents: 0,
      requiresManualReview,
    };
  }

  // ── Percentage component ──────────────────────────────────────────────────
  const rawPct = Math.floor((eligibleNetRevenueCents * rule.percentageBps) / 10000);
  let percentageComponentCents = rawPct;
  let percentageCapAppliedCents: number | null = null;

  if (rule.percentageCapCents != null && rawPct > rule.percentageCapCents) {
    percentageCapAppliedCents = rule.percentageCapCents;
    percentageComponentCents = rule.percentageCapCents;
  }

  // ── Per-person component ──────────────────────────────────────────────────
  const perPersonComponentCents =
    guestCount > 0 && rule.perPersonCents != null
      ? guestCount * rule.perPersonCents
      : 0;

  // ── Gross commission = max of the two components ──────────────────────────
  const grossCommission = Math.max(percentageComponentCents, perPersonComponentCents);

  // ── Max take-rate cap ─────────────────────────────────────────────────────
  let finalCommissionCents = grossCommission;
  let maxTakeRateCapCents: number | null = null;

  if (rule.maxTakeRateBps != null) {
    const cap = Math.floor((eligibleNetRevenueCents * rule.maxTakeRateBps) / 10000);
    if (grossCommission > cap) {
      maxTakeRateCapCents = cap;
      finalCommissionCents = cap;
    }
  }

  return {
    revenueBasis: rule.revenueBasis,
    eligibleNetRevenueCents,
    guestCount,
    percentageComponentCents,
    percentageCapAppliedCents,
    perPersonComponentCents,
    maxTakeRateCapCents,
    finalCommissionCents,
    requiresManualReview: false,
  };
}
