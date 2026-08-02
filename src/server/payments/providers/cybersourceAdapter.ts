/**
 * Payments P5 — Cybersource adapter.
 *
 * Implements `PaymentProviderAdapter` using the signed REST endpoints in
 * `src/server/cybersource/transactions.ts`.
 */
import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  isEncryptionAvailable,
} from "@/server/security/encryption";
import {
  cybersourceCharge,
  cybersourceRefund,
  cybersourceVoid,
} from "@/server/cybersource/transactions";
import { testCybersourceConnection } from "@/server/cybersource/client";
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

function centsToAmount(c: number): string {
  return (c / 100).toFixed(2);
}

/**
 * Cybersource success: 2xx HTTP + body.status in {AUTHORIZED, AUTHORIZED_PENDING_REVIEW,
 * PARTIAL_AUTHORIZED, PENDING, TRANSMITTED, REVERSED, VOIDED}. For payments
 * we treat AUTHORIZED/PARTIAL_AUTHORIZED/PENDING as success-after-capture.
 */
function chargeOk(httpStatus: number | null, body: any): boolean {
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) return false;
  const s = body?.status;
  return (
    s === "AUTHORIZED" ||
    s === "AUTHORIZED_PENDING_REVIEW" ||
    s === "PARTIAL_AUTHORIZED" ||
    s === "PENDING"
  );
}
function refundOk(httpStatus: number | null, body: any): boolean {
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) return false;
  const s = body?.status;
  return s === "PENDING" || s === "TRANSMITTED" || s === "ACCEPTED";
}
function voidOk(httpStatus: number | null, body: any): boolean {
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) return false;
  return body?.status === "VOIDED";
}

function extractMessage(httpStatus: number | null, body: any): string {
  if (body?.message) return String(body.message);
  if (body?.errorInformation?.message) return String(body.errorInformation.message);
  if (body?.errorInformation?.reason) return String(body.errorInformation.reason);
  if (body?.reason) return String(body.reason);
  if (httpStatus) return `HTTP ${httpStatus}`;
  return "no response";
}
function extractFailureCode(body: any): string | null {
  return (
    body?.errorInformation?.reason ??
    body?.reason ??
    body?.errorCode ??
    null
  );
}

class CybersourceAdapter implements PaymentProviderAdapter {
  readonly provider = "CYBERSOURCE" as const;

  async getStatus(): Promise<ProviderStatus> {
    const blockers: string[] = [];
    if (!isEncryptionAvailable()) {
      blockers.push("APP_ENCRYPTION_KEY missing — cannot decrypt Cybersource credentials");
      return {
        provider: this.provider,
        configured: false,
        enabled: false,
        environment: null,
        source: null,
        checkoutEligible: false,
        blockers,
      };
    }
    const cred = await prisma.cybersourceGatewayCredential
      .findUnique({ where: { provider: "CYBERSOURCE" } })
      .catch(() => null);
    if (
      !cred ||
      !cred.merchantIdEncrypted ||
      !cred.keyIdEncrypted ||
      !cred.sharedSecretEncrypted
    ) {
      blockers.push("Cybersource credentials not saved");
      return {
        provider: this.provider,
        configured: false,
        enabled: false,
        environment: null,
        source: null,
        checkoutEligible: false,
        blockers,
      };
    }
    let decryptable = false;
    try {
      decryptSecret(cred.merchantIdEncrypted);
      decryptSecret(cred.keyIdEncrypted);
      decryptSecret(cred.sharedSecretEncrypted);
      decryptable = true;
    } catch {
      blockers.push("Cybersource credentials cannot be decrypted with the current APP_ENCRYPTION_KEY");
    }
    const enabled = !!cred.enabled;
    if (decryptable && !enabled)
      blockers.push("Cybersource is configured but disabled");
    return {
      provider: this.provider,
      configured: decryptable,
      enabled,
      environment: cred.environment === "production" ? "production" : "test",
      source: "db",
      checkoutEligible: decryptable && enabled,
      blockers,
    };
  }

  async testConnection() {
    try {
      const r = await testCybersourceConnection();
      return { ok: r.ok, message: r.message, status: r.status };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Cybersource test failed", status: null };
    }
  }

  async charge(input: NormalizedChargeInput): Promise<NormalizedChargeResult> {
    const inst = input.instrument;
    if (!inst.cybersourceTransientToken && !inst.cybersourceCard) {
      return {
        ok: false,
        provider: this.provider,
        transactionId: null,
        referenceId: null,
        authCode: null,
        responseCode: null,
        message: "Cybersource requires cybersourceTransientToken or cybersourceCard",
        rawSafeResponse: null,
        failureCode: "BAD_INSTRUMENT",
        failureMessage: "Cybersource requires cybersourceTransientToken or cybersourceCard",
      };
    }
    let result;
    try {
      result = await cybersourceCharge({
        amount: centsToAmount(input.amountCents),
        currency: input.currency || "USD",
        invoiceNumber: input.invoiceNumber,
        customerEmail: input.customerEmail ?? null,
        billing: input.billing,
        transientToken: inst.cybersourceTransientToken,
        card: inst.cybersourceCard,
      });
    } catch (e: any) {
      return {
        ok: false,
        provider: this.provider,
        transactionId: null,
        referenceId: null,
        authCode: null,
        responseCode: null,
        message: e?.message || "Cybersource charge failed",
        rawSafeResponse: null,
        failureCode: "ADAPTER_ERROR",
        failureMessage: e?.message || "Cybersource charge failed",
      };
    }
    const ok = chargeOk(result.httpStatus, result.body);
    return {
      ok,
      provider: this.provider,
      transactionId: result.body?.id ?? null,
      referenceId:
        result.body?.clientReferenceInformation?.code ??
        result.body?.reconciliationId ??
        null,
      authCode:
        result.body?.processorInformation?.approvalCode ??
        result.body?.processorInformation?.authIndicator ??
        null,
      responseCode:
        result.body?.processorInformation?.responseCode ??
        String(result.httpStatus ?? ""),
      message: extractMessage(result.httpStatus, result.body),
      rawSafeResponse: safeTruncate(result.body),
      failureCode: ok ? null : extractFailureCode(result.body) ?? (result.networkError ? "NETWORK" : null),
      failureMessage: ok ? null : extractMessage(result.httpStatus, result.body),
    };
  }

  async refund(input: NormalizedRefundInput): Promise<NormalizedRefundResult> {
    let result;
    try {
      result = await cybersourceRefund({
        originalTransactionId: input.originalTransactionId,
        amount: centsToAmount(input.amountCents),
        currency: input.currency || "USD",
      });
    } catch (e: any) {
      return {
        ok: false,
        provider: this.provider,
        refundTransactionId: null,
        originalTransactionId: input.originalTransactionId,
        amountCents: input.amountCents,
        message: e?.message || "Cybersource refund failed",
        failureCode: "ADAPTER_ERROR",
        failureMessage: e?.message || "Cybersource refund failed",
        rawSafeResponse: null,
      };
    }
    const ok = refundOk(result.httpStatus, result.body);
    return {
      ok,
      provider: this.provider,
      refundTransactionId: result.body?.id ?? null,
      originalTransactionId: input.originalTransactionId,
      amountCents: input.amountCents,
      message: extractMessage(result.httpStatus, result.body),
      failureCode: ok ? null : extractFailureCode(result.body),
      failureMessage: ok ? null : extractMessage(result.httpStatus, result.body),
      rawSafeResponse: safeTruncate(result.body),
    };
  }

  async voidPayment(input: NormalizedVoidInput): Promise<NormalizedVoidResult> {
    let result;
    try {
      result = await cybersourceVoid({
        originalTransactionId: input.originalTransactionId,
      });
    } catch (e: any) {
      return {
        ok: false,
        provider: this.provider,
        voidTransactionId: null,
        originalTransactionId: input.originalTransactionId,
        message: e?.message || "Cybersource void failed",
        failureCode: "ADAPTER_ERROR",
        failureMessage: e?.message || "Cybersource void failed",
        rawSafeResponse: null,
      };
    }
    const ok = voidOk(result.httpStatus, result.body);
    return {
      ok,
      provider: this.provider,
      voidTransactionId: result.body?.id ?? null,
      originalTransactionId: input.originalTransactionId,
      message: extractMessage(result.httpStatus, result.body),
      failureCode: ok ? null : extractFailureCode(result.body),
      failureMessage: ok ? null : extractMessage(result.httpStatus, result.body),
      rawSafeResponse: safeTruncate(result.body),
    };
  }
}

export const cybersourceAdapter = new CybersourceAdapter();
