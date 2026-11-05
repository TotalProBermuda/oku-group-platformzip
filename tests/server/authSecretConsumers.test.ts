import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";

const mocks = vi.hoisted(() => ({ audit: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  auditLog: { create: mocks.audit },
  $queryRaw: vi.fn().mockResolvedValue([]),
  commerceSettings: { findUnique: vi.fn().mockResolvedValue({}) },
  userRole: { count: vi.fn().mockResolvedValue(1) },
  user: { count: vi.fn().mockResolvedValue(0) },
  launchReadinessSnapshot: {
    create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}),
  },
} }));
vi.mock("@/server/security/requestLogger", () => ({ logRequest: vi.fn() }));
vi.mock("@/server/auth/productionAccount", () => ({ authorizeProductionAccount: vi.fn() }));
vi.mock("@/server/auth/passwordless", () => ({ consumePasswordlessToken: vi.fn() }));
vi.mock("@/server/security/encryption", () => ({ isEncryptionAvailable: () => true }));
vi.mock("@/server/payments/activeGateway", () => ({ getActiveCheckoutGateway: async () => null }));
vi.mock("@/server/invitation/resend", () => ({ getResendClient: async () => null }));
vi.mock("@/server/redis/config", () => ({ hasRedisConfig: () => false }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXTAUTH_SECRET", undefined);
  vi.stubEnv("AUTH_SECRET", undefined);
  vi.stubEnv("GOOGLE_CLIENT_ID", "");
  vi.stubEnv("FACEBOOK_CLIENT_ID", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([
  ["primary", "primary-fixture", undefined],
  ["alias", undefined, "alias-fixture"],
  ["both", "primary-fixture", "alias-fixture"],
  ["empty primary", "", "alias-fixture"],
])("%s: Node auth, Edge JWTs, audit HMAC and readiness agree", async (_name, primary, alias) => {
  vi.stubEnv("NEXTAUTH_SECRET", primary);
  vi.stubEnv("AUTH_SECRET", alias);
  const { authOptions } = await import("@/lib/auth");
  const { middleware } = await import("@/middleware");
  const { POST } = await import("@/app/api/internal/audit/admin-denied/route");
  const { getLaunchReadiness } = await import("@/server/launchReadiness/getLaunchReadiness");
  expect(authOptions.secret).toBe(primary || alias);
  const token = await encode({
    secret: authOptions.secret!, salt: "next-auth.session-token",
    token: { sub: "fixture-user", roles: ["SUPERADMIN"] }, maxAge: 60,
  } as Parameters<typeof encode>[0]);
  const allowed = await middleware(new NextRequest("http://localhost/api/v1/admin/fixture", {
    headers: { cookie: `next-auth.session-token=${token}` },
  }));
  expect(allowed.headers.get("x-middleware-next")).toBe("1");

  // Actual WebCrypto Edge signing -> actual Node HMAC verification; only DB is mocked.
  vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => POST(new Request(...args))));
  expect((await middleware(new NextRequest("http://localhost/api/v1/admin/fixture"))).status).toBe(401);
  await vi.waitFor(() => expect(mocks.audit).toHaveBeenCalledOnce());
  const readiness = await getLaunchReadiness();
  const gate = readiness.gates.find(g => g.name === "auth.nextauth_secret");
  expect(gate).toMatchObject({ status: "pass", details: null, severity: "blocking" });
  expect(JSON.stringify(readiness)).not.toContain(primary || alias);
  if (primary && alias) {
    const wrong = await encode({ secret: alias, token: { roles: ["SUPERADMIN"] },
      salt: "next-auth.session-token", maxAge: 60 } as Parameters<typeof encode>[0]);
    expect((await middleware(new NextRequest("http://localhost/api/v1/admin/fixture", {
      headers: { cookie: `next-auth.session-token=${wrong}` },
    }))).status).toBe(401);
    await vi.waitFor(() => expect(mocks.audit).toHaveBeenCalledTimes(2));
  }
});

it("Node and Edge fail closed; readiness blocks without either configured name", async () => {
  await expect(import("@/lib/auth")).rejects.toThrow("NEXTAUTH_SECRET or AUTH_SECRET is required");
  await expect(import("@/middleware")).rejects.toThrow("NEXTAUTH_SECRET or AUTH_SECRET is required");
  const { getLaunchReadiness } = await import("@/server/launchReadiness/getLaunchReadiness");
  const snapshot = await getLaunchReadiness();
  expect(snapshot.gates.find(g => g.name === "auth.nextauth_secret"))
    .toMatchObject({ status: "fail", severity: "blocking" });
  expect(snapshot.overall).toBe("NO_GO");
});
