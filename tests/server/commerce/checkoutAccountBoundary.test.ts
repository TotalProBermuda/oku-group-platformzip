import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(), upsert: vi.fn() } } }));
vi.mock("@/server/auth/session", () => ({ getOptionalSession: vi.fn() }));
vi.mock("@/server/commerce/capacity", () => ({ reserveCatalogCapacityOrThrow: vi.fn() }));
vi.mock("@/server/events/eventReferrerService", () => ({ getEventReferrerByCode: vi.fn() }));
vi.mock("@/server/referrals/referralActorService", () => ({ resolveActorFromCode: vi.fn() }));
vi.mock("@/server/commerce/guestCheckout", () => ({ createGuestCheckoutCredential: vi.fn() }));
vi.mock("@/server/commerce/checkoutHold", () => ({ createCheckoutHold: vi.fn(), expireCheckoutHoldsForSession: vi.fn() }));
vi.mock("@/server/rateLimit", () => ({ gatePublicPostAsync: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/server/commerce/ticketPricing", () => ({ calculateTicketUnitPrice: vi.fn() }));
vi.mock("@/server/commerce/checkoutFinance", () => ({ priceCheckoutCharges: vi.fn() }));
vi.mock("@/server/commerce/catalogPolicy", () => ({
  assertCheckoutCatalogPolicy: vi.fn(),
  CatalogPolicyError: class extends Error {},
}));
import { POST } from "@/app/api/v1/checkout/intent/route";
import { prisma } from "@/lib/prisma";
import { getOptionalSession } from "@/server/auth/session";
import { expireCheckoutHoldsForSession } from "@/server/commerce/checkoutHold";
import { assertCheckoutCatalogPolicy } from "@/server/commerce/catalogPolicy";

const request = (email = "other@example.invalid") => new Request("http://localhost/api/v1/checkout/intent", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ sessionId: "test_session", items: [{ ticketTypeId: "test_ticket", qty: 1 }], guest: { name: "Test", email } }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOptionalSession).mockResolvedValue({ userId: "test_buyer", roles: [], session: { user: { id: "test_buyer" }, expires: "2099-01-01" } });
});
it.each([{ email: "buyer@example.invalid" }, null, { email: null }])("rejects mismatched/missing account before order side effects", async account => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue(account as never);
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "CHECKOUT_ACCOUNT_MISMATCH" });
  expect(prisma.user.upsert).not.toHaveBeenCalled();
  expect(expireCheckoutHoldsForSession).not.toHaveBeenCalled();
  expect(assertCheckoutCatalogPolicy).not.toHaveBeenCalled();
});
it("allows matching normalized account email to reach existing catalog checks", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "buyer@example.invalid" } as never);
  vi.mocked(assertCheckoutCatalogPolicy).mockRejectedValue(new Error("isolated catalog stop"));
  await expect(POST(request("BUYER@example.invalid"))).rejects.toThrow("isolated catalog stop");
  expect(assertCheckoutCatalogPolicy).toHaveBeenCalledWith(expect.objectContaining({ userId: "test_buyer" }));
  expect(prisma.user.upsert).not.toHaveBeenCalled();
});
it("does not use an unverified guest account match as eligibility identity", async () => {
  vi.mocked(getOptionalSession).mockResolvedValue(null);
  vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "existing_member" } as never);
  vi.mocked(assertCheckoutCatalogPolicy).mockRejectedValue(new Error("isolated catalog stop"));
  await expect(POST(request())).rejects.toThrow("isolated catalog stop");
  expect(assertCheckoutCatalogPolicy).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
});
