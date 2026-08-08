import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockFindOrLinkReferralActor,
  mockLogReferrerAssignmentAction,
  mockReferralActorFindUniqueOrThrow,
  mockPrisma,
} = vi.hoisted(() => {
  const mockFindOrLinkReferralActor = vi.fn();
  const mockLogReferrerAssignmentAction = vi.fn().mockResolvedValue(undefined);
  const mockReferralActorFindUniqueOrThrow = vi.fn();

  const mockPrisma = {
    referralActor: { findUniqueOrThrow: mockReferralActorFindUniqueOrThrow },
  };

  return {
    mockFindOrLinkReferralActor,
    mockLogReferrerAssignmentAction,
    mockReferralActorFindUniqueOrThrow,
    mockPrisma,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/server/referrals/referralActorDedupeService", () => ({
  findOrLinkReferralActor: mockFindOrLinkReferralActor,
  normalizeEmail: (v: string | null | undefined) => v?.trim().toLowerCase() ?? null,
  normalizePhone: (v: string | null | undefined) => v?.replace(/\D+/g, "") ?? null,
}));
vi.mock("@/server/referrals/referrerAssignmentAudit", () => ({
  logReferrerAssignmentAction: mockLogReferrerAssignmentAction,
}));

import {
  findOrCreateReferralActor,
  ReferralActorBlockedError,
} from "@/server/referrals/referralActorIdentityService";

const baseInput = {
  actorType: "STREETSIDE_HOST" as const,
  displayName: "Test Person",
  email: "test@oku.com",
  invitedByUserId: "admin-1",
};

const fakeActor = {
  id: "actor-1",
  userId: "user-1",
  email: "test@oku.com",
  phone: null,
  whatsapp: null,
  displayName: "Test Person",
  actorType: "STREETSIDE_HOST",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  organizationName: null,
  metadataJson: null,
  legacyReferrerId: null,
};

describe("findOrCreateReferralActor — merge_required handling (P1-B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matched:false and mergeRequired:true when dedupe returns merge_required", async () => {
    const candidateActor = { ...fakeActor, id: "candidate-actor", userId: "other-user" };

    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "merge_required",
      candidateActorId: "candidate-actor",
      candidateActorUserId: "other-user",
      incomingUserId: "incoming-user",
      matchField: "email",
      provisioningPath: "step2_email",
      mutated: false,
      reason: "Candidate actor belongs to a different user (matched on email)",
    });
    mockReferralActorFindUniqueOrThrow.mockResolvedValue(candidateActor);

    const result = await findOrCreateReferralActor({ ...baseInput, userId: "incoming-user" });

    // Must NOT treat the candidate as a successful match
    expect(result.matched).toBe(false);
    expect(result.mergeRequired).toBe(true);
    expect(result.candidateActorId).toBe("candidate-actor");
    expect(result.candidateActorUserId).toBe("other-user");
    // The candidate actor is returned for reference only
    expect(result.actor.id).toBe("candidate-actor");
  });

  it("returns matched:true when dedupe finds an existing actor owned by the same user", async () => {
    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "found_existing_linked",
      actorId: "actor-1",
      referralLinkId: "link-1",
      matchField: "email",
      provisioningPath: "step2_email",
      mutated: false,
    });
    mockReferralActorFindUniqueOrThrow.mockResolvedValue(fakeActor);

    const result = await findOrCreateReferralActor(baseInput);

    expect(result.matched).toBe(true);
    expect(result.mergeRequired).toBeUndefined();
    expect(result.actor.id).toBe("actor-1");
  });

  it("throws ReferralActorBlockedError when dedupe returns blocked", async () => {
    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "blocked",
      reason: "legacy_code_taken",
      matchField: "legacyReferrer",
      provisioningPath: "step4_legacy_code_taken",
      mutated: false,
    });

    await expect(
      findOrCreateReferralActor({ ...baseInput, userId: "user-blocked" }),
    ).rejects.toThrow(ReferralActorBlockedError);

    await expect(
      findOrCreateReferralActor({ ...baseInput, userId: "user-blocked" }),
    ).rejects.toThrow("legacy_code_taken");

    // No actor was fetched since creation was blocked
    expect(mockReferralActorFindUniqueOrThrow).not.toHaveBeenCalled();
  });
});
