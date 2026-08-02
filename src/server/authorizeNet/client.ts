/**
 * Minimal Authorize.net API client (transaction capture + refund stubs).
 * Uses JSON API (https://developer.authorize.net/api/reference/)
 *
 * Config resolution:
 *   1. Active encrypted PaymentGatewayCredential row (provider=AUTHORIZE_NET,
 *      isActive=true, enableGateway=true) — decrypted at call time.
 *   2. Fallback to env vars (AUTHORIZE_NET_API_LOGIN_ID / _TRANSACTION_KEY / _ENV).
 *
 * Never logs raw credential values.
 */
import { prisma } from "@/lib/prisma";
import { decryptSecret, isEncryptionAvailable } from "@/server/security/encryption";

export type AuthNetEnv = "sandbox" | "production";

export interface ResolvedAuthNetConfig {
  apiLoginId: string;
  transactionKey: string;
  env: AuthNetEnv;
  source: "db" | "env";
}

export function authNetEndpoint(env: AuthNetEnv) {
  return env === "production"
    ? "https://api2.authorize.net/xml/v1/request.api"
    : "https://apitest.authorize.net/xml/v1/request.api";
}

/**
 * @deprecated Use getResolvedAuthNetConfig(). Kept for legacy sync callers
 * that have not migrated. Env-only.
 */
export function getAuthNetConfig() {
  const apiLoginId = process.env.AUTHORIZE_NET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;
  const env = (process.env.AUTHORIZE_NET_ENV || "sandbox") as AuthNetEnv;
  if (!apiLoginId || !transactionKey) {
    throw new Error(
      "Authorize.net env vars missing (AUTHORIZE_NET_API_LOGIN_ID / AUTHORIZE_NET_TRANSACTION_KEY)"
    );
  }
  return { apiLoginId, transactionKey, env };
}

export async function getResolvedAuthNetConfig(): Promise<ResolvedAuthNetConfig> {
  // 1. Try DB credential
  if (isEncryptionAvailable()) {
    const cred = await prisma.paymentGatewayCredential
      .findUnique({ where: { provider: "AUTHORIZE_NET" } })
      .catch(() => null);
    if (
      cred &&
      cred.isActive &&
      cred.enableGateway &&
      cred.apiLoginIdEncrypted &&
      cred.transactionKeyEncrypted
    ) {
      try {
        const apiLoginId = decryptSecret(cred.apiLoginIdEncrypted);
        const transactionKey = decryptSecret(cred.transactionKeyEncrypted);
        const env: AuthNetEnv =
          cred.environment === "production" ? "production" : "sandbox";
        return { apiLoginId, transactionKey, env, source: "db" };
      } catch {
        // Fall through to env fallback rather than throwing — never log the value.
      }
    }
  }

  // 2. Fallback: env
  const apiLoginId = process.env.AUTHORIZE_NET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;
  const env = (process.env.AUTHORIZE_NET_ENV || "sandbox") as AuthNetEnv;
  if (!apiLoginId || !transactionKey) {
    throw new Error(
      "Authorize.net credentials not configured (no active encrypted credential and env vars missing)"
    );
  }
  return { apiLoginId, transactionKey, env, source: "env" };
}

async function postToAuthNet(payload: any, env: AuthNetEnv) {
  const res = await fetch(authNetEndpoint(env), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function createTransactionCapture(params: {
  amount: string; // "150.00"
  opaqueData: { dataDescriptor: string; dataValue: string }; // Accept.js token
  invoiceNumber: string;
}) {
  const { apiLoginId, transactionKey, env } = await getResolvedAuthNetConfig();
  return postToAuthNet(
    {
      createTransactionRequest: {
        merchantAuthentication: { name: apiLoginId, transactionKey },
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount: params.amount,
          payment: { opaqueData: params.opaqueData },
          order: { invoiceNumber: params.invoiceNumber },
        },
      },
    },
    env
  );
}

export async function voidTransaction(params: { refTransId: string }) {
  const { apiLoginId, transactionKey, env } = await getResolvedAuthNetConfig();
  return postToAuthNet(
    {
      createTransactionRequest: {
        merchantAuthentication: { name: apiLoginId, transactionKey },
        transactionRequest: {
          transactionType: "voidTransaction",
          refTransId: params.refTransId,
        },
      },
    },
    env
  );
}

/**
 * Sandbox-safe configuration validation. Calls authenticateTestRequest
 * which returns Ok/Error without charging or mutating any account.
 *
 * Optional override allows testing un-saved credentials before persisting.
 */
export async function authenticateTest(override?: {
  apiLoginId: string;
  transactionKey: string;
  env: AuthNetEnv;
}): Promise<{
  ok: boolean;
  env: AuthNetEnv;
  source: "db" | "env" | "override";
  resultCode: string | null;
  message: string | null;
}> {
  let apiLoginId: string;
  let transactionKey: string;
  let env: AuthNetEnv;
  let source: "db" | "env" | "override";
  if (override) {
    apiLoginId = override.apiLoginId;
    transactionKey = override.transactionKey;
    env = override.env;
    source = "override";
  } else {
    const r = await getResolvedAuthNetConfig();
    apiLoginId = r.apiLoginId;
    transactionKey = r.transactionKey;
    env = r.env;
    source = r.source;
  }
  const json = (await postToAuthNet(
    {
      authenticateTestRequest: {
        merchantAuthentication: { name: apiLoginId, transactionKey },
      },
    },
    env
  )) as {
    messages?: { resultCode?: string; message?: { code?: string; text?: string }[] };
  };
  const resultCode = json?.messages?.resultCode ?? null;
  const m = json?.messages?.message?.[0];
  return {
    ok: resultCode === "Ok",
    env,
    source,
    resultCode,
    message: m?.text ?? m?.code ?? null,
  };
}

export async function refundTransaction(params: {
  amount: string;
  refTransId: string;
}) {
  const { apiLoginId, transactionKey, env } = await getResolvedAuthNetConfig();
  return postToAuthNet(
    {
      createTransactionRequest: {
        merchantAuthentication: { name: apiLoginId, transactionKey },
        transactionRequest: {
          transactionType: "refundTransaction",
          amount: params.amount,
          refTransId: params.refTransId,
        },
      },
    },
    env
  );
}
