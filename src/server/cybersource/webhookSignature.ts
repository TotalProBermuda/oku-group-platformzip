import crypto from "crypto";

/**
 * Validates CyberSource's timestamped v-c-signature webhook header.
 *
 * CyberSource signs `${timestamp}.${raw request body}` using the digital
 * signature key issued for the subscription. The `sig` value is base64, not a
 * hexadecimal digest. Keeping this isolated makes the wire-format easy to
 * exercise without a live payment notification.
 */
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

function decodeDigitalSignatureKey(secret: string): Buffer {
  const compact = secret.trim();
  try {
    const decoded = Buffer.from(compact, "base64");
    if (
      decoded.length > 0 &&
      decoded.toString("base64").replace(/=+$/, "") === compact.replace(/=+$/, "")
    ) {
      return decoded;
    }
  } catch {
    // Fall through for a non-base64 key.
  }
  return Buffer.from(compact, "utf8");
}

function parseSignature(header: string): { timestamp: number; signature: string } | null {
  const fields = new Map(
    header.split(";").map((part) => {
      const separator = part.indexOf("=");
      return separator < 0
        ? [part.trim(), ""]
        : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }),
  );
  const timestamp = Number(fields.get("t"));
  const signature = fields.get("sig");
  if (!Number.isFinite(timestamp) || !signature) return null;
  return { timestamp, signature };
}

export function verifyCybersourceWebhookSignature(input: {
  rawBody: Buffer;
  signatureHeader: string | null;
  digitalSignatureKey: string | undefined;
  now?: number;
}): boolean {
  const { rawBody, signatureHeader, digitalSignatureKey, now = Date.now() } = input;
  if (!digitalSignatureKey || !signatureHeader) return false;

  const parsed = parseSignature(signatureHeader);
  if (!parsed || Math.abs(now - parsed.timestamp) > SIGNATURE_MAX_AGE_MS) return false;

  const expected = crypto
    .createHmac("sha256", decodeDigitalSignatureKey(digitalSignatureKey))
    .update(`${parsed.timestamp}.${rawBody.toString("utf8")}`, "utf8")
    .digest();

  let received: Buffer;
  try {
    received = Buffer.from(parsed.signature, "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
