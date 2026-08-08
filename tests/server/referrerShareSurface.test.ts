import { describe, it, expect } from "vitest";
import {
  bestUseHintFor,
  commissionSummaryFor,
  cardStatusFor,
} from "@/server/referrals/referrerShareSurfaceService";

describe("share-card decisioning helpers (case 8)", () => {
  it("bestUseHintFor returns a non-empty hint per known OfferType", () => {
    for (const t of ["RESTAURANT", "EVENT", "SERIES", "MEMBERSHIP", "PRIVATE_DINING", "PACKAGE"] as const) {
      const hint = bestUseHintFor(t);
      expect(hint, `OfferType ${t}`).toBeTruthy();
      expect(typeof hint).toBe("string");
    }
    expect(bestUseHintFor(null)).toBeNull();
  });

  it("commissionSummaryFor returns null when not eligible", () => {
    const r = commissionSummaryFor({
      isCommissionEligible: false,
      compensationMode: "PERCENT",
      rateBps: 500,
      flatAmountCents: null,
    });
    expect(r).toBeNull();
  });

  it("commissionSummaryFor formats percent and flat correctly", () => {
    expect(
      commissionSummaryFor({
        isCommissionEligible: true,
        compensationMode: "PERCENT_OF_TRANSACTION",
        rateBps: 500,
        flatAmountCents: null,
      }),
    ).toMatch(/5(\.0+)?%/);
    expect(
      commissionSummaryFor({
        isCommissionEligible: true,
        compensationMode: "FLAT_PER_COVER",
        rateBps: null,
        flatAmountCents: 500,
      }),
    ).toMatch(/\$5/);
  });
});

describe("cardStatusFor — past/upcoming/active/paused (case 7)", () => {
  const now = new Date("2026-05-15T12:00:00Z");
  it("PAUSED status overrides everything", () => {
    expect(
      cardStatusFor({ isActive: true, offerStartAt: null, offerEndAt: null, status: "PAUSED" }, now),
    ).toBe("PAUSED");
  });
  it("RETIRED or !isActive becomes PAST", () => {
    expect(
      cardStatusFor({ isActive: false, offerStartAt: null, offerEndAt: null, status: "RETIRED" }, now),
    ).toBe("PAST");
    expect(
      cardStatusFor({ isActive: false, offerStartAt: null, offerEndAt: null, status: "ACTIVE" }, now),
    ).toBe("PAST");
  });
  it("offerEndAt in the past becomes PAST", () => {
    expect(
      cardStatusFor(
        { isActive: true, offerStartAt: null, offerEndAt: new Date("2026-05-14T00:00:00Z"), status: "ACTIVE" },
        now,
      ),
    ).toBe("PAST");
  });
  it("offerStartAt in the future becomes UPCOMING", () => {
    expect(
      cardStatusFor(
        { isActive: true, offerStartAt: new Date("2026-05-16T00:00:00Z"), offerEndAt: null, status: "ACTIVE" },
        now,
      ),
    ).toBe("UPCOMING");
  });
  it("active window returns ACTIVE", () => {
    expect(
      cardStatusFor(
        {
          isActive: true,
          offerStartAt: new Date("2026-05-15T00:00:00Z"),
          offerEndAt: new Date("2026-05-15T23:59:59Z"),
          status: "ACTIVE",
        },
        now,
      ),
    ).toBe("ACTIVE");
  });
});
