/**
 * Event bridge exactness tests — step 5 of findOrLinkReferralActor.
 *
 * Step 5 fires ONLY when:
 *   - input.eventId is supplied, AND
 *   - the EventReferrerAssignment provides at least one direct identity signal
 *     (assignedUserId, inviteEmail, or referralCode) that matches the input.
 *
 * eventId alone is never sufficient — the match requires direct person evidence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockAuditLogCreate,
  mockReferralActorFindUnique,
  mockReferralActorFindFirst,
  mockReferralActorFindMany,
  mockReferralActorCreate,
  mockReferralActorUpdate,
  mockReferralLinkFindUnique,
  mockReferralLinkCreate,
  mockReferralLinkUpdate,
  mockReferrerFindFirst,
  mockEventReferrerAssignmentFindFirst,
  mockTransaction,
  mockTxClient,
  mockPrisma,
} = vi.hoisted(() => {
  const mockAuditLogCreate = vi.fn().mockResolvedValue({});
  const mockReferralActorFindUnique = vi.fn();
  const mockReferralActorFindFirst = vi.fn();
  const mockReferralActorFindMany = vi.fn().mockResolvedValue([]);
  const mockReferralActorCreate = vi.fn();
  const mockReferralActorUpdate = vi.fn();
  const mockReferralLinkFindUnique = vi.fn();
  const mockReferralLinkCreate = vi.fn();
  const mockReferralLinkUpdate = vi.fn();
  const mockReferrerFindFirst = vi.fn().mockResolvedValue(null);
  const mockEventReferrerAssignmentFindFirst = vi.fn();

  const mockTxClient = {
    auditLog: { create: mockAuditLogCreate },
    referralActor: {
      findUnique: mockReferralActorFindUnique,
      findFirst: mockReferralActorFindFirst,
      findMany: mockReferralActorFindMany,
      create: mockReferralActorCreate,
      update: mockReferralActorUpdate,
    },
    referralLink: {
      findUnique: mockReferralLinkFindUnique,
      create: mockReferralLinkCreate,
      update: mockReferralLinkUpdate,
    },
    referrer: { findFirst: mockReferrerFindFirst },
    eventReferrerAssignment: { findFirst: mockEventReferrerAssignmentFindFirst },
  };

  const mockTransaction = vi.fn(
    async (cb: (tx: typeof mockTxClient) => Promise<unknown>) => cb(mockTxClient),
  );

  const mockPrisma = {
    auditLog: { create: mockAuditLogCreate },
    referralActor: {
      findUnique: mockReferralActorFindUnique,
      findFirst: mockReferralActorFindFirst,
      findMany: mockReferralActorFindMany,
      create: mockReferralActorCreate,
      update: mockReferralActorUpdate,
    },
    referralLink: {
      findUnique: mockReferralLinkFindUnique,
      create: mockReferralLinkCreate,
      update: mockReferralLinkUpdate,
    },
    referrer: { findFirst: mockReferrerFindFirst },
    eventReferrerAssignment: { findFirst: mockEventReferrerAssignmentFindFirst },
    $transaction: mockTransaction,
  };

  return {
    mockAuditLogCreate,
    mockReferralActorFindUnique,
    mockReferralActorFindFirst,
    mockReferralActorFindMany,
    mockReferralActorCreate,
    mockReferralActorUpdate,
    mockReferralLinkFindUnique,
    mockReferralLinkCreate,
    mockReferralLinkUpdate,
    mockReferrerFindFirst,
    mockEventReferrerAssignmentFindFirst,
    mockTransaction,
    mockTxClient,
    mockPrisma,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("nanoid", () => ({ nanoid: () => "TESTCODE1" }));

import { findOrLinkReferralActor } from "@/server/referrals/referralActorDedupeService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<{
  id: string;
  userId: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  links: Array<{ id: string; isActive: boolean }>;
}> = {}) {
  return {
    id: "actor-bridge",
    userId: "user-host",
    email: null,
    phone: null,
    whatsapp: null,
    links: [{ id: "link-1", isActive: true }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no actors, no legacy referrers, empty phone scan
  mockReferralActorFindUnique.mockResolvedValue(null);
  mockReferralActorFindFirst.mockResolvedValue(null);
  mockReferralActorFindMany.mockResolvedValue([]);
  mockReferrerFindFirst.mockResolvedValue(null);
  mockReferralLinkFindUnique.mockResolvedValue(null);
  mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
  mockReferralActorCreate.mockResolvedValue({ id: "actor-new", userId: null, links: [] });
  mockReferralLinkCreate.mockResolvedValue({ id: "link-new" });
  mockAuditLogCreate.mockResolvedValue({});
});

// ─── Test: eventId + matching email → step 5 fires ───────────────────────────

describe("Event bridge step 5 — exactness", () => {
  it(
    "fires when eventId is supplied and the assignment links to the same email",
    async () => {
      // An EventReferrerAssignment exists for the series with the same email.
      // The bridged actor has no conflicting userId, so resolveCandidate returns found.
      const bridgedActor = makeActor({ userId: null, email: "host@example.com" });
      mockEventReferrerAssignmentFindFirst.mockResolvedValue({
        referralActor: bridgedActor,
      });

      const result = await findOrLinkReferralActor(
        {
          actorType: "STREETSIDE_HOST",
          displayName: "Host Name",
          email: "host@example.com",
          eventId: "series-abc",
          initiatedByUserId: "admin-1",
        },
        { isProvisioningCall: true },
      );

      expect(mockEventReferrerAssignmentFindFirst).toHaveBeenCalledOnce();
      // Result is a found/linked status — step 5 matched
      expect(result.status).toMatch(/^found_existing|linked|reactivated/);
      expect(result.matchField).toBe("eventBridge");
      // Step 7 (create) must NOT have been called
      expect(mockReferralActorCreate).not.toHaveBeenCalled();
    },
  );

  // ─── Test: eventId + DIFFERENT email/phone → step 5 does NOT fire ──────────

  it(
    "does NOT fire when eventId is supplied but the assignment links to a different email",
    async () => {
      // Assignment for this series has a DIFFERENT email — no direct evidence for
      // the incoming identity. The service should fall through to step 7 (create).
      // We verify this by ensuring mockEventReferrerAssignmentFindFirst returns null
      // (the query uses OR: [{ inviteEmail: normEmail }] — with a different email the
      // DB returns null; we simulate that by returning null).
      mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);

      mockReferralActorCreate.mockResolvedValue({
        id: "actor-new",
        userId: null,
        links: [],
      });

      const result = await findOrLinkReferralActor(
        {
          actorType: "STREETSIDE_HOST",
          displayName: "Different Person",
          email: "different@example.com",
          eventId: "series-abc",
          initiatedByUserId: "admin-1",
        },
        { isProvisioningCall: true },
      );

      // Step 5 bridge result must not be returned — falls through to create
      expect(result.matchField).not.toBe("eventBridge");
      expect(result.status).toBe("created");
      // The assignment finder was called (step 5 ran) but returned null → no match
      expect(mockEventReferrerAssignmentFindFirst).toHaveBeenCalledOnce();
      // A new actor was created (step 7)
      expect(mockReferralActorCreate).toHaveBeenCalledOnce();
    },
  );

  // ─── Test: eventId + no assignment → step 5 does NOT fire ──────────────────

  it(
    "does NOT fire when eventId is supplied but no assignment exists",
    async () => {
      // No assignment at all for this series/email combo.
      mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
      mockReferralActorCreate.mockResolvedValue({
        id: "actor-new",
        userId: null,
        links: [],
      });

      const result = await findOrLinkReferralActor(
        {
          actorType: "STREETSIDE_HOST",
          displayName: "New Person",
          email: "fresh@example.com",
          eventId: "series-xyz",
          initiatedByUserId: "admin-1",
        },
        { isProvisioningCall: true },
      );

      // No bridge match — falls to create
      expect(result.matchField).not.toBe("eventBridge");
      expect(result.status).toBe("created");
      expect(mockReferralActorCreate).toHaveBeenCalledOnce();
    },
  );

  // ─── Test: no identity evidence → step 5 does NOT fire even with eventId ───

  it(
    "does NOT query the assignment bridge when eventId is supplied but no identity evidence",
    async () => {
      // No email/userId/referralCode in the input — directEvidence is empty.
      // Step 5 should NOT query the DB at all.
      mockReferralActorCreate.mockResolvedValue({
        id: "actor-new",
        userId: null,
        links: [],
      });

      await findOrLinkReferralActor(
        {
          actorType: "STREETSIDE_HOST",
          displayName: "Anonymous",
          eventId: "series-abc",
          initiatedByUserId: "admin-1",
          // no email, no userId, no referralCode
        },
        { isProvisioningCall: true },
      );

      // Step 5 guard: directEvidence.length === 0 → findFirst must never be called
      expect(mockEventReferrerAssignmentFindFirst).not.toHaveBeenCalled();
    },
  );
});
