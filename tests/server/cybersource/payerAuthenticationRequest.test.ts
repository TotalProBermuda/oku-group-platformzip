import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/cybersource/client", () => ({ getResolvedCybersourceConfig: async () => ({ env: "test" }) }));
vi.mock("@/server/payments/cybersourceSignature", () => ({
  cybersourceHost: () => "apitest.cybersource.com",
  buildCybersourceHttpSignatureHeaders: () => ({}),
}));
import { checkPayerAuthentication } from "@/server/cybersource/payerAuthentication";

const input = {
  transientTokenJwt: `header.${Buffer.from(JSON.stringify({ jti: "mock-flex-token-1234567890" })).toString("base64url")}.signature`,
  referenceId: "mock-reference", amount: "2.27", currency: "USD",
  billing: { firstName: "Test", lastName: "Buyer", address1: "Test address", locality: "Test city", administrativeArea: "Test", postalCode: "12345", country: "US", email: "test@example.com" },
  browser: { accept: "text/html", language: "en-US", colorDepth: "24", javaEnabled: "N" as const, javascriptEnabled: "Y" as const, screenHeight: "900", screenWidth: "1440", timeDifference: "0", userAgent: "Test", ipAddress: "127.0.0.1" },
  returnUrl: "https://example.com/return", customerId: "local-user-not-a-tms-token",
  expirationMonth: "11", expirationYear: "2028",
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("Flex enrollment request", () => {
  it("does not send a local account ID as a TMS payment credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 201, text: async () => JSON.stringify({ status: "AUTHENTICATION_SUCCESSFUL", consumerAuthenticationInformation: { eciRaw: "02" } }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkPayerAuthentication(input)).resolves.toMatchObject({ kind: "authenticated" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.paymentInformation.customer).toBeUndefined();
    expect(body.buyerInformation.merchantCustomerId).toBe(input.customerId);
    expect(body.tokenInformation.transientToken).toBe("mock-flex-token-1234567890");
  });
  it("logs only safe diagnostic codes on a rejected request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 400, text: async () => JSON.stringify({ status: "INVALID_REQUEST", errorInformation: { reason: "INVALID_DATA", message: "private-payload" }, token: "private-token" }) }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(checkPayerAuthentication(input)).rejects.toThrow();
    const logged = warn.mock.calls[0][0];
    expect(JSON.parse(logged)).toMatchObject({ type: "checkout_authentication_failed", stage: "enrollment", httpStatus: 400, reason: "INVALID_DATA" });
    expect(logged).not.toContain("private");
    expect(logged).not.toContain(input.customerId);
    expect(logged).not.toContain(input.billing.email);
  });
});
