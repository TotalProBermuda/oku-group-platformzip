import { describe, expect, it } from "vitest";
import { payerAuthenticationTransientToken } from "@/server/cybersource/payerAuthentication";

function flexJwt(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", kid: "test" })}.${encode(claims)}.signature`;
}

describe("payerAuthenticationTransientToken", () => {
  it("extracts the jti required by CyberSource Payer Authentication", () => {
    expect(payerAuthenticationTransientToken(flexJwt({
      iss: "Flex/00",
      jti: "1C0RNHMQBTATXFCFNGR5EXH3XNOP6359LGLL9J283ATABJ8Z11NL66D834239B51",
    }))).toBe("1C0RNHMQBTATXFCFNGR5EXH3XNOP6359LGLL9J283ATABJ8Z11NL66D834239B51");
  });

  it.each(["not-a-jwt", flexJwt({ iss: "Flex/00" })])("rejects malformed Flex tokens", (token) => {
    expect(() => payerAuthenticationTransientToken(token)).toThrow("secure card token is malformed");
  });
});
