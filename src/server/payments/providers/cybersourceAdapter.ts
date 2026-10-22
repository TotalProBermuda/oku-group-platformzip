/**
 * Payments P5 — Cybersource adapter.
 *
 * Implements `PaymentProviderAdapter` using the signed REST endpoints in
 * `src/server/cybersource/transactions.ts`.
 */
import { prisma } from "@/lib/prisma";
import { classifyCharge } from "./chargeOutcome";
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
  asRecord,
  errorMessage,
  safeTruncate,
} from "./types";

function centsToAmount(c: number): string {
  return (c / 100).toFixed(2);
}

/** Refund acceptance is distinct from settlement; reconciliation remains required. */
function refundOk(httpStatus: number | null, body: unknown): boolean {
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) return false;
  const s = asRecord(body)?.status;
  return s === "PENDING" || s === "TRANSMITTED" || s === "ACCEPTED";
}
function voidOk(httpStatus: number | null, body: unknown): boolean {
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) return false;
  return asRecord(body)?.status === "VOIDED";
}

function extractMessage(httpStatus: number | null, body: unknown): string {
  const record = asRecord(body);
  const errorInformation = asRecord(record?.errorInformation);
  if (record?.message) return String(record.message);
  if (errorInformation?.message) return String(errorInformation.message);
  if (errorInformation?.reason) return String(errorInformation.reason);
  if (record?.reason) return String(record.reason);
  if (httpStatus) return `HTTP ${httpStatus}`;
  return "no response";
}
function extractFailureCode(body: unknown): string | null {
  const record = asRecord(body);
  const errorInformation = asRecord(record?.errorInformation);
  const value = errorInformation?.reason ?? record?.reason ?? record?.errorCode;
  return typeof value === "string" ? value : null;
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
    } catch (error: unknown) {
      return { ok: false, message: errorMessage(error, "Cybersource test failed"), status: null };
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
        transactionId: input.orderId,
        customerEmail: input.customerEmail ?? null,
        billing: input.billing,
        payerAuthentication: input.payerAuthentication,
        transientToken: inst.cybersourceTransientToken,
        card: inst.cybersourceCard,
      });
    } catch (error: unknown) {
      const message = errorMessage(error, "Cybersource charge failed");
      return {
        ok: false,
        provider: this.provider,
        transactionId: null,
        referenceId: null,
        authCode: null,
        responseCode: null,
        message,
        rawSafeResponse: null,
        failureCode: "ADAPTER_ERROR",
        failureMessage: message,
      };
    }
    const body = asRecord(result.body);
    const clientReferenceInformation = asRecord(body?.clientReferenceInformation);
    const processorInformation = asRecord(body?.processorInformation);
    const outcome = classifyCharge(result.httpStatus, {
      status: typeof body?.status === "string" ? body.status : undefined,
      id: typeof body?.id === "string" ? body.id : undefined,
    });
    const ok = outcome === "approved";
    return {
      ok,
      provider: this.provider,
      transactionId: typeof body?.id === "string" ? body.id : null,
      referenceId:
        (typeof clientReferenceInformation?.code === "string" ? clientReferenceInformation.code : null) ??
        (typeof body?.reconciliationId === "string" ? body.reconciliationId : null) ??
        null,
      authCode:
        (typeof processorInformation?.approvalCode === "string" ? processorInformation.approvalCode : null) ??
        (typeof processorInformation?.authIndicator === "string" ? processorInformation.authIndicator : null) ??
        null,
      responseCode:
        (typeof processorInformation?.responseCode === "string" ? processorInformation.responseCode : null) ??
        String(result.httpStatus ?? ""),
      message: extractMessage(result.httpStatus, result.body),
      rawSafeResponse: safeTruncate(result.body),
      failureCode: ok ? null : outcome === "review" ? "PAYMENT_REVIEW_REQUIRED" : extractFailureCode(result.body) ?? (result.networkError ? "NETWORK" : null),
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
    } catch (error: unknown) {
      const message = errorMessage(error, "Cybersource refund failed");
      return {
        ok: false,
        provider: this.provider,
        refundTransactionId: null,
        originalTransactionId: input.originalTransactionId,
        amountCents: input.amountCents,
        message,
        failureCode: "ADAPTER_ERROR",
        failureMessage: message,
        rawSafeResponse: null,
      };
    }
    const body = asRecord(result.body);
    const ok = refundOk(result.httpStatus, result.body);
    return {
      ok,
      provider: this.provider,
      refundTransactionId: typeof body?.id === "string" ? body.id : null,
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
    } catch (error: unknown) {
      const message = errorMessage(error, "Cybersource void failed");
      return {
        ok: false,
        provider: this.provider,
        voidTransactionId: null,
        originalTransactionId: input.originalTransactionId,
        message,
        failureCode: "ADAPTER_ERROR",
        failureMessage: message,
        rawSafeResponse: null,
      };
    }
    const body = asRecord(result.body);
    const ok = voidOk(result.httpStatus, result.body);
    return {
      ok,
      provider: this.provider,
      voidTransactionId: typeof body?.id === "string" ? body.id : null,
      originalTransactionId: input.originalTransactionId,
      message: extractMessage(result.httpStatus, result.body),
      failureCode: ok ? null : extractFailureCode(result.body),
      failureMessage: ok ? null : extractMessage(result.httpStatus, result.body),
      rawSafeResponse: safeTruncate(result.body),
    };
  }
}

export const cybersourceAdapter = new CybersourceAdapter();
