import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthOptions, Session } from "next-auth";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), getServerSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/server/auth/productionAccount", () => ({ authorizeProductionAccount: vi.fn() }));
vi.mock("@/server/auth/passwordless", () => ({ consumePasswordlessToken: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXTAUTH_SECRET", "session-revocation-test-secret");
  mocks.getServerSession.mockResolvedValue({ user: { id: "user-1", email: "owner@example.com", roles: ["SUPERADMIN"] } });
  mocks.findUnique.mockResolvedValue({ id: "user-1", email: "owner@example.com", status: "ACTIVE", roles: [{ roleKey: "ATTENDEE" }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("existing session revocation", () => {
  it.each(["SUSPENDED", "LOCKED", "ARCHIVED", "BANNED"])("rejects %s accounts for JWT and server helpers", async (status) => {
    mocks.findUnique.mockResolvedValue({ id: "user-1", email: "owner@example.com", status, roles: [{ roleKey: "SUPERADMIN" }] });
    const { authOptions } = await import("@/lib/auth");
    const jwt = authOptions.callbacks!.jwt!;
    expect(await jwt({ token: { userId: "user-1", roles: ["SUPERADMIN"] } } as Parameters<typeof jwt>[0])).toEqual({});
    const { getOptionalSession, requireSession } = await import("@/server/auth/session");
    expect(await getOptionalSession()).toBeNull();
    await expect(requireSession()).rejects.toMatchObject({ status: 401 });
  });

  it("rejects production demo cookies even if the demo flag is set", async () => {
    vi.stubEnv("DEMO_MODE_ENABLED", "true");
    mocks.findUnique.mockResolvedValue({ id: "user-1", email: "ADMIN@OKU.LOCAL", status: "ACTIVE", roles: [{ roleKey: "SUPERADMIN" }] });
    const { authOptions } = await import("@/lib/auth");
    const jwt = authOptions.callbacks!.jwt!;
    expect(await jwt({ token: { userId: "user-1" } } as Parameters<typeof jwt>[0])).toEqual({});
    expect(await (await import("@/server/auth/session")).getOptionalSession()).toBeNull();
  });

  it("rejects deleted users instead of rebinding the cookie to an email", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const { getOptionalSession } = await import("@/server/auth/session");
    expect(await getOptionalSession()).toBeNull();
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique.mock.calls[0][0].where).toEqual({ id: "user-1" });
  });

  it("refreshes stale elevated roles and preserves passwordless destinations", async () => {
    const { authOptions } = await import("@/lib/auth");
    const jwt = authOptions.callbacks!.jwt!;
    const token = await jwt({ token: { userId: "user-1", roles: ["SUPERADMIN"], passwordlessDestination: "/account" } } as Parameters<typeof jwt>[0]);
    expect(token).toMatchObject({ roles: ["ATTENDEE"], passwordlessDestination: "/account" });
    const current = await (await import("@/server/auth/session")).requireSession();
    expect(current.roles).toEqual(["ATTENDEE"]);
    expect(current.session.user.roles).toEqual(["ATTENDEE"]);
  });

  it("removes the user from a session whose JWT was rejected", async () => {
    const { authOptions } = await import("@/lib/auth");
    const callback = authOptions.callbacks!.session!;
    const session: Session = { expires: "2099-01-01", user: { id: "user-1", roles: ["SUPERADMIN"] } };
    const result = await callback({ session, token: {} } as Parameters<NonNullable<NonNullable<NextAuthOptions["callbacks"]>["session"]>>[0]);
    expect(result.user).toBeUndefined();
  });

  it("allows active demo users only in explicitly enabled development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMO_MODE_ENABLED", "true");
    mocks.findUnique.mockResolvedValue({ id: "user-1", email: "admin@oku.local", status: "ACTIVE", roles: [{ roleKey: "SUPERADMIN" }] });
    expect((await (await import("@/server/auth/session")).requireSession()).userId).toBe("user-1");
  });
});
