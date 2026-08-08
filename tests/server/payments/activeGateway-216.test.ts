/**
 * #216 regression tests
 *
 * Covers the six acceptance gates:
 *  1. passed + recent            → no blocker
 *  2. null status / null date    → "test connection has not passed"
 *  3. failed status              → "test connection has not passed"
 *  4. passed but stale           → recency blocker
 *  5. credential field changed   → lastTest fields reset in update payload
 *  6. live probe ok + DB fail    → route returns failure, not gatewayOk=true
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports so vitest can hoist them.
// ---------------------------------------------------------------------------

vi.mock("@/server/security/encryption", () => ({
  isEncryptionAvailable: () => true,
  encryptSecret: (v: string) => `enc:${v}`,
  maskSecret: (v: string) => ({ last4: v.slice(-4) }),
  decryptSecret: (v: string) => v.replace(/^enc:/, ""),
}));

vi.mock("@/server/auth/adminGuard", () => ({
  requireAdminRoles: vi.fn().mockResolvedValue({ userId: "admin-test" }),
}));

const mockTestConnection = vi.fn();
vi.mock("@/server/cybersource/client", () => ({
  testCybersourceConnection: (...a: unknown[]) => mockTestConnection(...a),
}));

vi.mock("@/lib/prisma", () => {
  const upsert = vi.fn();
  const auditCreate = vi.fn().mockResolvedValue({});
  return {
    prisma: {
      cybersourceGatewayCredential: { upsert },
      auditLog: { create: auditCreate },
    },
    // expose fns for per-test control
    __upsert: upsert,
    __auditCreate: auditCreate,
  };
});

// ---------------------------------------------------------------------------
// Subject imports (after mocks)
// ---------------------------------------------------------------------------
import { evaluateTestRecency } from "@/server/payments/activeGateway";
import { buildCybersourceUpdate } from "@/server/payments/cybersourceCredentialService";
import { POST } from "@/app/api/v1/admin/payments/cybersource/test/route";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockUpsert = vi.mocked(
  (prisma as any).cybersourceGatewayCredential.upsert as ReturnType<typeof vi.fn>
);

function makeRequest() {
  return new Request(
    "http://localhost/api/v1/admin/payments/cybersource/test",
    { method: "POST" }
  );
}

function makePrev(overrides: Record<string, unknown> = {}) {
  return {
    id: "cred-1",
    provider: "CYBERSOURCE",
    enabled: true,
    environment: "test",
    merchantIdEncrypted: "enc:mid",
    keyIdEncrypted: "enc:kid",
    sharedSecretEncrypted: "enc:sec",
    organizationIdEncrypted: null,
    portfolioIdEncrypted: null,
    merchantIdLast4: "mid1",
    keyIdLast4: "kid1",
    sharedSecretLast4: "sec1",
    organizationIdLast4: null,
    portfolioIdLast4: null,
    checkoutTitle: "Credit Card",
    checkoutDescription: "Pay securely.",
    acceptedCardLogos: ["visa"],
    cardSecurityCodeEnabled: true,
    detailedDeclineMessagesEnabled: true,
    debugMode: "OFF",
    lastTestStatus: "passed",
    lastTestMessage: "OK",
    lastTestedAt: new Date(Date.now() - 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedById: null,
    ...overrides,
  } as any;
}

// A minimal credential row that toSafeCybersourceView can process without error.
function makeDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cred-1",
    provider: "CYBERSOURCE",
    enabled: true,
    environment: "test",
    merchantIdEncrypted: "enc:mid",
    keyIdEncrypted: "enc:kid",
    sharedSecretEncrypted: "enc:sec",
    organizationIdEncrypted: null,
    portfolioIdEncrypted: null,
    merchantIdLast4: "mid1",
    keyIdLast4: "kid1",
    sharedSecretLast4: "sec1",
    organizationIdLast4: null,
    portfolioIdLast4: null,
    checkoutTitle: "Credit Card",
    checkoutDescription: "Pay securely.",
    acceptedCardLogos: ["visa"],
    cardSecurityCodeEnabled: true,
    detailedDeclineMessagesEnabled: true,
    debugMode: "OFF",
    lastTestStatus: "passed",
    lastTestMessage: "Credentials accepted",
    lastTestedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedById: null,
    ...overrides,
  };
}

const LABEL = "Cybersource";

// ---------------------------------------------------------------------------
// 1–4: evaluateTestRecency
// ---------------------------------------------------------------------------
describe("evaluateTestRecency", () => {
  it("1. passed + recent → no blocker", () => {
    const result = evaluateTestRecency({
      passed: true,
      testedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 h ago
      environment: "test",
      providerLabel: LABEL,
    });
    expect(result).toBeNull();
  });

  it("2. null status + null date → has-not-passed blocker", () => {
    const result = evaluateTestRecency({
      passed: false,
      testedAt: null,
      environment: "test",
      providerLabel: LABEL,
    });
    expect(result).toContain("test connection has not passed");
  });

  it("3. failed status → has-not-passed blocker", () => {
    const result = evaluateTestRecency({
      passed: false,
      testedAt: new Date(),
      environment: "test",
      providerLabel: LABEL,
    });
    expect(result).toContain("test connection has not passed");
  });

  it("4a. passed but stale (sandbox >7 d) → recency blocker", () => {
    const result = evaluateTestRecency({
      passed: true,
      testedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
      environment: "test",
      providerLabel: LABEL,
    });
    expect(result).toContain("older than 7 days");
  });

  it("4b. passed but stale (production >24 h) → recency blocker", () => {
    const result = evaluateTestRecency({
      passed: true,
      testedAt: new Date(Date.now() - 25 * 3600 * 1000),
      environment: "production",
      providerLabel: LABEL,
    });
    expect(result).toContain("older than 24 hours");
  });
});

// ---------------------------------------------------------------------------
// 5: buildCybersourceUpdate credential reset
// ---------------------------------------------------------------------------
describe("buildCybersourceUpdate — credential reset", () => {
  it("5a. merchantId change resets lastTest fields", () => {
    const { data } = buildCybersourceUpdate(
      { merchantId: "new-merchant-id" },
      makePrev()
    );
    expect(data.lastTestStatus).toBeNull();
    expect(data.lastTestedAt).toBeNull();
    expect(data.lastTestMessage).toBeNull();
  });

  it("5b. keyId change resets lastTest fields", () => {
    const { data } = buildCybersourceUpdate(
      { keyId: "new-key-id-value" },
      makePrev()
    );
    expect(data.lastTestStatus).toBeNull();
    expect(data.lastTestedAt).toBeNull();
    expect(data.lastTestMessage).toBeNull();
  });

  it("5c. sharedSecret change resets lastTest fields", () => {
    const { data } = buildCybersourceUpdate(
      { sharedSecret: "new-shared-secret" },
      makePrev()
    );
    expect(data.lastTestStatus).toBeNull();
    expect(data.lastTestedAt).toBeNull();
    expect(data.lastTestMessage).toBeNull();
  });

  it("5d. non-secret change does NOT reset lastTest fields", () => {
    const { data } = buildCybersourceUpdate(
      { checkoutTitle: "Card Payment", debugMode: "ERRORS_ONLY" },
      makePrev()
    );
    expect(data.lastTestStatus).toBeUndefined();
    expect(data.lastTestedAt).toBeUndefined();
    expect(data.lastTestMessage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6: route — live probe ok + DB persistence fail → API failure, not ok=true
// ---------------------------------------------------------------------------
describe("POST /cybersource/test — persistence failure", () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    mockTestConnection.mockResolvedValue({
      ok: true,
      env: "test",
      status: 200,
      message: "Credentials accepted",
    });
  });

  it("6. returns 500 persistence_failed when upsert throws; ok is false", async () => {
    mockUpsert.mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("persistence_failed");
    expect(body.data.persistenceFailed).toBe(true);
    // Live probe succeeded — that fact is available for informational display —
    // but the outer ok=false prevents the UI from treating it as settled truth.
    expect(body.data.gatewayOk).toBe(true);
  });

  it("6b. returns ok=true with matching gateway.lastTest.status when upsert succeeds", async () => {
    mockUpsert.mockResolvedValue(makeDbRow());

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.gatewayOk).toBe(true);
    expect(body.data.gateway.lastTest?.status).toBe("passed");
  });
});
