/**
 * Integration scenarios for commissionMintingService.
 *
 * Tests:
 *   - serviceChargePolicy=INCLUDED_UNKNOWN → HELD_FOR_REVIEW, no LedgerEntry
 *   - zero commissionableCents → early return (empty result)
 *   - non-VERIFIED_POS_SALE attribution → early return
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Use vi.hoisted so mock objects are available when vi.mock factories run ────
const { mockFindUnique, mockActorFindUnique, mockFindFirst, mockCreate, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockActorFindUnique: vi.fn(),
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tableSession: { findUnique: mockFindUnique },
    commissionAllocation: { findFirst: mockFindFirst, create: mockCreate, update: mockUpdate },
    referralActor: { findUnique: mockActorFindUnique },
    referralLink: { findUnique: vi.fn().mockResolvedValue(null) },
    restaurantHostProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    commissionRule: { findFirst: vi.fn().mockResolvedValue(null) },
    accountProfileLink: { findFirst: vi.fn().mockResolvedValue(null) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ledgerEventOutbox: { create: vi.fn().mockResolvedValue({ id: "outbox_1" }) },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      const txClient = {
        commissionAllocation: { create: mockCreate },
        ledgerEventOutbox: { create: vi.fn().mockResolvedValue({ id: "outbox_tx" }) },
      };
      return cb(txClient);
    }),
  },
}));

vi.mock("@/server/services/ledger/ledgerOutboxService", () => ({
  enqueueLedgerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/services/invu/commissionRuleResolver", () => ({
  resolveCommissionRule: vi.fn().mockResolvedValue({
    id: "HARDCODED_FALLBACK",
    tier: "STANDARD",
    scopeType: "GLOBAL",
    scopeId: null,
    revenueBasis: "COMMISSIONABLE_CENTS",
    percentageBps: 500,
    percentageCapCents: null,
    perPersonCents: null,
    maxTakeRateBps: null,
    version: 0,
    active: true,
    label: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }),
}));

import { mintCommissionsForTableSession } from "@/server/services/invu/commissionMintingService";

function makeValidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "ts_1",
    venueId: "venue_1",
    grossCents: 10000,
    discountCents: 0,
    taxCents: 1500,
    tipCents: 0,
    refundCents: 0,
    commissionableCents: 8500,
    commissionEligibility: "ELIGIBLE_AUTO",
    matchStatus: "AUTO_MATCHED",
    matchTier: "TIER_1",
    attributionSession: {
      id: "as_1",
      status: "VERIFIED_POS_SALE",
      hostProfileId: null,
      hostUserId: null,
      referralActorId: "actor_1",
      legacyReferrerId: null,
      assignmentId: null,
    },
    reservation: null,
    invuOrders: [{ id: "invu_1", guestCount: 4 }],
    venue: { serviceChargePolicy: "ABSENT" },
    ...overrides,
  };
}

describe("commissionMintingService — service charge policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActorFindUnique.mockResolvedValue({ commissionEligible: true, commissionTier: "STANDARD" });
    mockFindFirst.mockResolvedValue(null); // no existing allocation
    mockCreate.mockResolvedValue({ id: "alloc_created", amountCents: 425 });
  });

  it("serviceChargePolicy=INCLUDED_UNKNOWN → skipped with held_service_charge_unknown reason", async () => {
    mockFindUnique.mockResolvedValue(
      makeValidSession({ venue: { serviceChargePolicy: "INCLUDED_UNKNOWN" } })
    );
    mockCreate.mockResolvedValue({ id: "alloc_held", amountCents: 0 });

    const result = await mintCommissionsForTableSession("ts_1");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("held_service_charge_unknown");
    expect(result.minted).toHaveLength(0);
  });

  it("commissionableCents=0 → early return, nothing minted", async () => {
    mockFindUnique.mockResolvedValue(
      makeValidSession({ commissionableCents: 0 })
    );

    const result = await mintCommissionsForTableSession("ts_1");
    expect(result.minted).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it("non-VERIFIED_POS_SALE attribution → returns empty result", async () => {
    mockFindUnique.mockResolvedValue(
      makeValidSession({
        attributionSession: {
          id: "as_1",
          status: "PENDING",
          hostProfileId: null,
          hostUserId: null,
          referralActorId: "actor_1",
          legacyReferrerId: null,
          assignmentId: null,
        },
      })
    );
    const result = await mintCommissionsForTableSession("ts_1");
    expect(result.minted).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it("attribution-only actor → never mints a commission", async () => {
    mockFindUnique.mockResolvedValue(makeValidSession());
    mockActorFindUnique.mockResolvedValue({ commissionEligible: false, commissionTier: null });

    const result = await mintCommissionsForTableSession("ts_1");
    expect(result.minted).toHaveLength(0);
    expect(result.skipped).toEqual([
      expect.objectContaining({ reason: "referral_actor_not_commission_eligible" }),
    ]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("MANUAL_REVIEW basis → creates HELD_FOR_REVIEW allocation, skipped with held_manual_review_basis reason", async () => {
    mockFindUnique.mockResolvedValue(makeValidSession());
    // Override the rule resolver to return MANUAL_REVIEW basis
    const { resolveCommissionRule } = await import(
      "@/server/services/invu/commissionRuleResolver"
    );
    (resolveCommissionRule as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "rule_manual",
      tier: "STANDARD",
      scopeType: "GLOBAL",
      scopeId: null,
      revenueBasis: "MANUAL_REVIEW",
      percentageBps: 500,
      percentageCapCents: null,
      perPersonCents: null,
      maxTakeRateBps: null,
      version: 1,
      active: true,
      label: "Manual review rule",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    mockCreate.mockResolvedValue({ id: "alloc_held_mr", amountCents: 0 });

    const result = await mintCommissionsForTableSession("ts_1");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("held_manual_review_basis");
    expect(result.minted).toHaveLength(0);
    // A HELD_FOR_REVIEW allocation must be created (create called)
    expect(mockCreate).toHaveBeenCalled();
  });
});
