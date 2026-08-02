import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "./invuEncryptionService";
import { recordIntegrationAudit } from "./invuAuditService";
import type { ApiUserType, InvuCredentialStatus } from "@prisma/client";

const INVU_AUTH_URL = "https://api6.invupos.com/invuApiPos/userAuth";

interface InvuAuthResponse {
  access_token?: string;
  token?: string;
  authorization?: string;
  expires_in?: number;
  error?: string;
  message?: string;
}

function extractInvuToken(body: InvuAuthResponse): string | null {
  return body.access_token ?? body.token ?? body.authorization ?? null;
}

function extractInvuError(body: InvuAuthResponse): string {
  return body.error ?? body.message ?? "No token returned";
}

export async function authenticateInvu(
  username: string,
  password: string,
  venueId: string,
  options: {
    apiUserType: ApiUserType;
    apiUserExpiresAt?: Date | null;
    branchScoped?: boolean;
    userId?: string;
    ip?: string;
  }
): Promise<void> {
  let authResponse: InvuAuthResponse;
  let authSucceeded = false;
  let authError: string | null = null;
  let token: string | null = null;

  try {
    const res = await fetch(INVU_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, grant_type: "authorization" }),
    });
    const body = (await res.json()) as InvuAuthResponse;
    authResponse = body;
    token = extractInvuToken(body);
    if (!token) {
      authError = `${extractInvuError(body)} (HTTP ${res.status})`;
    } else {
      authSucceeded = true;
    }
  } catch (err) {
    authError = err instanceof Error ? err.message : "Network error";
    authResponse = {};
  }

  const usernameEncrypted = encrypt(username);
  const passwordEncrypted = encrypt(password);
  const tokenEncrypted = token ? encrypt(token) : null;
  const tokenMasked = token ? `***${token.slice(-6)}` : null;
  const now = new Date();

  const existing = await prisma.invuIntegrationCredential.findUnique({
    where: { venueId },
  });

  const status: InvuCredentialStatus = authSucceeded ? "CONNECTED" : "FAILED";

  if (existing) {
    await prisma.invuIntegrationCredential.update({
      where: { venueId },
      data: {
        apiUsernameEncrypted: usernameEncrypted,
        apiPasswordEncrypted: passwordEncrypted,
        accessTokenEncrypted: tokenEncrypted ?? undefined,
        accessTokenMasked: tokenMasked ?? undefined,
        accessTokenIssuedAt: authSucceeded ? now : undefined,
        tokenLastRotatedAt: authSucceeded ? now : undefined,
        apiUserType: options.apiUserType,
        apiUserExpiresAt: options.apiUserExpiresAt ?? undefined,
        branchScoped: options.branchScoped ?? false,
        status,
        lastAuthSucceededAt: authSucceeded ? now : undefined,
        lastAuthFailedAt: authSucceeded ? undefined : now,
        lastAuthError: authError ?? undefined,
        updatedByUserId: options.userId ?? undefined,
      },
    });
  } else {
    await prisma.invuIntegrationCredential.create({
      data: {
        venueId,
        apiUsernameEncrypted: usernameEncrypted,
        apiPasswordEncrypted: passwordEncrypted,
        accessTokenEncrypted: tokenEncrypted ?? undefined,
        accessTokenMasked: tokenMasked ?? undefined,
        accessTokenIssuedAt: authSucceeded ? now : undefined,
        tokenLastRotatedAt: authSucceeded ? now : undefined,
        apiUserType: options.apiUserType,
        apiUserExpiresAt: options.apiUserExpiresAt ?? undefined,
        branchScoped: options.branchScoped ?? false,
        status,
        lastAuthSucceededAt: authSucceeded ? now : undefined,
        lastAuthFailedAt: authSucceeded ? undefined : now,
        lastAuthError: authError ?? undefined,
        createdByUserId: options.userId ?? undefined,
        updatedByUserId: options.userId ?? undefined,
      },
    });
  }

  const credential = await prisma.invuIntegrationCredential.findUnique({ where: { venueId } });

  if (authSucceeded) {
    await recordIntegrationAudit("INVU_CONNECT", options.userId, credential?.id, {
      venueId,
      ip: options.ip,
    });
  } else {
    await recordIntegrationAudit("INVU_CONNECT_FAILED", options.userId, credential?.id, {
      venueId,
      error: authError,
      ip: options.ip,
    });
    throw new Error(authError ?? "Authentication failed");
  }
}

export async function reauthenticateInvu(
  credentialId: string,
  options?: { userId?: string; ip?: string }
): Promise<void> {
  const credential = await prisma.invuIntegrationCredential.findUnique({
    where: { id: credentialId },
  });
  if (!credential) {
    throw new Error("Credential not found");
  }

  const username = decrypt(credential.apiUsernameEncrypted);
  const password = decrypt(credential.apiPasswordEncrypted);

  let token: string | null = null;
  let authError: string | null = null;
  let authSucceeded = false;

  try {
    const res = await fetch(INVU_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, grant_type: "authorization" }),
    });
    const body = (await res.json()) as InvuAuthResponse;
    token = extractInvuToken(body);
    if (!token) {
      authError = `${extractInvuError(body)} (HTTP ${res.status})`;
    } else {
      authSucceeded = true;
    }
  } catch (err) {
    authError = err instanceof Error ? err.message : "Network error";
  }

  const now = new Date();

  if (authSucceeded && token) {
    await prisma.invuIntegrationCredential.update({
      where: { id: credentialId },
      data: {
        accessTokenEncrypted: encrypt(token),
        accessTokenMasked: `***${token.slice(-6)}`,
        accessTokenIssuedAt: now,
        tokenLastRotatedAt: now,
        status: "CONNECTED",
        lastAuthSucceededAt: now,
        lastAuthError: null,
        updatedByUserId: options?.userId ?? undefined,
      },
    });
    await recordIntegrationAudit("INVU_REAUTH", options?.userId, credentialId, {
      venueId: credential.venueId,
      ip: options?.ip,
    });
  } else {
    await prisma.invuIntegrationCredential.update({
      where: { id: credentialId },
      data: {
        status: "FAILED",
        lastAuthFailedAt: now,
        lastAuthError: authError ?? undefined,
        updatedByUserId: options?.userId ?? undefined,
      },
    });
    await recordIntegrationAudit("INVU_REAUTH_FAILED", options?.userId, credentialId, {
      venueId: credential.venueId,
      error: authError,
      ip: options?.ip,
    });
    throw new Error(authError ?? "Reauthentication failed");
  }
}

export async function revokeInvuToken(
  credentialId: string,
  options?: { userId?: string; ip?: string }
): Promise<void> {
  const credential = await prisma.invuIntegrationCredential.findUnique({
    where: { id: credentialId },
  });
  if (!credential) {
    throw new Error("Credential not found");
  }

  if (credential.accessTokenEncrypted) {
    try {
      const token = decrypt(credential.accessTokenEncrypted);
      await fetch(INVU_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, grant_type: "revoke" }),
      });
    } catch {
      // Whether remote revoke succeeds or not, we still disconnect locally
    }
  }

  await prisma.invuIntegrationCredential.update({
    where: { id: credentialId },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: null,
      accessTokenMasked: null,
      accessTokenIssuedAt: null,
      accessTokenExpiresAt: null,
      tokenLastRotatedAt: null,
      updatedByUserId: options?.userId ?? undefined,
    },
  });

  await recordIntegrationAudit("INVU_DISCONNECT", options?.userId, credentialId, {
    venueId: credential.venueId,
    ip: options?.ip,
  });
}

export async function getInvuConnectionStatus(venueId: string) {
  const credential = await prisma.invuIntegrationCredential.findUnique({
    where: { venueId },
    include: { branchMappings: true },
  });

  if (!credential) {
    return null;
  }

  let daysUntilExpiry: number | null = null;
  let computedStatus: string = credential.status;

  if (credential.apiUserExpiresAt) {
    const now = new Date();
    const diffMs = credential.apiUserExpiresAt.getTime() - now.getTime();
    daysUntilExpiry = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (credential.status === "CONNECTED" && daysUntilExpiry <= 14 && daysUntilExpiry >= 0) {
      computedStatus = "EXPIRING_SOON";
    }
  }

  const lastSuccessfulSyncAt =
    credential.branchMappings.reduce<Date | null>((latest, m) => {
      if (!m.lastSuccessfulSyncAt) return latest;
      if (!latest || m.lastSuccessfulSyncAt > latest) return m.lastSuccessfulSyncAt;
      return latest;
    }, null);

  const lastFailedSyncAt =
    credential.branchMappings.reduce<Date | null>((latest, m) => {
      if (!m.lastFailedSyncAt) return latest;
      if (!latest || m.lastFailedSyncAt > latest) return m.lastFailedSyncAt;
      return latest;
    }, null);

  return {
    credentialId: credential.id,
    status: computedStatus,
    daysUntilExpiry,
    lastAuthSucceededAt: credential.lastAuthSucceededAt,
    lastAuthFailedAt: credential.lastAuthFailedAt,
    lastAuthError: credential.lastAuthError,
    tokenIssuedAt: credential.accessTokenIssuedAt,
    tokenLastRotatedAt: credential.tokenLastRotatedAt,
    accessTokenMasked: credential.accessTokenMasked,
    apiUserExpiresAt: credential.apiUserExpiresAt,
    apiUserType: credential.apiUserType,
    branchScoped: credential.branchScoped,
    isEnabled: credential.isEnabled,
    lastSuccessfulSyncAt,
    lastFailedSyncAt,
    branchMappings: credential.branchMappings,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
    apiUsernameMasked: (() => {
      try {
        const plain = decrypt(credential.apiUsernameEncrypted);
        return plain.slice(0, 2) + "***";
      } catch {
        return "***";
      }
    })(),
  };
}
