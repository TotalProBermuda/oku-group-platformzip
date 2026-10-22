import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  count: vi.fn(), admins: vi.fn(), schema: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $queryRaw: vi.fn().mockResolvedValue([]),
  commerceSettings: { findUnique: db.schema },
  userRole: { count: db.admins },
  user: { count: db.count },
  launchReadinessSnapshot: { create: vi.fn(), deleteMany: vi.fn() },
} }));
vi.mock("@/server/security/encryption", () => ({ isEncryptionAvailable: () => true }));
vi.mock("@/server/payments/activeGateway", () => ({ getActiveCheckoutGateway: async () => null }));
vi.mock("@/server/invitation/resend", () => ({ getResendClient: async () => null }));
vi.mock("@/server/redis/config", () => ({ hasRedisConfig: () => false }));
import { getLaunchReadiness } from "@/server/launchReadiness/getLaunchReadiness";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEMO_MODE_ENABLED", "false");
  db.admins.mockResolvedValue(1);
  db.schema.mockResolvedValue({});
  db.count.mockImplementation(async ({ where }) => where.status === "ACTIVE" ? 0 : 22);
});
afterEach(() => vi.unstubAllEnvs());

describe("production demo access readiness", () => {
  it("retains inactive history without requiring deletion", async () => {
    const result = await getLaunchReadiness();
    expect(result.gates.find(g => g.name === "users.demo_absent")).toMatchObject({
      status: "pass", details: expect.stringContaining("22 inactive"),
    });
    expect(db.count).toHaveBeenCalledWith({ where: {
      email: { endsWith: "@oku.local", mode: "insensitive" }, status: "ACTIVE",
    } });
  });

  it("blocks active demo accounts and failed account inspection", async () => {
    db.count.mockResolvedValue(1);
    let result = await getLaunchReadiness();
    expect(result.gates.find(g => g.name === "users.demo_absent")?.status).toBe("fail");
    db.count.mockRejectedValue(new Error("database unavailable"));
    result = await getLaunchReadiness();
    expect(result.gates.find(g => g.name === "users.demo_absent")?.status).toBe("fail");
    expect(result.overall).toBe("NO_GO");
  });

  it("still requires the production demo flag off and a real active administrator", async () => {
    vi.stubEnv("DEMO_MODE_ENABLED", "true");
    db.admins.mockResolvedValue(0);
    const result = await getLaunchReadiness();
    expect(result.gates.find(g => g.name === "flags.demo_mode_disabled")?.status).toBe("fail");
    expect(result.gates.find(g => g.name === "superadmin.exists")?.status).toBe("fail");
    expect(db.admins).toHaveBeenCalledWith({ where: {
      roleKey: "SUPERADMIN", user: { status: "ACTIVE", NOT: {
        email: { endsWith: "@oku.local", mode: "insensitive" },
      } },
    } });
  });

  it("schema failures require reviewed recovery rather than schema push", async () => {
    db.schema.mockRejectedValue(new Error("missing column"));
    const result = await getLaunchReadiness();
    const gate = result.gates.find(g => g.name === "database.schema_in_sync");
    expect(gate?.status).toBe("fail");
    expect(gate?.remediation).toContain("rehearse reviewed migrations");
    expect(gate?.remediation).not.toContain("npx prisma db push");
  });
});
