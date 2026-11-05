import { describe, expect, it } from "vitest";
import { calculateTicketUnitPrice } from "@/server/commerce/ticketPricing";

describe("calculateTicketUnitPrice", () => {
  const ticket = { priceCents: 2_000, typeCapacity: 100, soldCount: 90, pricingRules: [] };

  it("keeps quote and intent on an integer-cent base price", () => {
    expect(calculateTicketUnitPrice({ ticket })).toBe(2_000);
  });

  it("applies active dynamic pricing before membership discount", () => {
    expect(calculateTicketUnitPrice({
      ticket: {
        ...ticket,
        pricingRules: [{
          conditionJson: { field: "remainingPct", operator: "lt", value: 20 },
          actionJson: { type: "price_increase_pct", value: 25 },
        }],
      },
      membershipDiscountBps: 1_000,
      applyMembershipDiscount: true,
    })).toBe(2_250);
  });
});
