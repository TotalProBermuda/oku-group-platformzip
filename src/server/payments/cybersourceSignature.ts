/**
 * Cybersource HTTP Signature helper.
 *
 * Implements the headers Cybersource REST requires:
 *   v-c-merchant-id, host, date, (request-target), digest (POST/PUT only),
 *   signature: keyid="…", algorithm="HmacSHA256", headers="…", signature="…"
 *
 * The shared secret Cybersource issues is base64-encoded; we decode it
 * before HMAC. The output signature is base64.
 *
 * Reference:
 *   https://developer.cybersource.com/api-documentation/developer-guides/rest-api-authentication.html
 */
import crypto from "crypto";

export type CybersourceSignatureInput = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: string;
  merchantId: string;
  keyId: string;
  sharedSecret: string;
  host: string;
};

export function cybersourceHost(env: "test" | "production"): string {
  return env === "production" ? "api.cybersource.com" : "apitest.cybersource.com";
}

function rfc1123Date(d = new Date()): string {
  return d.toUTCString();
}

function decodeSharedSecret(secret: string): Buffer {
  // Cybersource shared secrets are base64-encoded. If the input doesn't decode
  // cleanly to base64, fall back to raw utf8 bytes.
  try {
    const buf = Buffer.from(secret, "base64");
    if (buf.length > 0 && buf.toString("base64").replace(/=+$/, "") === secret.replace(/=+$/, "")) {
      return buf;
    }
  } catch {
    // ignore
  }
  return Buffer.from(secret, "utf8");
}

export function buildCybersourceHttpSignatureHeaders(
  input: CybersourceSignatureInput
): Record<string, string> {
  const { method, path, body, merchantId, keyId, sharedSecret, host } = input;
  const upperMethod = method.toUpperCase();
  const date = rfc1123Date();
  const includeDigest = upperMethod === "POST" || upperMethod === "PUT";

  const headers: Record<string, string> = {
    host,
    date,
    "v-c-merchant-id": merchantId,
  };

  let digest: string | null = null;
  if (includeDigest) {
    const payload = body ?? "";
    const sha = crypto.createHash("sha256").update(payload, "utf8").digest("base64");
    digest = `SHA-256=${sha}`;
    headers.digest = digest;
  }

  const signedHeaderNames = includeDigest
    ? ["host", "date", "(request-target)", "digest", "v-c-merchant-id"]
    : ["host", "date", "(request-target)", "v-c-merchant-id"];

  const requestTarget = `${upperMethod.toLowerCase()} ${path}`;

  const signingStringLines = signedHeaderNames.map((h) => {
    if (h === "(request-target)") return `(request-target): ${requestTarget}`;
    return `${h}: ${headers[h]}`;
  });
  const signingString = signingStringLines.join("\n");

  const key = decodeSharedSecret(sharedSecret);
  const signature = crypto
    .createHmac("sha256", key)
    .update(signingString, "utf8")
    .digest("base64");

  const headersList = signedHeaderNames.join(" ");
  headers.signature = `keyid="${keyId}", algorithm="HmacSHA256", headers="${headersList}", signature="${signature}"`;

  return headers;
}
