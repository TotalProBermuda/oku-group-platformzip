import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    role: { findUnique: vi.fn() },
    reservation: { findFirst: vi.fn() },
    ticket: { findFirst: vi.fn() },
    passwordlessToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(),
    },
    send: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/invitation/resend", () => ({
  getResendClient: vi.fn(async () => ({
    client: { emails: { send: mocks.send } },
    fromEmail: "events@example.test",
  })),
}));

import {
  consumePasswordlessToken,
  hashPasswordlessToken,
  issuePasswordlessToken,
  normalizePasswordlessEmail,
  sanitizePasswordlessCallback,
} from "@/server/auth/passwordless";

function activeUser(role = "ATTENDEE") {
  return {
    id: "user-1",
    email: "guest@example.com",
    name: "Guest",
    status: "ACTIVE",
    roles: [{ role: { key: role } }],
  };
}

function storedToken(overrides: Record<string, unknown> = {}) {
  return {
    id: "token-1",
    tokenHash: hashPasswordlessToken("a".repeat(43)),
    email: "guest@example.com",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    revokedAt: null,
    user: activeUser(),
    ...overrides,
  };
}

describe("passwordless authentication security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "https://www.okuhospitalitygroup.com";
    mocks.prisma.$transaction.mockImplementation(async (work: any) => work(mocks.tx));
    mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
    mocks.tx.user.update.mockResolvedValue({});
    mocks.tx.passwordlessToken.updateMany.mockResolvedValue({ count: 1 });
  });

  it("normalizes email and rejects open redirect callback values", () => {
    expect(normalizePasswordlessEmail("  Guest@Example.COM ")).toBe("guest@example.com");
    expect(sanitizePasswordlessCallback("/account?tab=bookings")).toBe("/account?tab=bookings");
    expect(sanitizePasswordlessCallback("https://evil.example/account")).toBeNull();
    expect(sanitizePasswordlessCallback("//evil.example/account")).toBeNull();
    expect(sanitizePasswordlessCallback("/\\evil.example")).toBeNull();
    expect(sanitizePasswordlessCallback("/\r\nLocation: https://evil.example")).toBeNull();
  });

  it("stores only a SHA-256 token hash and creates only ATTENDEE for a known customer", async () => {
    mocks.tx.user.findFirst.mockResolvedValue(null);
    mocks.tx.reservation.findFirst.mockResolvedValue({ contactName: "Known Guest" });
    mocks.tx.ticket.findFirst.mockResolvedValue(null);
    mocks.tx.role.findUnique.mockResolvedValue({ key: "ATTENDEE" });
    mocks.tx.user.create.mockResolvedValue(activeUser("ATTENDEE"));
    mocks.tx.passwordlessToken.create.mockResolvedValue({});

    await expect(issuePasswordlessToken({
      email: " Guest@Example.com ",
      callbackUrl: "/account",
    })).resolves.toEqual({ issued: true });

    const createData = mocks.tx.passwordlessToken.create.mock.calls[0][0].data;
    expect(createData.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(createData)).not.toContain("a".repeat(43));
    expect(mocks.tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "ACTIVE",
        roles: { create: { roleKey: "ATTENDEE" } },
      }),
    }));
  });

  it("does not create an account or token for an unknown address", async () => {
    mocks.tx.user.findFirst.mockResolvedValue(null);
    mocks.tx.reservation.findFirst.mockResolvedValue(null);
    mocks.tx.ticket.findFirst.mockResolvedValue(null);

    await expect(issuePasswordlessToken({ email: "unknown@example.com" }))
      .resolves.toEqual({ issued: false });
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.tx.passwordlessToken.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("requires the exact normalized invited email", async () => {
    mocks.tx.passwordlessToken.findUnique.mockResolvedValue(storedToken());
    await expect(consumePasswordlessToken({
      rawToken: "a".repeat(43),
      claimedEmail: "attacker@example.com",
    })).resolves.toBeNull();
    expect(mocks.tx.passwordlessToken.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1) }],
    ["consumed", { consumedAt: new Date() }],
    ["revoked", { revokedAt: new Date() }],
    ["suspended", { user: { ...activeUser(), status: "SUSPENDED" } }],
  ])("rejects %s tokens", async (_label, overrides) => {
    mocks.tx.passwordlessToken.findUnique.mockResolvedValue(storedToken(overrides));
    await expect(consumePasswordlessToken({
      rawToken: "a".repeat(43),
      claimedEmail: "guest@example.com",
    })).resolves.toBeNull();
  });

  it("atomically prevents token replay", async () => {
    mocks.tx.passwordlessToken.findUnique.mockResolvedValue(storedToken());
    mocks.tx.passwordlessToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(consumePasswordlessToken({
      rawToken: "a".repeat(43),
      claimedEmail: "guest@example.com",
    })).resolves.toBeNull();
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it("returns only persisted roles after a successful single-use exchange", async () => {
    mocks.tx.passwordlessToken.findUnique.mockResolvedValue(storedToken({
      user: activeUser("REFERRER"),
    }));
    await expect(consumePasswordlessToken({
      rawToken: "a".repeat(43),
      claimedEmail: " GUEST@example.com ",
    })).resolves.toMatchObject({
      id: "user-1",
      email: "guest@example.com",
      roles: ["REFERRER"],
      destination: "/referrer/dashboard",
    });
  });
});