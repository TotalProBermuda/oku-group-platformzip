import {
  buildCybersourceHttpSignatureHeaders,
  cybersourceHost,
} from "@/server/payments/cybersourceSignature";
import {
  getResolvedCybersourceConfig,
  type ResolvedCybersourceConfig,
} from "@/server/cybersource/client";

export type MicroformContext = {
  captureContext: string;
  clientLibrary: string;
  clientLibraryIntegrity: string | null;
};

/**
 * The browser receives only the short-lived capture context and the
 * Cybersource-hosted client library. Merchant credentials never leave the
 * server. `targetOrigins` is supplied by our deployment configuration, never
 * by a browser request.
 */
export async function createMicroformContext(targetOrigin: string): Promise<MicroformContext> {
  const cfg = await getResolvedCybersourceConfig();
  const path = "/microform/v2/sessions";
  const body = JSON.stringify({
    targetOrigins: [targetOrigin],
    clientVersion: "v2.0",
    allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX", "DISCOVER"],
    transientTokenResponseOptions: { includeCardPrefix: false },
  });
  const host = cybersourceHost(cfg.env);
  const headers = buildCybersourceHttpSignatureHeaders({
    method: "POST",
    path,
    body,
    merchantId: cfg.merchantId,
    keyId: cfg.keyId,
    sharedSecret: cfg.sharedSecret,
    host,
  });
  const response = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.captureContext || !payload?.clientLibrary) {
    throw new Error(`Cybersource hosted fields are unavailable (${response.status}).`);
  }
  return {
    captureContext: String(payload.captureContext),
    clientLibrary: String(payload.clientLibrary),
    clientLibraryIntegrity: payload.clientLibraryIntegrity ? String(payload.clientLibraryIntegrity) : null,
  };
}

export function trustedCheckoutOrigin(requestOrigin: string) {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  const candidate = configured || requestOrigin;
  const origin = new URL(candidate).origin;
  if (process.env.NODE_ENV === "production" && origin.startsWith("http:")) {
    throw new Error("A secure HTTPS checkout origin must be configured.");
  }
  return origin;
}
