import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockValidate, mockInvite } = vi.hoisted(() => {
  const state = { status: "PENDING" as string };
  const invite = {
    id: "invite-1",
    token: "secret-token",
    status: "PENDING",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    invitedEmail: "referrer@example.com",
    invitedName: "Invited Referrer",
    commissionRateBps: 500,
    seriesId: null,
    series: null,
  };
  const user = { id: "user-1", email: "referrer@example.com", name: "Invited Referrer" };
  const profile = { id: "profile-1" };
  const beneficiary = { bankReadinessStatus: "READY_FOR_REVIEW", banescoAccountLast4: "1234" };
  const tx = {
    influencerInvite: {
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; token: string; status: string; expiresAt: { gt: Date } }; data: { status: string } }) => {
        if (
          where.id !== invite.id ||
          where.token !== invite.token ||
          state.status !== where.status ||
          invite.expiresAt <= where.expiresAt.gt
        ) return { count: 0 };
        state.status = data.status;
        return { count: 1 };
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    },
    userRole: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    influencerProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(profile),
      create: vi.fn().mockResolvedValue(profile),
      update: vi.fn().mockResolvedValue(profile),
    },
    beneficiaryProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(beneficiary),
      update: vi.fn().mockResolvedValue(beneficiary),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    series: { update: vi.fn().mockResolvedValue({}) },
  };
  return {
    mockPrisma: {
      state,
      tx,
      influencerInvite: { findUnique: vi.fn().mockImplementation(async () => ({ ...invite })) },
      beneficiaryProfile: {
        findUnique: vi.fn().mockResolvedValue(beneficiary),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
    mockValidate: vi.fn(() => ({
      ok: true,
      data: {
        name: "Invited Referrer",
        bankName: "Banesco",
        accountHolderName: "Invited Referrer",
        accountType: "CHECKING",
        currency: "USD",
        swiftBic: null,
        accountNumber: "123456789012",
      },
    })),
    mockInvite: invite,
  };
});

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/server/security/encryption", () => ({
  encryptSecret: () => "encrypted-account",
  isEncryptionAvailable: () => true,
  maskSecret: () => ({ last4: "1234" }),
}));
vi.mock("@/server/beneficiaries/invitePayoutInput", () => ({
  validateInvitePayoutDetails: mockValidate,
}));

import { POST } from "@/app/api/v1/influencer/accept-invite/route";

function request() {
  return {
    url: "https://oku.test/api/v1/influencer/accept-invite?token=secret-token",
    json: async () => ({ payoutAuthorization: true }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.state.status = "PENDING";
  mockPrisma.tx.user.findUnique.mockResolvedValue(null);
  mockPrisma.tx.influencerProfile.findUnique.mockResolvedValue(null);
  mockPrisma.tx.beneficiaryProfile.findUnique.mockResolvedValue(null);
  mockPrisma.influencerInvite.findUnique.mockImplementation(async () => ({
    ...mockInvite,
    status: "PENDING",
  }));
  mockPrisma.beneficiaryProfile.findUnique.mockResolvedValue({
    bankReadinessStatus: "READY_FOR_REVIEW",
    banescoAccountLast4: "1234",
  });
});

describe("POST /api/v1/influencer/accept-invite", () => {
  it("preserves successful invite acceptance and creates the account and payout profile", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      userId: "user-1",
      payoutSetup: { status: "READY_FOR_REVIEW", accountLast4: "1234", payoutEligible: false },
    });
    expect(mockPrisma.tx.influencerInvite.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "invite-1",
        token: "secret-token",
        status: "PENDING",
        expiresAt: { gt: expect.any(Date) },
      }),
      data: { status: "ACCEPTED" },
    });
    expect(mockPrisma.tx.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tx.influencerProfile.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tx.beneficiaryProfile.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("allows only one of two concurrent submissions to claim and process the invite", async () => {
    const [first, second] = await Promise.all([POST(request()), POST(request())]);
    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([200, 410]);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mockPrisma.tx.influencerInvite.updateMany).toHaveBeenCalledTimes(2);
    // The losing request exits at the atomic claim, before any related writes.
    expect(mockPrisma.tx.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tx.influencerProfile.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tx.beneficiaryProfile.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.state.status).toBe("ACCEPTED");
  });
});
