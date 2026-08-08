/**
 * Cybersource client — settings/test only. No checkout, refund, or void
 * implementation in this phase (Payments P3 is settings + readiness).
 *
 * Config resolution:
 *   1. Active encrypted CybersourceGatewayCredential row (provider=CYBERSOURCE,
 *      enabled=true) — decrypted at call time.
 *   2. No env fallback — Cybersource is database-only by design.
 *
 * Never logs raw credential values.
 */
import { prisma } from "@/lib/prisma";
import { decryptSecret, isEncryptionAvailable } from "@/server/security/encryption";
import {
  buildCybersourceHttpSignatureHeaders,
  cybersourceHost,
} from "@/server/payments/cybersourceSignature";

export type CybersourceEnv = "test" | "production";

export interface ResolvedCybersourceConfig {
  merchantId: string;
  keyId: string;
  sharedSecret: string;
  organizationId: string | null;
  portfolioId: string | null;
  env: CybersourceEnv;
  source: "db";
}

export async function getResolvedCybersourceConfig(): Promise<ResolvedCybersourceConfig> {
  if (!isEncryptionAvailable()) {
    throw new Error(
      "Cybersource credentials cannot be resolved: APP_ENCRYPTION_KEY is missing."
    );
  }
  const cred = await prisma.cybersourceGatewayCredential
    .findUnique({ where: { provider: "CYBERSOURCE" } })
    .catch(() => null);
  if (
    !cred ||
    !cred.enabled ||
    !cred.merchantIdEncrypted ||
    !cred.keyIdEncrypted ||
    !cred.sharedSecretEncrypted
  ) {
    throw new Error("Cybersource is not configured or not enabled.");
  }
  try {
    const merchantId = decryptSecret(cred.merchantIdEncrypted);
    const keyId = decryptSecret(cred.keyIdEncrypted);
    const sharedSecret = decryptSecret(cred.sharedSecretEncrypted);
    const organizationId = cred.organizationIdEncrypted
      ? decryptSecret(cred.organizationIdEncrypted)
      : null;
    const portfolioId = cred.portfolioIdEncrypted
      ? decryptSecret(cred.portfolioIdEncrypted)
      : null;
    const env: CybersourceEnv =
      cred.environment === "production" ? "production" : "test";
    return {
      merchantId,
      keyId,
      sharedSecret,
      organizationId,
      portfolioId,
      env,
      source: "db",
    };
  } catch {
    throw new Error(
      "Saved Cybersource credentials cannot be decrypted. Check APP_ENCRYPTION_KEY."
    );
  }
}

/**
 * Sandbox-safe authentication probe. Performs a signed GET against a
 * harmless Cybersource endpoint and classifies the response:
 *   - 2xx           → pass
 *   - 401 / 403     → credential failure
 *   - network/DNS   → connection failure
 *   - other 4xx/5xx → "credentials accepted but endpoint returned X" — only
 *                     treated as pass if the body indicates an authenticated
 *                     business-level error (not auth).
 *
 * Never charges, authorizes, or mutates anything.
 *
 * Optional override allows testing un-saved credentials before persisting.
 */
export async function testCybersourceConnection(override?: {
  merchantId: string;
  keyId: string;
  sharedSecret: string;
  env: CybersourceEnv;
}): Promise<{
  ok: boolean;
  env: CybersourceEnv;
  status: number | null;
  message: string;
}> {
  let merchantId: string;
  let keyId: string;
  let sharedSecret: string;
  let env: CybersourceEnv;
  if (override) {
    ({ merchantId, keyId, sharedSecret, env } = override);
  } else {
    const r = await getResolvedCybersourceConfig();
    merchantId = r.merchantId;
    keyId = r.keyId;
    sharedSecret = r.sharedSecret;
    env = r.env;
  }

  const host = cybersourceHost(env);
  // /reporting/v3/report-definitions is a read-only authenticated endpoint
  // that does NOT touch payments. A 200 response confirms credentials work.
  const path = "/reporting/v3/report-definitions";
  const headers = buildCybersourceHttpSignatureHeaders({
    method: "GET",
    path,
    merchantId,
    keyId,
    sharedSecret,
    host,
  });

  const url = `https://${host}${path}`;
  let status: number | null = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { ...headers, Accept: "application/hal+json" },
    });
    status = res.status;
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, env, status, message: "Credentials accepted." };
    }
    // Anything other than 2xx is treated as a failure. Cybersource may return
    // 4xx for malformed signatures, expired dates, missing/invalid headers,
    // and other auth-adjacent issues that should NOT be reported as a pass.
    let detail = "";
    try {
      const txt = await res.text();
      detail = txt.length > 240 ? txt.slice(0, 240) + "…" : txt;
    } catch {
      // ignore
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        env,
        status,
        message: `Authentication failed (${res.status}). ${detail || "Check Merchant ID, Key ID, and Shared Secret."}`,
      };
    }
    return {
      ok: false,
      env,
      status,
      message: `Cybersource returned HTTP ${res.status}. ${detail || "Verify credentials, environment, and system clock."}`,
    };
  } catch (e: any) {
    return {
      ok: false,
      env,
      status,
      message: `Network error contacting ${host}: ${e?.message || "unknown"}`,
    };
  }
}
