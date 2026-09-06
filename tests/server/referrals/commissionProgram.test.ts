import { describe, expect, it } from "vitest";
import { defaultCommissionProgram } from "@/server/referrals/commissionProgram";

describe("defaultCommissionProgram", () => {
  it("keeps streetside hosts attribution-only", () => {
    expect(defaultCommissionProgram("STREETSIDE_HOST")).toEqual({ eligible: false, tier: null });
  });

  it("maps open-network drivers to Standard", () => {
    expect(defaultCommissionProgram("TAXI_DRIVER")).toEqual({ eligible: true, tier: "STANDARD" });
    expect(defaultCommissionProgram("UBER_DRIVER")).toEqual({ eligible: true, tier: "STANDARD" });
  });

  it("maps qualified referrers to the approved tiers", () => {
    expect(defaultCommissionProgram("TOUR_GUIDE")).toEqual({ eligible: true, tier: "TRUSTED" });
    expect(defaultCommissionProgram("HOTEL_CONCIERGE")).toEqual({ eligible: true, tier: "PREMIUM" });
  });

  it("requires explicit opt-in for unclassified actors", () => {
    expect(defaultCommissionProgram("OTHER")).toEqual({ eligible: false, tier: null });
    expect(defaultCommissionProgram("PRIVATE_NETWORK")).toEqual({ eligible: false, tier: null });
  });
});
