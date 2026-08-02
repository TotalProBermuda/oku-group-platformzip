import { prisma } from "@/lib/prisma";
import {
  encryptSecret,
  isEncryptionAvailable,
  maskSecret,
} from "@/server/security/encryption";

export const PROVIDER_AUTHORIZE_NET = "AUTHORIZE_NET";

export type SafeGatewayView = {
  provider: string;
  label: string;
  isActive: boolean;
  environment: "sandbox" | "production";
  connectionType: "gateway_only" | "all_in_one";
  enableGateway: boolean;
  hasApiLoginId: boolean;
  hasTransactionKey: boolean;
  hasSignatureKey: boolean;
  apiLoginIdLast4: string | null;
  transactionKeyLast4: string | null;
  signatureKeyLast4: string | null;
  merchantProviderName: string | null;
  merchantIdLast4: string | null;
  terminalIdLast4: string | null;
  checkoutTitle: string;
  checkoutDescription: string;
  displayCsc: boolean;
  transactionType: "charge" | "authorize_only";
  detailedDeclines: boolean;
  debugMode: "off" | "errors" | "verbose";
  acceptedCardLogos: string[];
  updatedAt: string | null;
};

const DEFAULT_LOGOS = ["visa", "mastercard", "amex"];

export async function getOrInitAuthNetCredential() {
  const existing = await prisma.paymentGatewayCredential.findUnique({
    where: { provider: PROVIDER_AUTHORIZE_NET },
  });
  if (existing) return existing;
  try {
    return await prisma.paymentGatewayCredential.create({
      data: {
        provider: PROVIDER_AUTHORIZE_NET,
        acceptedCardLogos: DEFAULT_LOGOS,
      },
    });
  } catch {
    const row = await prisma.paymentGatewayCredential.findUnique({
      where: { provider: PROVIDER_AUTHORIZE_NET },
    });
    if (!row) throw new Error("Failed to initialize gateway credential row");
    return row;
  }
}

export function toSafeView(
  cred: Awaited<ReturnType<typeof getOrInitAuthNetCredential>>
): SafeGatewayView {
  return {
    provider: cred.provider,
    label: cred.label,
    isActive: cred.isActive,
    environment: cred.environment === "production" ? "production" : "sandbox",
    connectionType: cred.connectionType === "all_in_one" ? "all_in_one" : "gateway_only",
    enableGateway: cred.enableGateway,
    hasApiLoginId: !!cred.apiLoginIdEncrypted,
    hasTransactionKey: !!cred.transactionKeyEncrypted,
    hasSignatureKey: !!cred.signatureKeyEncrypted,
    apiLoginIdLast4: cred.apiLoginIdLast4,
    transactionKeyLast4: cred.transactionKeyLast4,
    signatureKeyLast4: cred.signatureKeyLast4,
    merchantProviderName: cred.merchantProviderName,
    merchantIdLast4: cred.merchantIdLast4,
    terminalIdLast4: cred.terminalIdLast4,
    checkoutTitle: cred.checkoutTitle,
    checkoutDescription: cred.checkoutDescription,
    displayCsc: cred.displayCsc,
    transactionType: cred.transactionType === "authorize_only" ? "authorize_only" : "charge",
    detailedDeclines: cred.detailedDeclines,
    debugMode:
      cred.debugMode === "verbose" ? "verbose" : cred.debugMode === "errors" ? "errors" : "off",
    acceptedCardLogos: Array.isArray(cred.acceptedCardLogos)
      ? (cred.acceptedCardLogos as string[])
      : DEFAULT_LOGOS,
    updatedAt: cred.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Builds an update payload from a PATCH body, applying encryption + last4
 * extraction for credential fields. Returns the Prisma update args plus a
 * non-secret diff suitable for AuditLog.
 *
 * Behaviour for credential fields (apiLoginId/transactionKey/signatureKey):
 *  - undefined or empty string → keep existing value
 *  - { clear: true }          → wipe value + last4
 *  - non-empty string         → encrypt, store last4
 */
export type AuthNetPatchBody = {
  enableGateway?: boolean;
  environment?: "sandbox" | "production";
  connectionType?: "gateway_only" | "all_in_one";
  apiLoginId?: string | { clear: true };
  transactionKey?: string | { clear: true };
  signatureKey?: string | { clear: true };
  merchantProviderName?: string | null;
  merchantId?: string | { clear: true };
  terminalId?: string | { clear: true };
  checkoutTitle?: string;
  checkoutDescription?: string;
  displayCsc?: boolean;
  transactionType?: "charge" | "authorize_only";
  detailedDeclines?: boolean;
  debugMode?: "off" | "errors" | "verbose";
  acceptedCardLogos?: string[];
};

export function buildAuthNetUpdate(
  body: AuthNetPatchBody,
  prev: Awaited<ReturnType<typeof getOrInitAuthNetCredential>>
) {
  if (!isEncryptionAvailable()) {
    throw new Error("APP_ENCRYPTION_KEY is not configured; credential editing is unavailable.");
  }

  const data: Record<string, unknown> = {};
  // Non-secret simple fields
  const nonSecretKeys: Array<keyof AuthNetPatchBody> = [
    "enableGateway",
    "environment",
    "connectionType",
    "checkoutTitle",
    "checkoutDescription",
    "displayCsc",
    "transactionType",
    "detailedDeclines",
    "debugMode",
    "merchantProviderName",
  ];
  for (const k of nonSecretKeys) {
    if (body[k] !== undefined) data[k as string] = body[k];
  }
  if (body.acceptedCardLogos !== undefined) {
    data.acceptedCardLogos = body.acceptedCardLogos;
  }

  // Credential triplets — encrypt + last4
  function applyCredential(
    fieldName: "apiLoginId" | "transactionKey" | "signatureKey",
    encryptedField: "apiLoginIdEncrypted" | "transactionKeyEncrypted" | "signatureKeyEncrypted",
    last4Field: "apiLoginIdLast4" | "transactionKeyLast4" | "signatureKeyLast4"
  ) {
    const v = body[fieldName];
    if (v === undefined) return false;
    if (typeof v === "object" && v && "clear" in v && v.clear === true) {
      data[encryptedField] = null;
      data[last4Field] = null;
      return true;
    }
    if (typeof v === "string" && v.trim().length > 0) {
      data[encryptedField] = encryptSecret(v.trim());
      data[last4Field] = maskSecret(v.trim()).last4;
      return true;
    }
    return false; // empty string → keep existing
  }
  const apiLoginIdChanged = applyCredential("apiLoginId", "apiLoginIdEncrypted", "apiLoginIdLast4");
  const transactionKeyChanged = applyCredential(
    "transactionKey",
    "transactionKeyEncrypted",
    "transactionKeyLast4"
  );
  const signatureKeyChanged = applyCredential("signatureKey", "signatureKeyEncrypted", "signatureKeyLast4");

  // Masked merchant/terminal IDs
  if (body.merchantId !== undefined) {
    if (typeof body.merchantId === "object" && body.merchantId && "clear" in body.merchantId) {
      data.merchantIdLast4 = null;
    } else if (typeof body.merchantId === "string" && body.merchantId.trim().length > 0) {
      data.merchantIdLast4 = maskSecret(body.merchantId.trim()).last4;
    }
  }
  if (body.terminalId !== undefined) {
    if (typeof body.terminalId === "object" && body.terminalId && "clear" in body.terminalId) {
      data.terminalIdLast4 = null;
    } else if (typeof body.terminalId === "string" && body.terminalId.trim().length > 0) {
      data.terminalIdLast4 = maskSecret(body.terminalId.trim()).last4;
    }
  }

  // Build a non-secret diff for AuditLog. Never include raw credential values.
  const auditDiff: Record<string, unknown> = {};
  for (const k of nonSecretKeys) {
    if (body[k] !== undefined && (prev as any)[k] !== body[k]) {
      auditDiff[k] = { from: (prev as any)[k], to: body[k] };
    }
  }
  if (body.acceptedCardLogos !== undefined) {
    auditDiff.acceptedCardLogos = {
      from: prev.acceptedCardLogos,
      to: body.acceptedCardLogos,
    };
  }
  if (apiLoginIdChanged) auditDiff.apiLoginIdChanged = true;
  if (transactionKeyChanged) auditDiff.transactionKeyChanged = true;
  if (signatureKeyChanged) auditDiff.signatureKeyChanged = true;
  if (data.merchantIdLast4 !== undefined && data.merchantIdLast4 !== prev.merchantIdLast4) {
    auditDiff.merchantIdLast4 = { from: prev.merchantIdLast4, to: data.merchantIdLast4 };
  }
  if (data.terminalIdLast4 !== undefined && data.terminalIdLast4 !== prev.terminalIdLast4) {
    auditDiff.terminalIdLast4 = { from: prev.terminalIdLast4, to: data.terminalIdLast4 };
  }

  return { data, auditDiff };
}
