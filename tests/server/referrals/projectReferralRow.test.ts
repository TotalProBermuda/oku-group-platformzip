import { describe, it, expect } from "vitest";
import { projectReferralRow } from "@/server/referrals/myReferralsSource";
import type { MyReferralsSessionRow, OwnedEarnerIdentities } from "@/server/referrals/myReferralsSource";

const BASE_IDS: OwnedEarnerIdentities = {
  referralActorIds: [],
  legacyReferrerIds: [],
  hostProfileIds: [],
  hostUserId: "user-host-1",
};

function makeRow(
  overrides: Partial<{
    contactName: string | null;
    contactEmail: string | null;
    guestProfileFullName: string | null;
    guestProfileEmail: string | null;
  }> = {}
): MyReferralsSessionRow {
  const {
    contactName = null,
    contactEmail = null,
    guestProfileFullName = null,
    guestProfileEmail = null,
  } = overrides;

  return {
    id: "attr-1",
    bookingCode: "BOOK001",
    source: "QR_RESERVATION",
    status: "OPEN",
    openedAt: new Date("2026-07-16T21:21:00Z"),
    referralActorId: null,
    legacyReferrerId: null,
    hostUserId: "user-host-1",
    orderId: null,
    reservationId: "res-1",
    referralActor: null,
    legacyReferrer: null,
    order: null,
    reservation: {
      id: "res-1",
      contactName,
      contactEmail,
      partySize: 2,
      status: "CONFIRMED",
      reservationDate: new Date("2026-07-16T21:21:00Z"),
      conceptRequested: null,
      guestProfileId: guestProfileFullName ? "gp-1" : null,
      guestProfile: guestProfileFullName
        ? { fullName: guestProfileFullName, email: guestProfileEmail }
        : null,
      zone: null,
      handoffs: [],
      tableSessions: [],
    },
  } as unknown as MyReferralsSessionRow;
}

describe("projectReferralRow — guest name/email projection", () => {
  it("prefers reservation.contactName over guestProfile.fullName (regression: stale profile bug)", () => {
    const row = makeRow({
      contactName: "Denzil Nelson Jose mama maggie",
      contactEmail: "booking@example.com",
      guestProfileFullName: "Denzil Nelson2",
      guestProfileEmail: "profile@example.com",
    });

    const result = projectReferralRow(row, BASE_IDS);

    expect(result).not.toBeNull();
    expect(result!.guestName).toBe("Denzil Nelson Jose mama maggie");
    expect(result!.guestEmail).toBe("booking@example.com");
  });

  it("falls back to guestProfile.fullName when contactName is null", () => {
    const row = makeRow({
      contactName: null,
      contactEmail: null,
      guestProfileFullName: "Denzil Nelson2",
      guestProfileEmail: "profile@example.com",
    });

    const result = projectReferralRow(row, BASE_IDS);

    expect(result).not.toBeNull();
    expect(result!.guestName).toBe("Denzil Nelson2");
    expect(result!.guestEmail).toBe("profile@example.com");
  });

  it('falls back to "Guest" when both contactName and guestProfile are absent', () => {
    const row = makeRow({ contactName: null, guestProfileFullName: null });

    const result = projectReferralRow(row, BASE_IDS);

    expect(result).not.toBeNull();
    expect(result!.guestName).toBe("Guest");
    expect(result!.guestEmail).toBeNull();
  });

  it("uses contactEmail over guestProfile.email when both are present", () => {
    const row = makeRow({
      contactName: "Alice",
      contactEmail: "alice-booking@example.com",
      guestProfileFullName: "Alice",
      guestProfileEmail: "alice-profile@example.com",
    });

    const result = projectReferralRow(row, BASE_IDS);

    expect(result).not.toBeNull();
    expect(result!.guestEmail).toBe("alice-booking@example.com");
  });
});
