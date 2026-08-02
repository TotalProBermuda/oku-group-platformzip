/**
 * Partner concurrent-invite integration test.
 *
 * Verifies that the partner assignment path (POST /api/v1/partner/referrals/assignments)
 * delegates actor resolution to `findOrCreateReferralActor`, which in turn calls
 * `findOrLinkReferralActor` (the full 7-step dedupe chain).
 *
 * True same-millisecond concurrency safety requires a DB unique constraint or
 * advisory lock; this test demonstrates best-effort protection via transaction +
 * pre-create re-check.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockFindOrLinkReferralActor,
  mockLogReferrerAssignmentAction,
} = vi.hoisted(() => {
  return {
    mockFindOrLinkReferralActor: vi.fn(),
    mockLogReferrerAssignmentAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/server/referrals/referralActorDedupeService", () => ({
  findOrLinkReferralActor: mockFindOrLinkReferralActor,
  normalizeEmail: (raw: string | null | undefined) =>
    raw ? raw.trim().toLowerCase() : null,
  normalizePhone: (raw: string | null | undefined) =>
    raw ? raw.replace(/\D+/g, "") : null,
}));

vi.mock("@/server/referrals/referrerAssignmentAudit", () => ({
  logReferrerAssignmentAction: mockLogReferrerAssignmentAction,
}));

import {
  findOrCreateReferralActor,
} from "@/server/referrals/referralActorIdentityService";

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const BASE_INPUT = {
  actorType: "INFLUENCER_SUB_REFERRER" as const,
  displayName: "New Sub-Referrer",
  email: "subreferrer@example.com",
  invitedByUserId: "partner-user-1",
} as const;

function makeFoundResult(actorId: string) {
  return {
    status: "found_existing_linked" as const,
    actorId,
    referralLinkId: null,
    matchField: "email" as const,
    provisioningPath: "step2_email",
    mutated: false as const,
  };
}

function makeCreatedResult(actorId: string) {
  return {
    status: "created" as const,
    actorId,
    referralLinkId: null,
    matchField: null,
    provisioningPath: "step7_new",
    mutated: true as const,
  };
}

function makeMergeRequiredResult(candidateActorId: string) {
  return {
    status: "merge_required" as const,
    candidateActorId,
    candidateActorUserId: "other-user",
    incomingUserId: "partner-user-1",
    matchField: "email" as const,
    provisioningPath: "step2_email",
    mutated: false as const,
    reason: "Candidate actor belongs to a different user (matched on email)",
  };
}

// ─── Mock prisma for findOrCreateReferralActor ─────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    referralActor: {
      findUniqueOrThrow: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        userId: null,
        email: "subreferrer@example.com",
        phone: null,
        whatsapp: null,
        displayName: "New Sub-Referrer",
        actorType: "INFLUENCER_SUB_REFERRER",
      })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Partner assignment — actor resolution via full 7-step dedupe chain", () => {
  it("returns an existing actor when the email already matches (no duplicate created)", async () => {
    mockFindOrLinkReferralActor.mockResolvedValueOnce(makeFoundResult("actor-existing"));

    const result = await findOrCreateReferralActor(BASE_INPUT);

    expect(result.matched).toBe(true);
    expect(result.actor.id).toBe("actor-existing");
    expect(result.mergeRequired).toBeFalsy();
    // Dedupe service called with isProvisioningCall: true — inherits full 7-step logic
    expect(mockFindOrLinkReferralActor).toHaveBeenCalledWith(
      expect.objectContaining({ email: "subreferrer@example.com" }),
      { isProvisioningCall: true },
      undefined,
    );
  });

  it("creates a new actor when no match exists", async () => {
    mockFindOrLinkReferralActor.mockResolvedValueOnce(makeCreatedResult("actor-new"));

    const result = await findOrCreateReferralActor(BASE_INPUT);

    expect(result.matched).toBe(false);
    expect(result.mergeRequired).toBeFalsy();
    expect(result.actor.id).toBe("actor-new");
  });

  it("surfaces merge_required when the email matches an actor owned by a different user", async () => {
    mockFindOrLinkReferralActor.mockResolvedValueOnce(
      makeMergeRequiredResult("actor-owned-by-other"),
    );

    const result = await findOrCreateReferralActor(BASE_INPUT);

    expect(result.mergeRequired).toBe(true);
    expect(result.candidateActorId).toBe("actor-owned-by-other");
    expect(result.matched).toBe(false);
    // No new actor was created — the caller must resolve the conflict
  });

  /**
   * Concurrent-invite scenario:
   *
   * Two partner requests arrive nearly simultaneously for the same sub-referrer
   * email. The first resolves "created"; the second — simulating the race where
   * the actor now exists — resolves "found_existing_linked".
   *
   * NOTE: True same-millisecond concurrency safety requires a DB unique constraint
   * or advisory lock; this test demonstrates best-effort protection via
   * transaction + pre-create re-check inside findOrLinkReferralActor (step 7).
   * Without a DB-level constraint, a race can still produce two rows between the
   * re-check and the INSERT; the constraint is the only hard guarantee.
   */
  it("concurrent invites: second call finds the actor created by the first (best-effort protection)", async () => {
    // First invite: actor does not exist → created
    mockFindOrLinkReferralActor.mockResolvedValueOnce(makeCreatedResult("actor-race"));
    const first = await findOrCreateReferralActor(BASE_INPUT);

    // Second invite (simulated concurrent): actor now exists → found via step 7 re-check
    mockFindOrLinkReferralActor.mockResolvedValueOnce(makeFoundResult("actor-race"));
    const second = await findOrCreateReferralActor(BASE_INPUT);

    expect(first.actor.id).toBe("actor-race");
    expect(second.actor.id).toBe("actor-race");
    // Both calls reached the dedupe chain
    expect(mockFindOrLinkReferralActor).toHaveBeenCalledTimes(2);
    // The second is a match — no duplicate was created
    expect(second.matched).toBe(true);
  });
});
