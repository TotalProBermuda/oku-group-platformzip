import { beforeEach, describe, expect, it, vi } from "vitest";

const { linkFindUnique, linkUpdate, legacyReferrerFindUnique, legacyEventFindUnique } = vi.hoisted(() => ({
  linkFindUnique: vi.fn(),
  linkUpdate: vi.fn(),
  legacyReferrerFindUnique: vi.fn(),
  legacyEventFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    referralLink: { findUnique: linkFindUnique, update: linkUpdate },
    referrer: { findUnique: legacyReferrerFindUnique },
    eventReferrerAssignment: { findUnique: legacyEventFindUnique },
  },
}));

import { resolveActorFromCode } from "@/server/referrals/referralActorService";

const activeLink = {
  id: "link-1",
  isActive: true,
  referralActorId: "actor-1",
  referralActor: {
    id: "actor-1",
    status: "ACTIVE",
    legacyReferrerId: null,
    legacyEventReferrerAssignmentId: null,
    legacyReferrer: null,
    legacyEventReferrerAssignment: null,
    assignments: [],
  },
  referralAssignment: { id: "assignment-1", status: "ACTIVE", isActive: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  legacyReferrerFindUnique.mockResolvedValue(null);
  legacyEventFindUnique.mockResolvedValue(null);
});

describe("referral QR activation and scan accounting", () => {
  it("resolves an active link without incrementing its scan count", async () => {
    linkFindUnique.mockResolvedValue(activeLink);

    const result = await resolveActorFromCode("REF-ACTIVE");

    expect(result?.source).toBe("REFERRAL_LINK");
    expect(result?.linkId).toBe("link-1");
    expect(linkUpdate).not.toHaveBeenCalled();
  });

  it("rejects an inactive link instead of attributing it", async () => {
    linkFindUnique.mockResolvedValue({ ...activeLink, isActive: false });

    await expect(resolveActorFromCode("REF-PAUSED")).resolves.toBeNull();
    expect(legacyReferrerFindUnique).not.toHaveBeenCalled();
    expect(linkUpdate).not.toHaveBeenCalled();
  });

  it("rejects a link whose assignment is paused", async () => {
    linkFindUnique.mockResolvedValue({
      ...activeLink,
      referralAssignment: { ...activeLink.referralAssignment, status: "PAUSED", isActive: false },
    });

    await expect(resolveActorFromCode("REF-PAUSED-ASSIGNMENT")).resolves.toBeNull();
    expect(linkUpdate).not.toHaveBeenCalled();
  });
});
