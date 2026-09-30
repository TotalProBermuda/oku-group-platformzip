import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/cybersource/client", () => ({ getResolvedCybersourceConfig: async () => ({ env: "test" }) }));
vi.mock("@/server/payments/cybersourceSignature", () => ({
  cybersourceHost: () => "apitest.cybersource.com",
  buildCybersourceHttpSignatureHeaders: () => ({}),
}));
import { checkPayerAuthentication, validatePayerAuthentication } from "@/server/cybersource/payerAuthentication";
import { cybersourceCharge } from "@/server/cybersource/transactions";

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
  it.each([false, true])("preserves Mastercard authentication fields through authorization (challenge=%s)", async (challenge) => {
    const info = { indicator: "spa", ecommerceIndicator: "spa", ucafCollectionIndicator: "2", ucafAuthenticationData: "mock-mastercard-aav", specificationVersion: "2.2.0", directoryServerTransactionId: "mock-directory-id" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 201, text: async () => JSON.stringify({ status: "AUTHENTICATION_SUCCESSFUL", consumerAuthenticationInformation: info }) })
      .mockResolvedValueOnce({ status: 201, text: async () => JSON.stringify({ status: "AUTHORIZED" }) });
    vi.stubGlobal("fetch", fetchMock);
    const auth = challenge ? await validatePayerAuthentication({ authenticationTransactionId: "mock-auth", cardType: "002" }) : (await checkPayerAuthentication(input) as { authentication: any }).authentication;
    await cybersourceCharge({ amount: "2.27", currency: "USD", invoiceNumber: "invoice", transactionId: "order", transientToken: input.transientTokenJwt, payerAuthentication: auth });
    const payment = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payment.processingInformation.commerceIndicator).toBe("spa");
    expect(payment.consumerAuthenticationInformation).toMatchObject({ ucafCollectionIndicator: "2", ucafAuthenticationData: "mock-mastercard-aav", paSpecificationVersion: "2.2.0", directoryServerTransactionId: "mock-directory-id" });
    expect(payment.consumerAuthenticationInformation.specificationVersion).toBeUndefined();
  });
  it("retains Visa CAVV without inventing Mastercard authentication data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 201, text: async () => JSON.stringify({ status: "AUTHENTICATION_SUCCESSFUL", consumerAuthenticationInformation: { indicator: "vbv", cavv: "mock-visa-cavv", eciRaw: "05" } }) })
      .mockResolvedValueOnce({ status: 201, text: async () => JSON.stringify({ status: "AUTHORIZED" }) });
    vi.stubGlobal("fetch", fetchMock);
    const auth = await validatePayerAuthentication({ authenticationTransactionId: "mock-auth" });
    await cybersourceCharge({ amount: "2.27", currency: "USD", invoiceNumber: "invoice", transactionId: "order", transientToken: input.transientTokenJwt, payerAuthentication: auth });
    const payment = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payment.processingInformation.commerceIndicator).toBe("vbv");
    expect(payment.consumerAuthenticationInformation.cavv).toBe("mock-visa-cavv");
    expect(payment.consumerAuthenticationInformation.ucafCollectionIndicator).toBeUndefined();
  });
  it("posts the accessToken, not the unrelated token field, to step-up", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 201, text: async () => JSON.stringify({ status: "PENDING_AUTHENTICATION", consumerAuthenticationInformation: {
      authenticationTransactionId: "auth-123", stepUpUrl: "https://centinelapistag.cardinalcommerce.com/V2/Cruise/StepUp", accessToken: "correct-access-jwt", token: "wrong-token",
    } }) }));
    await expect(checkPayerAuthentication(input)).resolves.toMatchObject({ kind: "challenge", challenge: { token: "correct-access-jwt" } });
  });
  it("rejects a challenge with only the old token field", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 201, text: async () => JSON.stringify({ status: "PENDING_AUTHENTICATION", consumerAuthenticationInformation: {
      authenticationTransactionId: "auth-123", stepUpUrl: "https://centinelapistag.cardinalcommerce.com/V2/Cruise/StepUp", token: "wrong-token",
    } }) }));
    await expect(checkPayerAuthentication(input)).rejects.toThrow();
  });
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
