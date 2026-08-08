import { prisma } from "@/lib/prisma";
import {
  encryptSecret,
  isEncryptionAvailable,
  maskSecret,
} from "@/server/security/encryption";

export const PROVIDER_CYBERSOURCE = "CYBERSOURCE";

export type CybersourceEnvironment = "test" | "production";
export type CybersourceDebugMode = "OFF" | "ERRORS_ONLY" | "VERBOSE";

export type CybersourceCredentialFieldStatus =
  | "missing"
  | "saved"
  | "optional";

export type SafeCybersourceView = {
  provider: typeof PROVIDER_CYBERSOURCE;
  enabled: boolean;
  environment: CybersourceEnvironment;
  configured: boolean;
  credentialSource: "database" | "environment" | "none";
  credentialStatus: {
    merchantId: CybersourceCredentialFieldStatus;
    keyId: CybersourceCredentialFieldStatus;
    sharedSecret: CybersourceCredentialFieldStatus;
    organizationId: CybersourceCredentialFieldStatus;
    portfolioId: CybersourceCredentialFieldStatus;
  };
  masked: {
    merchantId: string | null;
    keyId: string | null;
    sharedSecret: string | null;
    organizationId: string | null;
    portfolioId: string | null;
  };
  publicSettings: {
    checkoutTitle: string;
    checkoutDescription: string;
    acceptedCardLogos: string[];
    cardSecurityCodeEnabled: boolean;
    detailedDeclineMessagesEnabled: boolean;
    debugMode: CybersourceDebugMode;
  };
  lastTest: {
    status: "passed" | "failed" | null;
    message: string | null;
    timestamp: string | null;
  } | null;
  canEditCredentials: boolean;
  updatedAt: string | null;
};

const DEFAULT_LOGOS = ["visa", "mastercard", "amex"];

export async function getOrInitCybersourceCredential() {
  const existing = await prisma.cybersourceGatewayCredential.findUnique({
    where: { provider: PROVIDER_CYBERSOURCE },
  });
  if (existing) return existing;
  try {
    return await prisma.cybersourceGatewayCredential.create({
      data: { provider: PROVIDER_CYBERSOURCE, acceptedCardLogos: DEFAULT_LOGOS },
    });
  } catch {
    const row = await prisma.cybersourceGatewayCredential.findUnique({
      where: { provider: PROVIDER_CYBERSOURCE },
    });
    if (!row) throw new Error("Failed to initialize Cybersource credential row");
    return row;
  }
}

type Cred = Awaited<ReturnType<typeof getOrInitCybersourceCredential>>;

export function toSafeCybersourceView(cred: Cred): SafeCybersourceView {
  const env: CybersourceEnvironment =
    cred.environment === "production" ? "production" : "test";
  const debugMode: CybersourceDebugMode =
    cred.debugMode === "VERBOSE"
      ? "VERBOSE"
      : cred.debugMode === "ERRORS_ONLY"
      ? "ERRORS_ONLY"
      : "OFF";

  const fieldStatus = (
    enc: string | null,
    optional = false
  ): CybersourceCredentialFieldStatus =>
    enc ? "saved" : optional ? "optional" : "missing";

  const dbConfigured = !!(
    cred.merchantIdEncrypted &&
    cred.keyIdEncrypted &&
    cred.sharedSecretEncrypted
  );

  return {
    provider: PROVIDER_CYBERSOURCE,
    enabled: cred.enabled,
    environment: env,
    configured: dbConfigured,
    credentialSource: dbConfigured ? "database" : "none",
    credentialStatus: {
      merchantId: fieldStatus(cred.merchantIdEncrypted),
      keyId: fieldStatus(cred.keyIdEncrypted),
      sharedSecret: fieldStatus(cred.sharedSecretEncrypted),
      organizationId: fieldStatus(cred.organizationIdEncrypted, true),
      portfolioId: fieldStatus(cred.portfolioIdEncrypted, true),
    },
    masked: {
      merchantId: cred.merchantIdLast4,
      keyId: cred.keyIdLast4,
      sharedSecret: cred.sharedSecretEncrypted ? cred.sharedSecretLast4 : null,
      organizationId: cred.organizationIdLast4,
      portfolioId: cred.portfolioIdLast4,
    },
    publicSettings: {
      checkoutTitle: cred.checkoutTitle,
      checkoutDescription: cred.checkoutDescription,
      acceptedCardLogos: Array.isArray(cred.acceptedCardLogos)
        ? (cred.acceptedCardLogos as string[])
        : DEFAULT_LOGOS,
      cardSecurityCodeEnabled: cred.cardSecurityCodeEnabled,
      detailedDeclineMessagesEnabled: cred.detailedDeclineMessagesEnabled,
      debugMode,
    },
    lastTest: cred.lastTestedAt
      ? {
          status:
            cred.lastTestStatus === "passed"
              ? "passed"
              : cred.lastTestStatus === "failed"
              ? "failed"
              : null,
          message: cred.lastTestMessage,
          timestamp: cred.lastTestedAt.toISOString(),
        }
      : null,
    canEditCredentials: isEncryptionAvailable(),
    updatedAt: cred.updatedAt?.toISOString() ?? null,
  };
}

export type CybersourcePatchBody = {
  enabled?: boolean;
  environment?: CybersourceEnvironment;
  merchantId?: string | { clear: true };
  keyId?: string | { clear: true };
  sharedSecret?: string | { clear: true };
  organizationId?: string | { clear: true };
  portfolioId?: string | { clear: true };
  checkoutTitle?: string;
  checkoutDescription?: string;
  acceptedCardLogos?: string[];
  cardSecurityCodeEnabled?: boolean;
  detailedDeclineMessagesEnabled?: boolean;
  debugMode?: CybersourceDebugMode;
};

export function buildCybersourceUpdate(body: CybersourcePatchBody, prev: Cred) {
  if (!isEncryptionAvailable()) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not configured; credential editing is unavailable."
    );
  }

  const data: Record<string, unknown> = {};
  const nonSecretKeys: Array<keyof CybersourcePatchBody> = [
    "enabled",
    "environment",
    "checkoutTitle",
    "checkoutDescription",
    "cardSecurityCodeEnabled",
    "detailedDeclineMessagesEnabled",
    "debugMode",
  ];
  for (const k of nonSecretKeys) {
    if (body[k] !== undefined) data[k as string] = body[k];
  }
  if (body.acceptedCardLogos !== undefined) {
    data.acceptedCardLogos = body.acceptedCardLogos;
  }

  function applyCredential(
    fieldName: keyof CybersourcePatchBody,
    encField: string,
    last4Field: string
  ): boolean {
    const v = body[fieldName];
    if (v === undefined) return false;
    if (typeof v === "object" && v && "clear" in v && v.clear === true) {
      data[encField] = null;
      data[last4Field] = null;
      return true;
    }
    if (typeof v === "string" && v.trim().length > 0) {
      data[encField] = encryptSecret(v.trim());
      data[last4Field] = maskSecret(v.trim()).last4;
      return true;
    }
    return false;
  }

  const merchantIdChanged = applyCredential(
    "merchantId",
    "merchantIdEncrypted",
    "merchantIdLast4"
  );
  const keyIdChanged = applyCredential("keyId", "keyIdEncrypted", "keyIdLast4");
  const sharedSecretChanged = applyCredential(
    "sharedSecret",
    "sharedSecretEncrypted",
    "sharedSecretLast4"
  );
  const organizationIdChanged = applyCredential(
    "organizationId",
    "organizationIdEncrypted",
    "organizationIdLast4"
  );
  const portfolioIdChanged = applyCredential(
    "portfolioId",
    "portfolioIdEncrypted",
    "portfolioIdLast4"
  );

  // Reset test state when any core credential field changes — the prior test
  // result is no longer valid for the new key material. Non-secret config
  // changes (checkout title, debug mode, etc.) do not invalidate the test.
  if (merchantIdChanged || keyIdChanged || sharedSecretChanged) {
    data.lastTestStatus = null;
    data.lastTestedAt = null;
    data.lastTestMessage = null;
  }

  // Build non-secret diff for AuditLog. Never include raw values.
  const auditDiff: Record<string, unknown> = {
    provider: PROVIDER_CYBERSOURCE,
  };
  if (body.enabled !== undefined && prev.enabled !== body.enabled) {
    auditDiff.enabledBefore = prev.enabled;
    auditDiff.enabledAfter = body.enabled;
  }
  if (body.environment !== undefined && prev.environment !== body.environment) {
    auditDiff.environmentBefore = prev.environment;
    auditDiff.environmentAfter = body.environment;
  }
  if (merchantIdChanged) auditDiff.merchantIdChanged = true;
  if (keyIdChanged) auditDiff.keyIdChanged = true;
  if (sharedSecretChanged) auditDiff.sharedSecretChanged = true;
  if (organizationIdChanged) auditDiff.organizationIdChanged = true;
  if (portfolioIdChanged) auditDiff.portfolioIdChanged = true;

  let publicSettingsChanged = false;
  for (const k of [
    "checkoutTitle",
    "checkoutDescription",
    "cardSecurityCodeEnabled",
    "detailedDeclineMessagesEnabled",
    "debugMode",
  ] as const) {
    if (body[k] !== undefined && (prev as any)[k] !== body[k]) {
      publicSettingsChanged = true;
    }
  }
  if (
    body.acceptedCardLogos !== undefined &&
    JSON.stringify(prev.acceptedCardLogos) !==
      JSON.stringify(body.acceptedCardLogos)
  ) {
    publicSettingsChanged = true;
  }
  if (publicSettingsChanged) auditDiff.publicSettingsChanged = true;

  return { data, auditDiff };
}
