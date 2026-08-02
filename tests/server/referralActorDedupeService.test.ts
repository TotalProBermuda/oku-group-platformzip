import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks (must be before vi.mock calls) ─────────────────────────────

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
  const mockReferralActorFindMany = vi.fn();
  const mockReferralActorCreate = vi.fn();
  const mockReferralActorUpdate = vi.fn();
  const mockReferralLinkFindUnique = vi.fn();
  const mockReferralLinkCreate = vi.fn();
  const mockReferralLinkUpdate = vi.fn();
  const mockReferrerFindFirst = vi.fn();
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
  };

  const mockTransaction = vi.fn(async (cb: (tx: typeof mockTxClient) => Promise<unknown>) =>
    cb(mockTxClient),
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

import {
  findOrLinkReferralActor,
  normalizeEmail,
  normalizePhone,
} from "@/server/referrals/referralActorDedupeService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeActor(
  overrides: Partial<{
    id: string;
    userId: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    links: Array<{ id: string; isActive: boolean }>;
  }> = {},
) {
  return {
    id: "actor-1",
    userId: null,
    email: null,
    phone: null,
    whatsapp: null,
    links: [{ id: "link-1", isActive: true }],
    ...overrides,
  };
}

const baseInput = {
  actorType: "STREETSIDE_HOST" as const,
  displayName: "Test Person",
  initiatedByUserId: "admin-1",
} as const;

// ─── normalizeEmail ───────────────────────────────────────────────────────────

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  HELLO@World.com  ")).toBe("hello@world.com");
  });
  it("returns null for empty/null/undefined", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

// ─── normalizePhone ───────────────────────────────────────────────────────────

describe("normalizePhone", () => {
  it("strips non-digit characters", () => {
    expect(normalizePhone("+507 6123-4567")).toBe("50761234567");
  });
  it("does NOT add E.164 prefix", () => {
    expect(normalizePhone("6123-4567")).toBe("61234567");
  });
  it("returns null for empty/null/undefined", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

// ─── Step 1: userId match ─────────────────────────────────────────────────────

describe("step 1 — userId match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindMany.mockResolvedValue([]);
    mockReferrerFindFirst.mockResolvedValue(null);
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
  });

  it("returns found_existing_linked when actor.userId === input.userId", async () => {
    const actor = makeActor({ id: "actor-a", userId: "user-1" });
    mockReferralActorFindUnique.mockResolvedValue(actor);

    const res = await findOrLinkReferralActor({ ...baseInput, userId: "user-1" });

    expect(res.status).toBe("found_existing_linked");
    if (res.status === "found_existing_linked") {
      expect(res.actorId).toBe("actor-a");
      expect(res.matchField).toBe("userId");
      expect(res.mutated).toBe(false);
    }
  });

  it("writes dedupe_found audit on provisioning call", async () => {
    const actor = makeActor({ userId: "user-1" });
    mockReferralActorFindUnique.mockResolvedValue(actor);

    await findOrLinkReferralActor({ ...baseInput, userId: "user-1" }, { isProvisioningCall: true });

    const auditCalls = mockAuditLogCreate.mock.calls as Array<[{ data: { action: string } }]>;
    const foundCall = auditCalls.find(([args]) => args.data.action === "referral.actor.dedupe_found");
    expect(foundCall).toBeTruthy();
  });

  it("suppresses dedupe_found audit when isProvisioningCall: false", async () => {
    const actor = makeActor({ userId: "user-1" });
    mockReferralActorFindUnique.mockResolvedValue(actor);

    await findOrLinkReferralActor({ ...baseInput, userId: "user-1" }, { isProvisioningCall: false });

    const auditCalls = mockAuditLogCreate.mock.calls as Array<[{ data: { action: string } }]>;
    const foundCall = auditCalls.find(([args]) => args.data.action === "referral.actor.dedupe_found");
    expect(foundCall).toBeUndefined();
  });
});

// ─── Step 2: email match ──────────────────────────────────────────────────────

describe("step 2 — email match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorFindMany.mockResolvedValue([]);
    mockReferrerFindFirst.mockResolvedValue(null);
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
  });

  it("returns found_existing_linked when emails match and same userId", async () => {
    const actor = makeActor({ id: "actor-b", userId: "user-2", email: "alice@oku.com" });
    mockReferralActorFindFirst.mockResolvedValue(actor);

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-2",
      email: "Alice@OKU.com",
    });

    expect(res.status).toBe("found_existing_linked");
    if (res.status === "found_existing_linked") {
      expect(res.matchField).toBe("email");
    }
  });

  it("links orphaned actor when email matches and actor.userId is null", async () => {
    const actor = makeActor({ id: "actor-c", userId: null, email: "bob@oku.com" });
    mockReferralActorFindFirst.mockResolvedValue(actor);
    mockReferralActorUpdate.mockResolvedValue({ ...actor, userId: "user-3" });

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-3",
      email: "bob@oku.com",
    });

    expect(res.status).toBe("linked");
    if (res.status === "linked") {
      expect(res.actorId).toBe("actor-c");
      expect(res.mutated).toBe(true);
    }
    expect(mockReferralActorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "actor-c" }, data: { userId: "user-3" } }),
    );
  });

  it("returns merge_required when email matches but different user owns the actor", async () => {
    const actor = makeActor({ id: "actor-d", userId: "other-user", email: "carol@oku.com" });
    mockReferralActorFindFirst.mockResolvedValue(actor);

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-4",
      email: "carol@oku.com",
    });

    expect(res.status).toBe("merge_required");
    if (res.status === "merge_required") {
      expect(res.candidateActorId).toBe("actor-d");
      expect(res.candidateActorUserId).toBe("other-user");
      expect(res.incomingUserId).toBe("user-4");
      expect(res.matchField).toBe("email");
      expect(res.mutated).toBe(false);
    }
  });

  it("returns found_existing_unlinked when no userId on either side", async () => {
    const actor = makeActor({ id: "actor-e", userId: null, email: "ghost@oku.com" });
    mockReferralActorFindFirst.mockResolvedValue(actor);

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: null,
      email: "ghost@oku.com",
    });

    expect(res.status).toBe("found_existing_unlinked");
    if (res.status === "found_existing_unlinked") {
      expect(res.matchField).toBe("email");
      expect(res.mutated).toBe(false);
    }
  });

  it("reactivates an inactive link and returns reactivated_link on email match (general path)", async () => {
    // Actor matched by email has only an inactive link — resolveCandidate should
    // reactivate it and return reactivated_link, not found_existing_linked.
    const actor = makeActor({
      id: "actor-inactive-link",
      userId: "user-rl",
      email: "reactivate@oku.com",
      links: [{ id: "inactive-link-gen", isActive: false }],
    });
    mockReferralActorFindFirst.mockResolvedValue(actor);
    mockReferralLinkUpdate.mockResolvedValue({ id: "inactive-link-gen", isActive: true });

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-rl",
      email: "reactivate@oku.com",
    });

    expect(res.status).toBe("reactivated_link");
    if (res.status === "reactivated_link") {
      expect(res.actorId).toBe("actor-inactive-link");
      expect(res.referralLinkId).toBe("inactive-link-gen");
      expect(res.mutated).toBe(true);
    }
    expect(mockReferralLinkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inactive-link-gen" }, data: { isActive: true } }),
    );
  });
});

// ─── Step 3: phone match ──────────────────────────────────────────────────────

describe("step 3 — phone match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorFindFirst.mockResolvedValue(null);   // email step → no match
    mockReferralActorFindMany.mockResolvedValue([]);       // phone step default → no match
    mockReferrerFindFirst.mockResolvedValue(null);
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (cb: (tx: typeof mockTxClient) => Promise<unknown>) =>
      cb(mockTxClient),
    );
  });

  it("returns found_existing_linked when phone matches and same userId", async () => {
    // Actor stored with formatted phone — "50761234567" normalizes identically to "+507 6123-4567".
    // Step 3 uses findMany + JS normalization so formatting differences never cause misses.
    const actor = makeActor({ id: "actor-f", userId: "user-5", phone: "50761234567" });
    // findMany returns the actor; JS normalization confirms the match.
    mockReferralActorFindMany.mockResolvedValue([actor]);

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-5",
      phone: "+507 6123-4567",
    });

    expect(res.status).toBe("found_existing_linked");
    if (res.status === "found_existing_linked") {
      expect(res.matchField).toBe("phone");
    }
  });

  it("matches formatted stored phone (e.g. '+507 6123-4567') against digit-only input", async () => {
    // Stored value is formatted; input digits only. Both normalize to "50761234567".
    const actor = makeActor({ id: "actor-fmt", userId: "user-5", phone: "+507 6123-4567" });
    mockReferralActorFindMany.mockResolvedValue([actor]);

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-5",
      phone: "50761234567",
    });

    expect(res.status).toBe("found_existing_linked");
    if (res.status === "found_existing_linked") {
      expect(res.matchField).toBe("phone");
    }
  });

  it("skips non-matching candidates and finds the true match", async () => {
    // First candidate does not normalize to the target — should be skipped.
    const wrongActor = makeActor({ id: "actor-wrong", userId: "user-5", phone: "50769999999" });
    const rightActor = makeActor({ id: "actor-right", userId: "user-5", phone: "50761234567" });
    mockReferralActorFindMany.mockResolvedValue([wrongActor, rightActor]);

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-5",
      phone: "+507 6123-4567",
    });

    expect(res.status).toBe("found_existing_linked");
    if (res.status === "found_existing_linked") {
      expect(res.actorId).toBe("actor-right");
    }
  });

  it("returns merge_required when phone matches but different user", async () => {
    const actor = makeActor({ id: "actor-g", userId: "other-5", phone: "50761111111" });
    mockReferralActorFindMany.mockResolvedValue([actor]);

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-6",
      phone: "+507 6111-1111",
    });

    expect(res.status).toBe("merge_required");
    if (res.status === "merge_required") {
      expect(res.matchField).toBe("phone");
    }
  });
});

// ─── Step 4: legacy Referrer ──────────────────────────────────────────────────

describe("step 4 — legacy Referrer pickup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorFindFirst.mockResolvedValue(null);
    mockReferralActorFindMany.mockResolvedValue([]);
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (cb: (tx: typeof mockTxClient) => Promise<unknown>) =>
      cb(mockTxClient),
    );
  });

  it("creates actor with unique legacy code (status: created)", async () => {
    mockReferrerFindFirst.mockResolvedValue({
      id: "ref-1",
      referralCode: "HOST-LEGACY",
      fullName: "Legacy Person",
      isActive: true,
    });
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralLinkFindUnique.mockResolvedValue(null);
    mockReferralActorCreate.mockResolvedValue({ id: "actor-new" });
    mockReferralLinkCreate.mockResolvedValue({ id: "link-new" });

    const res = await findOrLinkReferralActor({ ...baseInput, userId: "user-7" });

    expect(res.status).toBe("created");
    if (res.status === "created") {
      expect(res.referralLinkId).toBe("link-new");
      expect(res.matchField).toBe("legacyReferrer");
    }
    expect(mockReferralLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: "HOST-LEGACY" }),
      }),
    );
  });

  it("returns blocked (no actor created) when code is taken and allowNewCodeOnLegacyConflict is false", async () => {
    mockReferrerFindFirst.mockResolvedValue({
      id: "ref-2",
      referralCode: "TAKEN-CODE",
      fullName: "Another Person",
      isActive: true,
    });
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralLinkFindUnique.mockResolvedValue({
      id: "other-link",
      isActive: true,
      referralActorId: "other-actor",
    });

    const res = await findOrLinkReferralActor({ ...baseInput, userId: "user-8" });

    expect(res.status).toBe("blocked");
    if (res.status === "blocked") {
      expect(res.reason).toBe("legacy_code_taken");
      expect(res.matchField).toBe("legacyReferrer");
      expect(res.mutated).toBe(false);
    }
    // No actor and no link should be created
    expect(mockReferralActorCreate).not.toHaveBeenCalled();
    expect(mockReferralLinkCreate).not.toHaveBeenCalled();
  });

  it("returns blocked when code is INACTIVE and allowNewCodeOnLegacyConflict is false", async () => {
    mockReferrerFindFirst.mockResolvedValue({
      id: "ref-inactive",
      referralCode: "INACTIVE-TAKEN",
      fullName: "Inactive Person",
      isActive: true,
    });
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralLinkFindUnique.mockResolvedValue({
      id: "inactive-link",
      isActive: false,
      referralActorId: "some-other-actor",
    });

    const res = await findOrLinkReferralActor({ ...baseInput, userId: "user-8b" });

    expect(res.status).toBe("blocked");
    if (res.status === "blocked") {
      expect(res.reason).toBe("legacy_code_taken");
      expect(res.mutated).toBe(false);
    }
    expect(mockReferralActorCreate).not.toHaveBeenCalled();
    expect(mockReferralLinkCreate).not.toHaveBeenCalled();
  });

  it("generates new code when allowNewCodeOnLegacyConflict is true and code is taken", async () => {
    mockReferrerFindFirst.mockResolvedValue({
      id: "ref-3",
      referralCode: "TAKEN-CODE-2",
      fullName: "Person 3",
      isActive: true,
    });
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralLinkFindUnique.mockResolvedValue({
      id: "taken-link",
      isActive: true,
      referralActorId: "other-actor",
    });
    mockReferralActorCreate.mockResolvedValue({ id: "actor-new-3" });
    mockReferralLinkCreate.mockResolvedValue({ id: "fresh-link" });

    const res = await findOrLinkReferralActor(
      { ...baseInput, userId: "user-9" },
      { allowNewCodeOnLegacyConflict: true },
    );

    expect(res.status).toBe("created");
    if (res.status === "created") {
      expect(res.referralLinkId).toBe("fresh-link");
    }
    expect(mockReferralLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: "REF-TESTCODE1" }),
      }),
    );
  });

  it("creates actor with new code when allowNewCodeOnLegacyConflict is true and code is taken (inactive)", async () => {
    mockReferrerFindFirst.mockResolvedValue({
      id: "ref-4",
      referralCode: "INACTIVE-CODE",
      fullName: "Person 4",
      isActive: true,
    });
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorCreate.mockResolvedValue({ id: "actor-new-4" });
    mockReferralLinkFindUnique.mockResolvedValue({
      id: "inactive-link",
      isActive: false,
      referralActorId: "other-actor",
    });
    mockReferralLinkCreate.mockResolvedValue({ id: "fresh-link-2" });

    const res = await findOrLinkReferralActor(
      { ...baseInput, userId: "user-10" },
      { allowNewCodeOnLegacyConflict: true },
    );

    expect(res.status).toBe("created");
    if (res.status === "created") {
      expect(res.referralLinkId).toBe("fresh-link-2");
      expect(res.actorId).toBe("actor-new-4");
    }
    // Must NOT have tried to reactivate the old link
    expect(mockReferralLinkUpdate).not.toHaveBeenCalled();
    // Must have created a fresh link with a generated code (not "INACTIVE-CODE")
    expect(mockReferralLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referralActorId: "actor-new-4",
          code: expect.not.stringMatching(/^INACTIVE-CODE$/),
        }),
      }),
    );
  });
});

// ─── Step 5: EventReferrerAssignment bridge ───────────────────────────────────

describe("step 5 — event bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorFindFirst.mockResolvedValue(null);
    mockReferralActorFindMany.mockResolvedValue([]);
    mockReferrerFindFirst.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (cb: (tx: typeof mockTxClient) => Promise<unknown>) =>
      cb(mockTxClient),
    );
    mockReferralActorCreate.mockResolvedValue({ id: "actor-created" });
  });

  it("does NOT fire step 5 when input.eventId is missing", async () => {
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);

    await findOrLinkReferralActor({ ...baseInput, email: "x@oku.com" });

    expect(mockEventReferrerAssignmentFindFirst).not.toHaveBeenCalled();
  });

  it("does NOT fire step 5 when eventId is supplied but no direct evidence (no email/userId)", async () => {
    await findOrLinkReferralActor({ ...baseInput, eventId: "series-1" });

    expect(mockEventReferrerAssignmentFindFirst).not.toHaveBeenCalled();
  });

  it("fires step 5 and returns found_existing_linked when eventId + email matches", async () => {
    const actor = makeActor({ id: "actor-bridge", userId: "user-evt", email: "evt@oku.com" });
    mockEventReferrerAssignmentFindFirst.mockResolvedValue({ referralActor: actor });

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-evt",
      email: "evt@oku.com",
      eventId: "series-1",
    });

    expect(res.status).toBe("found_existing_linked");
    if (res.status === "found_existing_linked") {
      expect(res.matchField).toBe("eventBridge");
    }
    expect(mockEventReferrerAssignmentFindFirst).toHaveBeenCalled();
  });

  it("fires step 5 when eventId + referralCode is supplied as direct evidence", async () => {
    const actor = makeActor({ id: "actor-code-bridge", userId: "user-rc" });
    mockEventReferrerAssignmentFindFirst.mockResolvedValue({ referralActor: actor });

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-rc",
      referralCode: "REF-CODE-1",
      eventId: "series-2",
    });

    expect(res.status).toBe("found_existing_linked");
    if (res.status === "found_existing_linked") {
      expect(res.matchField).toBe("eventBridge");
    }
    // Confirm the bridge query was called with referralCode in the OR clause
    expect(mockEventReferrerAssignmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ referralCode: "REF-CODE-1" }]),
        }),
      }),
    );
  });

  it("does NOT fire step 5 when only eventId is supplied (no userId/email/referralCode)", async () => {
    await findOrLinkReferralActor({ ...baseInput, eventId: "series-3" });

    expect(mockEventReferrerAssignmentFindFirst).not.toHaveBeenCalled();
  });
});

// ─── Step 6: ReferralLink.code ────────────────────────────────────────────────

describe("step 6 — referral code lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorFindFirst.mockResolvedValue(null);
    mockReferralActorFindMany.mockResolvedValue([]);
    mockReferrerFindFirst.mockResolvedValue(null);
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (cb: (tx: typeof mockTxClient) => Promise<unknown>) =>
      cb(mockTxClient),
    );
    mockReferralActorCreate.mockResolvedValue({ id: "actor-created" });
  });

  it("does NOT fire step 6 when referralCode is not supplied", async () => {
    await findOrLinkReferralActor({ ...baseInput });

    expect(mockReferralLinkFindUnique).not.toHaveBeenCalled();
  });

  it("returns found_existing_linked when referralCode matches and same userId", async () => {
    const actor = makeActor({ id: "actor-code", userId: "user-code" });
    mockReferralLinkFindUnique.mockResolvedValue({ referralActor: actor });

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "user-code",
      referralCode: "MY-CODE",
    });

    expect(res.status).toBe("found_existing_linked");
    if (res.status === "found_existing_linked") {
      expect(res.matchField).toBe("referralCode");
    }
    expect(mockReferralLinkFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: "MY-CODE" } }),
    );
  });
});

// ─── Step 7: create new actor ─────────────────────────────────────────────────

describe("step 7 — create new actor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorFindFirst.mockResolvedValue(null);
    mockReferralActorFindMany.mockResolvedValue([]);
    mockReferrerFindFirst.mockResolvedValue(null);
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (cb: (tx: typeof mockTxClient) => Promise<unknown>) =>
      cb(mockTxClient),
    );
  });

  it("creates a new actor and returns status: created", async () => {
    mockReferralActorCreate.mockResolvedValue({ id: "brand-new" });

    const res = await findOrLinkReferralActor({ ...baseInput });

    expect(res.status).toBe("created");
    if (res.status === "created") {
      expect(res.actorId).toBe("brand-new");
      expect(res.matchField).toBeNull();
      expect(res.mutated).toBe(true);
    }
    expect(mockReferralActorCreate).toHaveBeenCalled();
  });

  it("writes dedupe_created audit on create", async () => {
    mockReferralActorCreate.mockResolvedValue({ id: "brand-new-2" });

    await findOrLinkReferralActor({ ...baseInput });

    const auditCalls = mockAuditLogCreate.mock.calls as Array<[{ data: { action: string } }]>;
    const createdCall = auditCalls.find(([args]) => args.data.action === "referral.actor.dedupe_created");
    expect(createdCall).toBeTruthy();
  });
});

// ─── override_created ─────────────────────────────────────────────────────────

describe("overrideContext — override_created", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorFindMany.mockResolvedValue([]);
    mockReferrerFindFirst.mockResolvedValue(null);
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
  });

  it("creates a separate actor when overrideContext is provided despite email conflict", async () => {
    const conflictingActor = makeActor({ id: "conflict-actor", userId: "owner-user", email: "taken@oku.com" });
    mockReferralActorFindFirst.mockResolvedValue(conflictingActor);
    mockReferralActorCreate.mockResolvedValue({ id: "override-actor" });

    const res = await findOrLinkReferralActor({
      ...baseInput,
      userId: "new-user",
      email: "taken@oku.com",
      overrideContext: { authorizedBy: "admin-1", reason: "Duplicate confirmed by compliance" },
    });

    expect(res.status).toBe("override_created");
    if (res.status === "override_created") {
      expect(res.actorId).toBe("override-actor");
      expect(res.mutated).toBe(true);
      expect(res.overrideContext.authorizedBy).toBe("admin-1");
    }
  });
});

// ─── merge_required audit ─────────────────────────────────────────────────────

describe("merge_required audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorFindMany.mockResolvedValue([]);
    mockReferrerFindFirst.mockResolvedValue(null);
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
  });

  it("includes incomingUserId, candidateActorId, candidateActorUserId in audit metadata", async () => {
    const conflictActor = makeActor({ id: "cand-1", userId: "owner-99", email: "conflict@oku.com" });
    mockReferralActorFindFirst.mockResolvedValue(conflictActor);

    await findOrLinkReferralActor({
      ...baseInput,
      userId: "incoming-99",
      email: "conflict@oku.com",
    });

    const auditCalls = mockAuditLogCreate.mock.calls as Array<[{ data: { action: string; metadata: Record<string, unknown> } }]>;
    const mergeCall = auditCalls.find(([args]) => args.data.action === "referral.actor.merge_required");
    expect(mergeCall).toBeTruthy();
    const meta = mergeCall![0].data.metadata;
    expect(meta.incomingUserId).toBe("incoming-99");
    expect(meta.candidateActorId).toBe("cand-1");
    expect(meta.candidateActorUserId).toBe("owner-99");
  });
});

// ─── override_created audit metadata (P1-C) ───────────────────────────────────

describe("override_created audit — conflict metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralActorFindUnique.mockResolvedValue(null);
    mockReferralActorFindMany.mockResolvedValue([]);
    mockReferrerFindFirst.mockResolvedValue(null);
    mockEventReferrerAssignmentFindFirst.mockResolvedValue(null);
  });

  it("writes candidateActorUserId, incomingUserId, authorizedBy, and reason to audit metadata", async () => {
    const conflictingActor = makeActor({ id: "override-cand", userId: "conflict-owner", email: "override@oku.com" });
    mockReferralActorFindFirst.mockResolvedValue(conflictingActor);
    mockReferralActorCreate.mockResolvedValue({ id: "override-new" });

    await findOrLinkReferralActor({
      ...baseInput,
      userId: "incoming-override",
      email: "override@oku.com",
      overrideContext: { authorizedBy: "superadmin-1", reason: "Verified duplicate by legal" },
    });

    const auditCalls = mockAuditLogCreate.mock.calls as Array<[{ data: { action: string; metadata: Record<string, unknown> } }]>;
    const overrideCall = auditCalls.find(([args]) => args.data.action === "referral.actor.dedupe_override_created");
    expect(overrideCall).toBeTruthy();
    const meta = overrideCall![0].data.metadata;
    expect(meta.candidateActorId).toBe("override-cand");
    expect(meta.candidateActorUserId).toBe("conflict-owner");
    expect(meta.incomingUserId).toBe("incoming-override");
    expect(meta.authorizedBy).toBe("superadmin-1");
    expect(meta.reason).toBe("Verified duplicate by legal");
  });
});
