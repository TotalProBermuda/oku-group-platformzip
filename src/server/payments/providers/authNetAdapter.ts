/**
 * Payments P5 — Authorize.net adapter.
 *
 * Wraps the existing Authorize.net client so the rest of the codebase can call
 * a uniform `PaymentProviderAdapter` interface. Returns normalized results.
 */
import {
  authenticateTest,
  createTransactionCapture,
  getResolvedAuthNetConfig,
  refundTransaction,
  voidTransaction,
} from "@/server/authorizeNet/client";
import { prisma } from "@/lib/prisma";
import { isEncryptionAvailable, decryptSecret } from "@/server/security/encryption";
import {
  type NormalizedChargeInput,
  type NormalizedChargeResult,
  type NormalizedRefundInput,
  type NormalizedRefundResult,
  type NormalizedVoidInput,
  type NormalizedVoidResult,
  type PaymentProviderAdapter,
  type ProviderStatus,
  safeTruncate,
} from "./types";

interface AuthNetMessage {
  code?: string;
  text?: string;
  description?: string;
}
interface AuthNetTransactionResponse {
  responseCode?: string;
  authCode?: string;
  transId?: string;
  refTransID?: string;
  messages?: AuthNetMessage[];
  errors?: { errorCode?: string; errorText?: string }[];
}
interface AuthNetEnvelope {
  refId?: string;
  messages?: { resultCode?: string; message?: AuthNetMessage[] };
  transactionResponse?: AuthNetTransactionResponse;
}

function parseAuthNetResult(
  resp: unknown,
  networkError: string | null,
): {
  ok: boolean;
  transactionId: string | null;
  referenceId: string | null;
  authCode: string | null;
  responseCode: string | null;
  message: string | null;
  failureCode: string | null;
  failureMessage: string | null;
} {
  if (networkError) {
    return {
      ok: false,
      transactionId: null,
      referenceId: null,
      authCode: null,
      responseCode: null,
      message: networkError,
      failureCode: "NETWORK",
      failureMessage: networkError,
    };
  }
  const env = (resp ?? {}) as AuthNetEnvelope;
  const top = env.messages;
  const tx = env.transactionResponse;
  const topOk = top?.resultCode === "Ok";
  const txOk = tx?.responseCode === "1";
  const ok = topOk && txOk;
  const referenceId = env.refId ?? null;
  if (ok) {
    return {
      ok: true,
      transactionId: tx?.transId ?? null,
      referenceId,
      authCode: tx?.authCode ?? null,
      responseCode: tx?.responseCode ?? null,
      message: tx?.messages?.[0]?.description ?? top?.message?.[0]?.text ?? null,
      failureCode: null,
      failureMessage: null,
    };
  }
  const txErr = tx?.errors?.[0];
  const txMsg = tx?.messages?.[0];
  const topMsg = top?.message?.[0];
  const failureMessage =
    txErr?.errorText ||
    txMsg?.description ||
    txMsg?.text ||
    topMsg?.text ||
    topMsg?.description ||
    "Authorize.net declined";
  const failureCode = txErr?.errorCode || txMsg?.code || topMsg?.code || null;
  return {
    ok: false,
    transactionId: tx?.transId ?? null,
    referenceId,
    authCode: tx?.authCode ?? null,
    responseCode: tx?.responseCode ?? null,
    message: failureMessage,
    failureCode,
    failureMessage,
  };
}

function centsToAmount(c: number): string {
  return (c / 100).toFixed(2);
}

class AuthNetAdapter implements PaymentProviderAdapter {
  readonly provider = "AUTHORIZE_NET" as const;

  async getStatus(): Promise<ProviderStatus> {
    const blockers: string[] = [];
    let configured = false;
    let enabled = false;
    let environment: ProviderStatus["environment"] = null;
    let source: ProviderStatus["source"] = null;

    const cred = await prisma.paymentGatewayCredential
      .findUnique({ where: { provider: "AUTHORIZE_NET" } })
      .catch(() => null);

    let dbUsable = false;
    if (
      cred &&
      cred.apiLoginIdEncrypted &&
      cred.transactionKeyEncrypted &&
      isEncryptionAvailable()
    ) {
      try {
        decryptSecret(cred.apiLoginIdEncrypted);
        decryptSecret(cred.transactionKeyEncrypted);
        dbUsable = true;
      } catch {
        dbUsable = false;
      }
    }
    const envOk =
      !!process.env.AUTHORIZE_NET_API_LOGIN_ID &&
      !!process.env.AUTHORIZE_NET_TRANSACTION_KEY;

    if (dbUsable && cred) {
      enabled = !!cred.isActive && !!cred.enableGateway;
      environment = cred.environment === "production" ? "production" : "sandbox";
      source = "db";
      configured = true;
      if (!enabled) blockers.push("Authorize.net DB credential is not enabled");
    } else if (envOk) {
      enabled = true;
      environment =
        (process.env.AUTHORIZE_NET_ENV as "sandbox" | "production") || "sandbox";
      source = "env";
      configured = true;
    } else {
      blockers.push(
        "No usable Authorize.net credential (no encrypted DB row and env vars missing)",
      );
    }

    return {
      provider: this.provider,
      configured,
      enabled,
      environment,
      source,
      checkoutEligible: configured && enabled,
      blockers,
    };
  }

  async testConnection() {
    try {
      const r = await authenticateTest();
      return {
        ok: r.ok,
        message: r.ok
          ? `Authorize.net authenticated (${r.env}, source: ${r.source}).`
          : r.message ?? `Authentication failed (${r.resultCode ?? "no result code"})`,
        status: null,
      };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Authorize.net test failed", status: null };
    }
  }

  async charge(input: NormalizedChargeInput): Promise<NormalizedChargeResult> {
    if (!input.instrument.authNetOpaqueData) {
      return {
        ok: false,
        provider: this.provider,
        transactionId: null,
        referenceId: null,
        authCode: null,
        responseCode: null,
        message: "Authorize.net requires opaqueData (Accept.js token)",
        rawSafeResponse: null,
        failureCode: "BAD_INSTRUMENT",
        failureMessage: "Authorize.net requires opaqueData (Accept.js token)",
      };
    }
    let raw: unknown = null;
    let networkError: string | null = null;
    try {
      raw = await createTransactionCapture({
        amount: centsToAmount(input.amountCents),
        opaqueData: input.instrument.authNetOpaqueData,
        invoiceNumber: input.invoiceNumber,
      });
    } catch (e: any) {
      networkError = e?.message || "network error";
    }
    const parsed = parseAuthNetResult(raw, networkError);
    return {
      ok: parsed.ok,
      provider: this.provider,
      transactionId: parsed.transactionId,
      referenceId: parsed.referenceId,
      authCode: parsed.authCode,
      responseCode: parsed.responseCode,
      message: parsed.message,
      rawSafeResponse: safeTruncate(raw),
      failureCode: parsed.failureCode,
      failureMessage: parsed.failureMessage,
    };
  }

  async refund(input: NormalizedRefundInput): Promise<NormalizedRefundResult> {
    let raw: unknown = null;
    let networkError: string | null = null;
    try {
      raw = await refundTransaction({
        amount: centsToAmount(input.amountCents),
        refTransId: input.originalTransactionId,
      });
    } catch (e: any) {
      networkError = e?.message || "network error";
    }
    const parsed = parseAuthNetResult(raw, networkError);
    return {
      ok: parsed.ok,
      provider: this.provider,
      refundTransactionId: parsed.transactionId,
      originalTransactionId: input.originalTransactionId,
      amountCents: input.amountCents,
      message: parsed.message,
      failureCode: parsed.failureCode,
      failureMessage: parsed.failureMessage,
      rawSafeResponse: safeTruncate(raw),
    };
  }

  async voidPayment(input: NormalizedVoidInput): Promise<NormalizedVoidResult> {
    let raw: unknown = null;
    let networkError: string | null = null;
    try {
      raw = await voidTransaction({ refTransId: input.originalTransactionId });
    } catch (e: any) {
      networkError = e?.message || "network error";
    }
    const parsed = parseAuthNetResult(raw, networkError);
    return {
      ok: parsed.ok,
      provider: this.provider,
      voidTransactionId: parsed.transactionId,
      originalTransactionId: input.originalTransactionId,
      message: parsed.message,
      failureCode: parsed.failureCode,
      failureMessage: parsed.failureMessage,
      rawSafeResponse: safeTruncate(raw),
    };
  }
}

export const authNetAdapter = new AuthNetAdapter();

// Touch unused import so tree-shaking-safe and TS doesn't strip
void getResolvedAuthNetConfig;
