import { describe, expect, it } from "vitest";
import {
  allocatePartnerPool,
  isCandidateInScope,
  validateAttributionCandidate,
  validatePartnerCommerceScope,
  validatePartnerSplitPolicy,
  type PartnerSplitPolicy,
} from "@/server/partnerCommerce/policy";

const policy: PartnerSplitPolicy = {
  sellerShareBps: 4_000,
  partnerRetainedBps: 6_000,
  effectiveFrom: new Date("2026-09-16T00:00:00.000Z"),
  approvedProgrammeId: "programme-casco-view",
};

describe("Partner Commerce policy", () => {
  it("keeps the seller and partner inside exactly one approved pool", () => {
    expect(allocatePartnerPool(2_000, policy)).toEqual({ sellerCents: 800, partnerCents: 1_200 });
    // $4.90 at 40% is $1.96, not a rounded whole-dollar amount.
    expect(allocatePartnerPool(490, policy)).toEqual({ sellerCents: 196, partnerCents: 294 });
  });

  it("rejects a split that could pay more than the approved pool", () => {
    expect(validatePartnerSplitPolicy({ ...policy, partnerRetainedBps: 6_001 })).toMatch(/exactly 100%/i);
  });

  it("does not allow partner-direct attribution to stack with a seller", () => {
    expect(validateAttributionCandidate({
      channel: "PARTNER_DIRECT",
      partnerId: "casco-view",
      sellerSeatId: "seller-lourdes",
    })).toMatch(/cannot also credit a seller/i);
  });

  it("requires a real seller seat for a seller channel", () => {
    expect(validateAttributionCandidate({ channel: "SELLER", partnerId: "casco-view" }))
      .toMatch(/requires an active seller seat/i);
  });

  it("blocks a seller from selling beyond their selected sessions", () => {
    const scope = { kind: "SESSION" as const, sessionIds: ["catch-session-1"] };
    expect(validatePartnerCommerceScope(scope)).toBeNull();
    expect(isCandidateInScope(scope, { sessionId: "catch-session-1" })).toBe(true);
    expect(isCandidateInScope(scope, { sessionId: "another-session" })).toBe(false);
  });

  it("permits a direct partner channel without silently broadening seller scopes", () => {
    expect(isCandidateInScope({ kind: "PARTNER_DIRECT" }, { venueKey: "CATCH" })).toBe(true);
    expect(validatePartnerCommerceScope({ kind: "VENUE", venueKeys: [] })).toMatch(/at least one/i);
  });
});
