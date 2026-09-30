import { describe, it, expect } from "vitest";
import { calculateCheckoutCharges } from "@/server/commerce/financeCalculation";
describe("flat and percentage merchant fees", () => {
  const rule = { serviceFeeBps: 500, serviceFeeFlatCents: 100, taxBps: 700, taxServiceFee: false };
  it("combines a per-order fee and percentage", () => {
    expect(calculateCheckoutCharges(10000, rule)).toEqual({ feesCents: 600, taxCents: 700, totalCents: 11300 });
  });
  it("supports flat only", () => {
    expect(calculateCheckoutCharges(10000, { ...rule, serviceFeeBps: 0 }).feesCents).toBe(100);
  });
  it("taxes the fee only when configured", () => {
    expect(calculateCheckoutCharges(10000, { ...rule, taxServiceFee: true }).taxCents).toBe(742);
  });
  it("does not turn free tickets into paid orders", () => {
    expect(calculateCheckoutCharges(0, rule).totalCents).toBe(0);
  });
  it("rejects invalid flat amounts", () => {
    for (const value of [-1, 1.5, NaN, Infinity, 1000001]) expect(() => calculateCheckoutCharges(100, { ...rule, serviceFeeFlatCents: value })).toThrow();
  });
});
