/**
 * Transaction atomicity tests for eventReferrerService.
 *
 * Verifies that:
 * 1. createEventReferrer — if the assignment create fails inside the transaction,
 *    any actor mutations from findOrLinkReferralActor are rolled back with it
 *    (no orphaned actor without an assignment anchor).
 * 2. provisionHostPersonalReferrer — when ensureHostReferralActor returns
 *    merge_required, the sentinel throw rolls back the assignment create/reactivate
 *    so no active unbridged assignment is left in the DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockFindOrLinkReferralActor,
  mockAuditLogCreate,
  mockReferralActorFindUnique,
  mockReferralActorUpdate,
  mockRestaurantHostProfileFindUnique,
  mockEventReferrerAssignmentFindUnique,
  mockTxAssignmentCreate,
  mockTxAssignmentUpdate,
  mockTransaction,
  mockTxClient,
  mockPrisma,
} = vi.hoisted(() => {
  const mockFindOrLinkReferralActor = vi.fn();
  const mockAuditLogCreate = vi.fn().mockResolvedValue({});
  const mockReferralActorFindUnique = vi.fn().mockResolvedValue(null);
  const mockReferralActorUpdate = vi.fn().mockResolvedValue({});
  const mockRestaurantHostProfileFindUnique = vi.fn();
  const mockEventReferrerAssignmentFindUnique = vi.fn();
  const mockTxAssignmentCreate = vi.fn();
  const mockTxAssignmentUpdate = vi.fn();

  const mockTxClient = {
    auditLog: { create: mockAuditLogCreate },
    referralActor: {
      findUnique: mockReferralActorFindUnique,
      update: mockReferralActorUpdate,
    },
    eventReferrerAssignment: {
      create: mockTxAssignmentCreate,
      update: mockTxAssignmentUpdate,
    },
  };

  const mockTransaction = vi.fn(
    async (cb: (tx: typeof mockTxClient) => Promise<unknown>) => cb(mockTxClient),
  );

  const mockPrisma = {
    auditLog: { create: mockAuditLogCreate },
    referralActor: { findUnique: vi.fn().mockResolvedValue(null) },
    restaurantHostProfile: { findUnique: mockRestaurantHostProfileFindUnique },
    eventReferrerAssignment: {
      findUnique: mockEventReferrerAssignmentFindUnique,
    },
    series: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: mockTransaction,
  };

  return {
    mockFindOrLinkReferralActor,
    mockAuditLogCreate,
    mockReferralActorFindUnique,
    mockReferralActorUpdate,
    mockRestaurantHostProfileFindUnique,
    mockEventReferrerAssignmentFindUnique,
    mockTxAssignmentCreate,
    mockTxAssignmentUpdate,
    mockTransaction,
    mockTxClient,
    mockPrisma,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/server/referrals/referralActorDedupeService", () => ({
  findOrLinkReferralActor: mockFindOrLinkReferralActor,
}));
vi.mock("nanoid", () => ({ nanoid: () => "ATOMTEST1" }));

import {
  createEventReferrer,
  provisionHostPersonalReferrer,
} from "@/server/events/eventReferrerService";

beforeEach(() => {
  vi.clearAllMocks();
  mockReferralActorFindUnique.mockResolvedValue(null);
  mockReferralActorUpdate.mockResolvedValue({});
  mockAuditLogCreate.mockResolvedValue({});
});

// ─── createEventReferrer: assignment failure rolls back actor mutation ─────────

describe("createEventReferrer — transaction atomicity", () => {
  it(
    "propagates assignment create failure without bridging the actor",
    async () => {
      // Actor provisioned successfully by the dedupe service inside the tx.
      mockFindOrLinkReferralActor.mockResolvedValue({
        status: "created",
        actorId: "actor-new",
        matchField: null,
        mutated: true,
        provisioningPath: "test",
        referralLinkId: null,
      });

      // Assignment creation fails after actor was already created.
      const assignError = new Error("db write failure");
      mockTxAssignmentCreate.mockRejectedValue(assignError);

      // The function must propagate the error — the tx aborts, rolling back
      // the actor creation with it.
      await expect(
        createEventReferrer({
          parentInfluencerId: "inf-1",
          createdByInfluencerId: "inf-1",
          scopeType: "SERIES",
          displayName: "Sub Ref",
          assignedUserId: "user-sub",
        }),
      ).rejects.toThrow("db write failure");

      // Bridge step (referralActor.update) must never be reached — the tx
      // aborted before that point.
      expect(mockReferralActorUpdate).not.toHaveBeenCalled();
    },
  );

  it(
    "returns merge_required without creating any assignment when dedupe detects a conflict",
    async () => {
      mockFindOrLinkReferralActor.mockResolvedValue({
        status: "merge_required",
        candidateActorId: "existing-actor",
        candidateActorUserId: "other-user",
        matchField: "email",
        provisioningPath: "test",
        mutated: false,
        reason: "email conflict",
      });

      const result = await createEventReferrer({
        parentInfluencerId: "inf-1",
        createdByInfluencerId: "inf-1",
        scopeType: "SERIES",
        displayName: "Sub Ref",
        inviteEmail: "conflict@example.com",
      });

      expect(result.ok).toBe(false);
      if (!result.ok && "mergeRequired" in result) {
        expect(result.candidateActorId).toBe("existing-actor");
        expect(result.candidateActorUserId).toBe("other-user");
        expect(result.matchField).toBe("email");
      }
      // No assignment create was attempted — merge_required exits before
      // the assignment.create call.
      expect(mockTxAssignmentCreate).not.toHaveBeenCalled();
      expect(mockReferralActorUpdate).not.toHaveBeenCalled();
    },
  );

  it(
    "returns blocked without creating any assignment when dedupe is blocked",
    async () => {
      mockFindOrLinkReferralActor.mockResolvedValue({
        status: "blocked",
        reason: "legacy code taken",
        matchField: "referralCode",
        provisioningPath: "test",
        mutated: false,
      });

      const result = await createEventReferrer({
        parentInfluencerId: "inf-1",
        createdByInfluencerId: "inf-1",
        scopeType: "SERIES",
        displayName: "Sub Ref",
        inviteEmail: "blocked@example.com",
      });

      expect(result.ok).toBe(false);
      if (!result.ok && "blocked" in result) {
        expect(result.reason).toBe("legacy code taken");
      }
      expect(mockTxAssignmentCreate).not.toHaveBeenCalled();
    },
  );
});

// ─── provisionHostPersonalReferrer: merge_required leaves no active assignment ─

describe("provisionHostPersonalReferrer — merge_required atomicity", () => {
  const host = {
    id: "host-1",
    userId: "user-1",
    displayName: "Host One",
    venueId: "venue-1",
  };

  beforeEach(() => {
    mockRestaurantHostProfileFindUnique.mockResolvedValue(host);
    // No existing assignment — forces the create path.
    mockEventReferrerAssignmentFindUnique.mockResolvedValue(null);
    // Fast path in ensureHostReferralActor: not already bridged to this assignment.
    mockReferralActorFindUnique.mockResolvedValue(null);
    // tx.eventReferrerAssignment.create returns a mock row before actor check.
    mockTxAssignmentCreate.mockResolvedValue({
      id: "assign-new",
      referralCode: "HOST-ATOMTEST1",
      status: "ACTIVE",
    });
  });

  it(
    "returns { ok: false, mergeRequired: true } and does not leave an active unbridged assignment",
    async () => {
      // The dedupe service inside ensureHostReferralActor reports a conflict.
      // This causes the sentinel throw inside the tx, rolling back the assignment create.
      mockFindOrLinkReferralActor.mockResolvedValue({
        status: "merge_required",
        candidateActorId: "conflict-actor",
        candidateActorUserId: "other-user",
        matchField: "userId",
        provisioningPath: "test",
        mutated: false,
        reason: "userId conflict",
      });

      const result = await provisionHostPersonalReferrer("host-1");

      // Function must return the typed conflict — not { ok: true }.
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.mergeRequired).toBe(true);
        expect(result.candidateActorId).toBe("conflict-actor");
      }

      // The assignment create was called inside the tx (we attempted it),
      // but the sentinel throw aborted the tx — simulating a rollback.
      expect(mockTxAssignmentCreate).toHaveBeenCalledOnce();

      // No actor bridge update should have been applied — the sentinel throw
      // occurred before the bridge step, so the assignment was never anchored.
      expect(mockReferralActorUpdate).not.toHaveBeenCalled();

      // The canonical referral.actor.merge_required audit must have been
      // re-written NON-transactionally after the rollback so the conflict
      // remains discoverable for admins and the merge-resolution workflow.
      // (The version the dedupe service wrote inside the tx was lost.)
      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "referral.actor.merge_required",
            actorId: "conflict-actor",
          }),
        }),
      );
    },
  );
});
