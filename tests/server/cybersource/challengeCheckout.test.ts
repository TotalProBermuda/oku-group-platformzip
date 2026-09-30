import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const m = vi.hoisted(() => ({ order: vi.fn(), create: vi.fn(), update: vi.fn(), audit: vi.fn(), enroll: vi.fn(), validate: vi.fn(), bind: vi.fn(), require: vi.fn(), charge: vi.fn(), hold: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { order: { findUnique: m.order }, payment: { create: m.create, update: m.update }, auditLog: { create: m.audit } } }));
vi.mock("@/server/auth/session", () => ({ getOptionalSession: async () => ({ userId: "user" }) }));
vi.mock("@/server/commerce/commissions", () => ({ createCommissionIfAttributed: vi.fn() }));
vi.mock("@/server/commerce/capacity", () => ({ releaseCatalogCapacity: vi.fn() }));
vi.mock("@/server/queue/queue", () => ({ safeEnqueue: vi.fn() }));
vi.mock("@/server/events/eventReferrerService", () => ({ writeTicketAttributionSession: vi.fn() }));
vi.mock("@/server/payments/activeGateway", () => ({ assertActiveGatewayReady: async () => null }));
vi.mock("@/server/payments/providers", () => ({ getActiveCheckoutAdapter: async () => ({ provider: "CYBERSOURCE", adapter: { charge: m.charge } }) }));
vi.mock("@/server/commerce/guestCheckout", () => ({ hasValidGuestCheckoutCredential: vi.fn() }));
vi.mock("@/server/commerce/checkoutHold", () => ({ hasActiveCheckoutHold: m.hold }));
vi.mock("@/server/cybersource/payerAuthentication", () => ({ checkPayerAuthentication: m.enroll, validatePayerAuthentication: m.validate }));
vi.mock("@/server/cybersource/challengeBinding", () => ({ bindChallenge: m.bind, requireBoundChallenge: m.require }));
import { POST } from "@/app/api/v1/checkout/confirm/route";
const challenge = { authenticationTransactionId: "auth", stepUpUrl: "https://example.com", token: "jwt" };
function request(resume = false) {
  return new Request("https://example.com", { method: "POST", body: JSON.stringify({ intentId: "order", cybersourceTransientToken: "card-token", billing: { address1: "123 Main", locality: "City", administrativeArea: "State", postalCode: "12345", country: "US" }, payerAuthentication: resume ? { authenticationTransactionId: "auth" } : { referenceId: "ref", expirationMonth: "11", expirationYear: "2028", browser: { accept: "text/html", language: "en", colorDepth: "24", javaEnabled: "N", javascriptEnabled: "Y", screenHeight: "900", screenWidth: "400", timeDifference: "0", userAgent: "test" } } }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.order.mockResolvedValue({ id: "order", userId: "user", status: "PENDING", totalCents: 227, currency: "USD", lineItems: [], user: { name: "Test Buyer" }, payment: null });
  m.hold.mockResolvedValue(true); m.audit.mockResolvedValue({});
  m.enroll.mockResolvedValue({ kind: "challenge", challenge });
  m.require.mockResolvedValue({ authenticationTransactionId: "auth", cardType: "002" });
  m.validate.mockResolvedValue({ eciRaw: "02" });
  m.charge.mockResolvedValue({ ok: false, failureCode: "NETWORK" });
});
describe("challenge checkout continuation", () => {
  it("returns a challenge without consuming the charge claim", async () => {
    expect((await POST(request())).status).toBe(202);
    expect(m.bind).toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled(); expect(m.charge).not.toHaveBeenCalled();
  });
  it("validates a bound challenge, claims once, then charges", async () => {
    await POST(request(true));
    expect(m.validate).toHaveBeenCalledWith({ authenticationTransactionId: "auth", cardType: "002" });
    expect(m.create).toHaveBeenCalledTimes(1); expect(m.charge).toHaveBeenCalledTimes(1);
    expect(m.validate.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[0]);
    expect(m.create.mock.invocationCallOrder[0]).toBeLessThan(m.charge.mock.invocationCallOrder[0]);
  });
  it("never charges an unbound challenge", async () => {
    m.require.mockRejectedValue(new Error("wrong order"));
    expect((await POST(request(true))).status).toBe(402);
    expect(m.validate).not.toHaveBeenCalled(); expect(m.charge).not.toHaveBeenCalled();
  });
  it("never charges when another request won the unique claim", async () => {
    m.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "5" }));
    expect((await POST(request(true))).status).toBe(409); expect(m.charge).not.toHaveBeenCalled();
  });
  it("never charges after the hold expires during verification", async () => {
    m.hold.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await POST(request(true))).status).toBe(410); expect(m.create).not.toHaveBeenCalled(); expect(m.charge).not.toHaveBeenCalled();
  });
});
