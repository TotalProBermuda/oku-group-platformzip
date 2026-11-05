import { describe, expect, it } from "vitest";
import { calculateCheckoutCharges } from "@/server/commerce/financeCalculation";

describe("ticket finance calculation", () => {
  it("preserves the existing dollar checkout without taxing the fee", () => {
    expect(calculateCheckoutCharges(100, { serviceFeeBps: 500, taxBps: 840, taxServiceFee: false }))
      .toEqual({ feesCents: 5, taxCents: 8, totalCents: 113 });
  });
  it("taxes fees only when explicitly configured", () => {
    expect(calculateCheckoutCharges(10000, { serviceFeeBps: 500, taxBps: 700, taxServiceFee: true }))
      .toEqual({ feesCents: 500, taxCents: 735, totalCents: 11235 });
  });
  it("supports zero fees and zero tax", () => {
    expect(calculateCheckoutCharges(12345, { serviceFeeBps: 0, taxBps: 0, taxServiceFee: false }).totalCents).toBe(12345);
  });
  it("rejects fractional cents and invalid rates", () => {
    expect(() => calculateCheckoutCharges(1.5, { serviceFeeBps: 500, taxBps: 840, taxServiceFee: false })).toThrow();
    expect(() => calculateCheckoutCharges(100, { serviceFeeBps: -1, taxBps: 840, taxServiceFee: false })).toThrow();
  });
});
