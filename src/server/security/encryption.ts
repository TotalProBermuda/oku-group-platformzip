import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function decodeKey(raw: string): Buffer {
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === KEY_BYTES) return b64;
  const utf = Buffer.from(raw, "utf8");
  if (utf.length === KEY_BYTES) return utf;
  throw new Error(
    `APP_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${b64.length} base64 / ${utf.length} utf8). ` +
      `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  );
}

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY is not set");
  }
  return decodeKey(raw);
}

export function isEncryptionAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypts a UTF-8 string. Returns "iv.ciphertext.tag" all base64. */
export function encryptSecret(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("encryptSecret: value must be a non-empty string");
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${ct.toString("base64")}.${tag.toString("base64")}`;
}

/** Reverse of encryptSecret. Throws on key/format/auth-tag mismatch. */
export function decryptSecret(payload: string): string {
  if (typeof payload !== "string") throw new Error("decryptSecret: payload must be a string");
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("decryptSecret: malformed payload");
  const key = getKey();
  const iv = Buffer.from(parts[0], "base64");
  const ct = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  if (iv.length !== IV_BYTES) throw new Error("decryptSecret: bad IV length");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Returns the last 4 chars of a value for display. Never logs the full value. */
export function maskSecret(value: string): { last4: string } {
  const v = String(value ?? "");
  return { last4: v.length <= 4 ? v : v.slice(-4) };
}
