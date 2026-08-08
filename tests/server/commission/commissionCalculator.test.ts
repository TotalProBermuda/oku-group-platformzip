import { describe, it, expect } from "vitest";
import { computeCommission, type FinancialSnapshot } from "@/server/services/invu/commissionCalculator";
import type { CommissionRule } from "@prisma/client";

function makeRule(overrides: Partial<CommissionRule> = {}): CommissionRule {
  return {
    id: "rule_test",
    tier: "STANDARD",
    scopeType: "GLOBAL",
    scopeId: null,
    revenueBasis: "COMMISSIONABLE_CENTS",
    percentageBps: 1000, // 10%
    percentageCapCents: null,
    perPersonCents: null,
    maxTakeRateBps: null,
    version: 1,
    active: true,
    label: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return {
    grossCents: 10000, // $100.00
    taxCents: 1500,    // $15.00
    tipCents: 0,
    discountCents: 0,
    refundCents: 0,
    commissionableCents: 8500, // gross - tax = $85.00
    ...overrides,
  };
}

describe("commissionCalculator — INVU basis semantics", () => {
  it("COMMISSIONABLE_CENTS: discountCents is NOT re-subtracted", () => {
    // gross is already post-discount for INVU. discountCents=500 but
    // commissionableCents already reflects it. Do NOT subtract again.
    const snapshot = makeSnapshot({
      grossCents: 10000,
      taxCents: 1500,
      discountCents: 500, // already baked into grossCents (INVU semantics)
      commissionableCents: 8500, // gross − tax, discount NOT subtracted again
    });
    const rule = makeRule({ percentageBps: 1000 }); // 10%
    const trace = computeCommission({ snapshot, guestCount: null, rule });
    // eligible = commissionableCents = 8500, not 8500 − 500 = 8000
    expect(trace.eligibleNetRevenueCents).toBe(8500);
    expect(trace.finalCommissionCents).toBe(850); // 10% of 8500
  });

  it("COMMISSIONABLE_CENTS: tipCents is NOT re-subtracted", () => {
    // For INVU, tips are not in grossCents — already absent.
    const snapshot = makeSnapshot({
      grossCents: 10000,
      taxCents: 1500,
      tipCents: 200, // tracked separately — NOT in gross for INVU
      commissionableCents: 8500, // gross − tax only
    });
    const rule = makeRule({ percentageBps: 1000 });
    const trace = computeCommission({ snapshot, guestCount: null, rule });
    // eligible = 8500, not 8500 − 200 = 8300
    expect(trace.eligibleNetRevenueCents).toBe(8500);
  });

  it("GROSS_MINUS_TAX_MINUS_DISCOUNT_REFUND_TIP: subtracts all four for non-INVU", () => {
    const snapshot = makeSnapshot({
      grossCents: 10000,
      taxCents: 1000,
      discountCents: 500,
      refundCents: 300,
      tipCents: 200,
      commissionableCents: 9000,
    });
    const rule = makeRule({
      revenueBasis: "GROSS_MINUS_TAX_MINUS_DISCOUNT_REFUND_TIP",
      percentageBps: 1000,
    });
    const trace = computeCommission({ snapshot, guestCount: null, rule });
    // 10000 − 1000 − 500 − 300 − 200 = 8000
    expect(trace.eligibleNetRevenueCents).toBe(8000);
    expect(trace.finalCommissionCents).toBe(800); // 10% of 8000
  });
});

describe("commissionCalculator — formula components", () => {
  it("7 guests, $2000 eligible, 1000 bps pct cap $30 / $5 per person → max($30, $35) = $35", () => {
    const snapshot = makeSnapshot({ commissionableCents: 200000 });
    const rule = makeRule({
      percentageBps: 1000,        // 10% of 2000 = $200, but cap is $30
      percentageCapCents: 3000,   // $30.00 cap
      perPersonCents: 500,        // $5.00 × 7 guests = $35.00
    });
    const trace = computeCommission({ snapshot, guestCount: 7, rule });
    expect(trace.percentageComponentCents).toBe(3000);   // capped at $30
    expect(trace.percentageCapAppliedCents).toBe(3000);
    expect(trace.perPersonComponentCents).toBe(3500);    // 7 × $5
    expect(trace.finalCommissionCents).toBe(3500);       // max($30, $35) = $35
  });

  it("20 guests, $200 eligible, per-person dominates, maxTakeRate binds", () => {
    const snapshot = makeSnapshot({ commissionableCents: 20000 }); // $200
    const rule = makeRule({
      percentageBps: 500,         // 5% of $200 = $10
      perPersonCents: 200,        // $2.00 × 20 = $40
      maxTakeRateBps: 1500,       // 15% of $200 = $30 → cap applies
    });
    const trace = computeCommission({ snapshot, guestCount: 20, rule });
    expect(trace.perPersonComponentCents).toBe(4000);    // 20 × $2
    expect(trace.finalCommissionCents).toBe(3000);       // maxTakeRate cap: 15% of $200 = $30
    expect(trace.maxTakeRateCapCents).toBe(3000);
  });

  it("eligibleNet = $0 → finalCommission = $0, no computation done", () => {
    const snapshot = makeSnapshot({ commissionableCents: 0 });
    const rule = makeRule({ percentageBps: 1000 });
    const trace = computeCommission({ snapshot, guestCount: 5, rule });
    expect(trace.eligibleNetRevenueCents).toBe(0);
    expect(trace.finalCommissionCents).toBe(0);
  });

  it("guestCount null → perPersonComponent = 0, formula still runs", () => {
    const snapshot = makeSnapshot({ commissionableCents: 10000 });
    const rule = makeRule({
      percentageBps: 500,
      perPersonCents: 1000,
    });
    const trace = computeCommission({ snapshot, guestCount: null, rule });
    expect(trace.guestCount).toBe(0);
    expect(trace.perPersonComponentCents).toBe(0);
    expect(trace.percentageComponentCents).toBe(500); // 5% of $100
    expect(trace.finalCommissionCents).toBe(500);
  });

  it("percentageCapCents binds when pct component exceeds it", () => {
    const snapshot = makeSnapshot({ commissionableCents: 100000 }); // $1000
    const rule = makeRule({
      percentageBps: 500,         // 5% of $1000 = $50
      percentageCapCents: 2000,   // $20 cap — must bind
    });
    const trace = computeCommission({ snapshot, guestCount: null, rule });
    expect(trace.percentageCapAppliedCents).toBe(2000);
    expect(trace.percentageComponentCents).toBe(2000);
    expect(trace.finalCommissionCents).toBe(2000);
  });

  it("MANUAL_REVIEW basis → requiresManualReview=true, finalCommission=0", () => {
    const snapshot = makeSnapshot({ commissionableCents: 50000 });
    const rule = makeRule({ revenueBasis: "MANUAL_REVIEW" });
    const trace = computeCommission({ snapshot, guestCount: 3, rule });
    expect(trace.requiresManualReview).toBe(true);
    expect(trace.finalCommissionCents).toBe(0);
  });

  it("GROSS_MINUS_TAX_MINUS_TIP subtracts tip but not discount", () => {
    const snapshot = makeSnapshot({
      grossCents: 10000,
      taxCents: 1000,
      tipCents: 500,
      discountCents: 200,
      commissionableCents: 9000,
    });
    const rule = makeRule({
      revenueBasis: "GROSS_MINUS_TAX_MINUS_TIP",
      percentageBps: 1000,
    });
    const trace = computeCommission({ snapshot, guestCount: null, rule });
    // 10000 − 1000 − 500 = 8500
    expect(trace.eligibleNetRevenueCents).toBe(8500);
  });
});
