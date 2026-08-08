/**
 * Integration tests for ReferralActor dedupe wiring across the three
 * operator/admin mutation routes (Task #167).
 *
 * Convention under test:
 *   same email/phone + SAME user  → idempotent 200 (no 409, no duplicate)
 *   same email/phone + DIFFERENT user → HTTP 409 { code: 'merge_required', ... }
 *
 * Each test mocks `findOrLinkReferralActor` at the module boundary so we
 * exercise the route's mapping logic, not the dedupe service internals
 * (which are covered in referralActorDedupeService.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockFindOrLinkReferralActor,
  mockRequireSession,
  mockRequirePermission,
  mockPrismaTransaction,
  mockPrismaUserFindUnique,
  mockPrismaReferralActorTypeDef,
  mockPrismaReferralActorFindUniqueOrThrow,
  mockPrismaReferralActorFindUnique,
  mockPrismaReferralLinkFindUnique,
  mockPrismaReferralLinkCreate,
  mockPrismaReferralAssignmentFindFirst,
  mockPrismaReferralAssignmentCreate,
  mockPrismaAuditLogCreate,
  mockPrismaUserAuditLogCreate,
  mockPrismaReferrerFindUnique,
  mockTxClient,
  mockPrisma,
} = vi.hoisted(() => {
  const mockFindOrLinkReferralActor = vi.fn();
  const mockRequireSession = vi.fn();
  const mockRequirePermission = vi.fn();
  const mockPrismaAuditLogCreate = vi.fn().mockResolvedValue({});
  const mockPrismaUserAuditLogCreate = vi.fn().mockResolvedValue({});
  const mockPrismaReferralLinkFindUnique = vi.fn().mockResolvedValue(null);
  const mockPrismaReferralLinkCreate = vi.fn().mockResolvedValue({ id: "link-new", code: "REF-NEWCODE", url: "https://x.com/?ref=REF-NEWCODE", isActive: true });
  const mockPrismaReferralAssignmentFindFirst = vi.fn().mockResolvedValue(null);
  const mockPrismaReferralAssignmentCreate = vi.fn().mockResolvedValue({
    id: "assign-1",
    scopeType: "GLOBAL",
    scopeId: null,
    compensationMode: "NONE",
    rateBps: null,
    flatAmountCents: null,
    isActive: true,
  });
  const mockPrismaUserFindUnique = vi.fn();
  const mockPrismaReferralActorTypeDef = {
    findUnique: vi.fn(),
    findFirst: vi.fn().mockResolvedValue({ code: "streetside_host" }),
  };
  const mockPrismaReferralActorFindUniqueOrThrow = vi.fn();
  const mockPrismaReferralActorFindUnique = vi.fn();
  const mockPrismaReferrerFindUnique = vi.fn().mockResolvedValue(null);

  const mockTxClient = {
    user: {
      create: vi.fn().mockResolvedValue({ id: "new-user-id" }),
    },
    referralActorTypeDef: mockPrismaReferralActorTypeDef,
    referralActor: {
      findUniqueOrThrow: mockPrismaReferralActorFindUniqueOrThrow,
      findUnique: mockPrismaReferralActorFindUnique,
      update: vi.fn().mockResolvedValue({}),
    },
    referralLink: {
      findUnique: mockPrismaReferralLinkFindUnique,
      create: mockPrismaReferralLinkCreate,
    },
    referralAssignment: {
      findFirst: mockPrismaReferralAssignmentFindFirst,
      create: mockPrismaReferralAssignmentCreate,
    },
    auditLog: { create: mockPrismaAuditLogCreate },
    userAuditLog: { create: mockPrismaUserAuditLogCreate },
  };

  const mockPrismaTransaction = vi.fn(async (cb: (tx: typeof mockTxClient) => Promise<unknown>) =>
    cb(mockTxClient),
  );

  const mockPrisma = {
    user: { findUnique: mockPrismaUserFindUnique },
    referralActorTypeDef: mockPrismaReferralActorTypeDef,
    referralActor: {
      findUniqueOrThrow: mockPrismaReferralActorFindUniqueOrThrow,
      findUnique: mockPrismaReferralActorFindUnique,
      update: vi.fn().mockResolvedValue({}),
    },
    referrer: { findUnique: mockPrismaReferrerFindUnique, findFirst: vi.fn().mockResolvedValue(null) },
    referralLink: {
      findUnique: mockPrismaReferralLinkFindUnique,
      create: mockPrismaReferralLinkCreate,
    },
    referralAssignment: {
      findFirst: mockPrismaReferralAssignmentFindFirst,
      create: mockPrismaReferralAssignmentCreate,
    },
    auditLog: { create: mockPrismaAuditLogCreate },
    userAuditLog: { create: mockPrismaUserAuditLogCreate },
    $transaction: mockPrismaTransaction,
  };

  return {
    mockFindOrLinkReferralActor,
    mockRequireSession,
    mockRequirePermission,
    mockPrismaTransaction,
    mockPrismaUserFindUnique,
    mockPrismaReferralActorTypeDef,
    mockPrismaReferralActorFindUniqueOrThrow,
    mockPrismaReferralActorFindUnique,
    mockPrismaReferralLinkFindUnique,
    mockPrismaReferralLinkCreate,
    mockPrismaReferralAssignmentFindFirst,
    mockPrismaReferralAssignmentCreate,
    mockPrismaAuditLogCreate,
    mockPrismaUserAuditLogCreate,
    mockPrismaReferrerFindUnique,
    mockTxClient,
    mockPrisma,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/server/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/rbac", () => ({ requirePermission: mockRequirePermission }));
vi.mock("nanoid", () => ({ nanoid: () => "TESTCODE1" }));
vi.mock("@/server/referrals/referralActorDedupeService", () => ({
  findOrLinkReferralActor: mockFindOrLinkReferralActor,
  normalizeEmail: (v: string | null | undefined) => v?.trim().toLowerCase() ?? null,
  normalizePhone: (v: string | null | undefined) => v?.replace(/\D+/g, "") ?? null,
}));
// Mock the parent route's resolveReferrerResolution so we don't have to wire it up.
vi.mock(
  "@/app/api/v1/admin/users/[id]/referrer-resolution/route",
  () => ({
    resolveReferrerResolution: vi.fn().mockResolvedValue({ state: "resolved_v2", label: "Active", reason: "", actor: null, legacyReferrer: null }),
  }),
);
vi.mock("@/lib/operatorContainer", () => ({
  resolveAssignmentDefaults: vi.fn().mockReturnValue({
    scopeType: "GLOBAL",
    scopeId: null,
    parentEntityType: null,
    parentEntityId: null,
  }),
  isValidScopeType: vi.fn().mockReturnValue(true),
}));

import { NextRequest } from "next/server";
import { POST as operatorCreatePost } from "@/app/api/v1/operators/create/route";
import { POST as findOrCreatePost } from "@/app/api/v1/admin/referrals/actors/find-or-create/route";
import { POST as resolvePost } from "@/app/api/v1/admin/users/[id]/referrer-resolution/resolve/route";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_SESSION = { userId: "admin-1", roles: ["SUPERADMIN"] };

const EXISTING_ACTOR = {
  id: "actor-existing",
  userId: "user-same",
  email: "alice@oku.com",
  phone: null,
  whatsapp: null,
  displayName: "Alice",
  actorType: "STREETSIDE_HOST",
  actorTypeCode: null,
  legacyReferrerId: null,
  status: "ACTIVE",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  organizationName: null,
  metadataJson: null,
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Scenario 1: Operator create — same email + same user → 200 ───────────────

describe("POST /api/v1/operators/create — dedupe scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockRequirePermission.mockReturnValue(undefined);
    // No existing user by email (new provisioning)
    mockPrismaUserFindUnique.mockResolvedValue(null);
    // No legacy referrer
    mockPrismaReferrerFindUnique.mockResolvedValue(null);
    // Actor type def lookup
    mockPrismaReferralActorTypeDef.findFirst.mockResolvedValue({ code: "streetside_host" });
  });

  it("Scenario 1: same email + same user → 200, no duplicate actor created", async () => {
    // findOrLinkReferralActor finds actor already linked to this user
    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "found_existing_linked",
      actorId: "actor-existing",
      referralLinkId: "link-1",
      matchField: "email",
      provisioningPath: "step2_email",
      mutated: false,
    });

    // Actor row returned after dedup
    mockPrismaReferralActorFindUniqueOrThrow.mockResolvedValue({
      id: "actor-existing",
      displayName: "Alice",
      legacyReferrerId: null,
    });

    // attachExistingUserId path: user exists and email matches
    mockPrismaUserFindUnique.mockResolvedValue({ id: "user-same", email: "alice@oku.com" });

    const req = makeRequest({
      actor: { actorType: "STREETSIDE_HOST", displayName: "Alice", email: "alice@oku.com" },
      container: { kind: "scope", scopeType: "GLOBAL" },
      user: { attachExistingUserId: "user-same" },
    });

    const res = await operatorCreatePost(req);
    const body = await res.json();

    // Idempotent same-user match → 200 (not 201; no new resource was minted).
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actorId).toBe("actor-existing");
    // status + matchField added additively
    expect(body.status).toBe("found_existing_linked");
    expect(body.matchField).toBe("email");
    // Dedupe was called exactly once — no second actor.create call
    expect(mockFindOrLinkReferralActor).toHaveBeenCalledTimes(1);
  });

  it("Scenario 2b: blocked (legacy code taken) → 409, no actor fetch or mutation", async () => {
    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "blocked",
      reason: "legacy_code_taken",
      matchField: "legacyReferrer",
      provisioningPath: "step4_legacy_code_taken",
      mutated: false,
    });

    mockPrismaUserFindUnique.mockResolvedValue({ id: "user-same", email: "alice@oku.com" });

    const req = makeRequest({
      actor: { actorType: "STREETSIDE_HOST", displayName: "Alice", email: "alice@oku.com" },
      container: { kind: "scope", scopeType: "GLOBAL" },
      user: { attachExistingUserId: "user-same" },
    });

    const res = await operatorCreatePost(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/blocked/i);
    // findUniqueOrThrow must never be called — no actorId on blocked result
    expect(mockPrismaReferralActorFindUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("Scenario 2: same email + different user → 409 merge_required, no duplicate actor", async () => {
    // findOrLinkReferralActor finds actor linked to a DIFFERENT user
    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "merge_required",
      candidateActorId: "actor-other",
      candidateActorUserId: "user-other",
      incomingUserId: "user-same",
      matchField: "email",
      provisioningPath: "step2_email",
      mutated: false,
      reason: "Candidate actor belongs to a different user (matched on email)",
    });

    // attachExistingUserId path: user exists and email matches
    mockPrismaUserFindUnique.mockResolvedValue({ id: "user-same", email: "alice@oku.com" });

    const req = makeRequest({
      actor: { actorType: "STREETSIDE_HOST", displayName: "Alice", email: "alice@oku.com" },
      container: { kind: "scope", scopeType: "GLOBAL" },
      user: { attachExistingUserId: "user-same" },
    });

    const res = await operatorCreatePost(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("merge_required");
    expect(body.candidateActorId).toBe("actor-other");
    expect(body.candidateActorUserId).toBe("user-other");
    expect(body.matchField).toBe("email");
    // No new actor was created — dedupe threw before any create
    expect(mockTxClient.referralActor?.update).not.toHaveBeenCalled();
  });
});

// ─── Scenario 3 & 4: Admin find-or-create ─────────────────────────────────────

describe("POST /api/v1/admin/referrals/actors/find-or-create — dedupe scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("Scenario 3: same phone + same user → 200 found_existing_linked, no duplicate", async () => {
    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "found_existing_linked",
      actorId: "actor-existing",
      referralLinkId: "link-1",
      matchField: "phone",
      provisioningPath: "step3_phone",
      mutated: false,
    });
    mockPrismaReferralActorFindUniqueOrThrow.mockResolvedValue(EXISTING_ACTOR);

    const req = makeRequest({
      actorType: "STREETSIDE_HOST",
      displayName: "Alice",
      phone: "+507 6123-4567",
      userId: "user-same",
    });

    const res = await findOrCreatePost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("found_existing_linked");
    expect(body.matchField).toBe("phone");
    expect(body.matched).toBe(true);
    expect(body.actor.id).toBe("actor-existing");
    // Only one dedup call — no duplicate actor
    expect(mockFindOrLinkReferralActor).toHaveBeenCalledTimes(1);
  });

  it("Scenario 4: same phone + different user → 409 merge_required", async () => {
    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "merge_required",
      candidateActorId: "actor-other",
      candidateActorUserId: "user-other",
      incomingUserId: "user-incoming",
      matchField: "phone",
      provisioningPath: "step3_phone",
      mutated: false,
      reason: "Candidate actor belongs to a different user (matched on phone)",
    });

    const req = makeRequest({
      actorType: "STREETSIDE_HOST",
      displayName: "Alice",
      phone: "+507 6123-4567",
      userId: "user-incoming",
    });

    const res = await findOrCreatePost(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("merge_required");
    expect(body.candidateActorId).toBe("actor-other");
    expect(body.candidateActorUserId).toBe("user-other");
    expect(body.matchField).toBe("phone");
    // No actor fetched — short-circuit before findUniqueOrThrow
    expect(mockPrismaReferralActorFindUniqueOrThrow).not.toHaveBeenCalled();
  });
});

// ─── Scenario 5: Admin referrer-resolution resolve ────────────────────────────

describe("POST /api/v1/admin/users/[id]/referrer-resolution/resolve — dedupe scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockRequirePermission.mockReturnValue(undefined);
    mockPrismaReferralActorFindUnique.mockResolvedValue(null);
    mockPrismaReferrerFindUnique.mockResolvedValue(null);
  });

  it("Scenario 5a: mode=create, userId matches actor already linked to SAME user → 200 idempotent (no dup)", async () => {
    mockPrismaUserFindUnique.mockResolvedValue({
      id: "target-user",
      email: "bob@oku.com",
      phone: null,
      name: "Bob",
      roles: [{ roleKey: "STREETSIDE_HOST" }],
    });

    // Dedupe finds actor already linked to this same user → no-op
    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "found_existing_linked",
      actorId: "actor-same-user",
      referralLinkId: "link-1",
      matchField: "userId",
      provisioningPath: "step1_userId",
      mutated: false,
    });

    const req = makeRequest({ mode: "create" });
    const res = await resolvePost(req, {
      params: Promise.resolve({ id: "target-user" }),
    });
    const body = await res.json();

    // Same-user match is always idempotent — never a 409
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // No new actor was created
    expect(mockPrismaAuditLogCreate).not.toHaveBeenCalled();
    expect(mockFindOrLinkReferralActor).toHaveBeenCalledTimes(1);
  });

  it("Scenario 5: mode=create, userId matches actor owned by different user → 409 merge_required", async () => {
    // Target user exists
    mockPrismaUserFindUnique.mockResolvedValue({
      id: "target-user",
      email: "bob@oku.com",
      phone: null,
      name: "Bob",
      roles: [{ roleKey: "STREETSIDE_HOST" }],
    });

    // Dedupe finds actor with same email owned by a DIFFERENT user
    mockFindOrLinkReferralActor.mockResolvedValue({
      status: "merge_required",
      candidateActorId: "actor-conflict",
      candidateActorUserId: "other-user",
      incomingUserId: "target-user",
      matchField: "email",
      provisioningPath: "step2_email",
      mutated: false,
      reason: "Candidate actor belongs to a different user (matched on email)",
    });

    const req = makeRequest({ mode: "create" });
    const res = await resolvePost(req, {
      params: Promise.resolve({ id: "target-user" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("merge_required");
    expect(body.candidateActorId).toBe("actor-conflict");
    expect(body.candidateActorUserId).toBe("other-user");
    expect(body.matchField).toBe("email");
    // No actor created — merge_required is a hard stop
    expect(mockPrismaAuditLogCreate).not.toHaveBeenCalled();
  });
});
