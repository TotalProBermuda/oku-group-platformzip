/**
 * Reservation Payment Service (Payments P215)
 *
 * Manages the lifecycle of PaymentIntent + PaymentAttempt rows for
 * reservation deposits. This is a server-only module — never import from
 * client components.
 *
 * Flow:
 *   1. `createPaymentIntent`   — called when a space requires a deposit
 *   2. `authorizePayment`      — authorize-only call (no immediate capture)
 *   3. `capturePayment`        — capture after host confirms the reservation
 *   4. `voidPayment`           — void an authorized-but-uncaptured intent
 *   5. `refundPayment`         — refund a captured intent (full or partial)
 *   6. `getPaymentStatus`      — return current intent + latest attempt
 *   7. `normalizeCybersourceError` — translate Cybersource error body to user message
 *
 * Idempotency:
 *   - `createPaymentIntent` is idempotent on `idempotencyKey`.
 *   - `authorizePayment` / `capturePayment` create a new `PaymentAttempt`
 *     row on each call so retries are fully auditable. The caller's idempotency
 *     key gates the *intent* not the attempt.
 */
import { prisma } from "@/lib/prisma";
import type { PaymentIntentStatus, PaymentAttemptStatus } from "@prisma/client";
import {
  cybersourceAuthorize,
  cybersourceCapture,
  type CybersourceAuthorizeInput,
} from "@/server/cybersource/authorize";
import {
  cybersourceRefund,
  cybersourceVoid,
} from "@/server/cybersource/transactions";
import { safeTruncate } from "@/server/payments/providers/types";
import { enqueueLedgerEvent } from "@/server/services/ledger/ledgerOutboxService";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreatePaymentIntentInput = {
  reservationId: string;
  amountCents: number;
  currency?: string;
  idempotencyKey: string;
  attributionSessionId?: string | null;
};

export type AuthorizePaymentInput = {
  paymentIntentId: string;
  /**
   * Transient JWT from Cybersource Flex / Unified Checkout.
   * This is the ONLY accepted payment credential — the OKÜ server must
   * never receive raw card numbers, expiry dates, or CVV codes.
   */
  transientToken: string;
  customerEmail?: string | null;
  billing?: CybersourceAuthorizeInput["billing"];
};

export type CapturePaymentInput = {
  paymentIntentId: string;
};

export type VoidPaymentInput = {
  paymentIntentId: string;
};

export type RefundPaymentInput = {
  paymentIntentId: string;
  amountCents?: number; // defaults to full amount
};

export type PaymentStatusResult = {
  intent: {
    id: string;
    reservationId: string | null;
    amountCents: number;
    currency: string;
    status: PaymentIntentStatus;
    cybersourceTransactionId: string | null;
    lastFailureCode: string | null;
    lastFailureMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  latestAttempt: {
    id: string;
    status: PaymentAttemptStatus;
    cybersourceTransactionId: string | null;
    failureCode: string | null;
    failureMessage: string | null;
    createdAt: Date;
  } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function centsToAmount(c: number): string {
  return (c / 100).toFixed(2);
}

function authorizeOk(httpStatus: number | null, body: any): boolean {
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) return false;
  const s = body?.status;
  return (
    s === "AUTHORIZED" ||
    s === "AUTHORIZED_PENDING_REVIEW" ||
    s === "PARTIAL_AUTHORIZED"
  );
}

function captureOk(httpStatus: number | null, body: any): boolean {
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) return false;
  const s = body?.status;
  return s === "PENDING" || s === "TRANSMITTED" || s === "ACCEPTED";
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

/**
 * Translate a Cybersource response body + HTTP status into a short user-facing
 * message. Never exposes raw JSON or internal field names.
 */
export function normalizeCybersourceError(
  httpStatus: number | null,
  body: any,
): { code: string; message: string } {
  if (!httpStatus || !body) {
    return { code: "NETWORK_ERROR", message: "Could not contact the payment gateway. Please try again." };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { code: "AUTH_FAILURE", message: "Payment gateway authentication failed. Contact support." };
  }
  const reason =
    body?.errorInformation?.reason ??
    body?.reason ??
    body?.errorCode ??
    null;
  const gatewayMsg =
    body?.errorInformation?.message ??
    body?.message ??
    null;

  if (reason === "PROCESSOR_DECLINED" || reason === "INVALID_DATA") {
    return {
      code: reason,
      message: "Your card was declined. Please check your details or try a different card.",
    };
  }
  if (reason === "INSUFFICIENT_FUND") {
    return { code: reason, message: "Insufficient funds. Please try a different card." };
  }
  if (reason === "CARD_TYPE_NOT_ACCEPTED") {
    return { code: reason, message: "This card type is not accepted." };
  }
  if (reason === "EXPIRED_CARD") {
    return { code: reason, message: "Your card has expired. Please use a different card." };
  }
  return {
    code: reason ?? `HTTP_${httpStatus}`,
    message: gatewayMsg ?? `Payment failed (${httpStatus}). Please try again.`,
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Create (or return existing) a PaymentIntent for a reservation deposit.
 * Idempotent on `idempotencyKey` — safe to call multiple times if the
 * client retries before the reservation is confirmed.
 */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<{ id: string; alreadyExisted: boolean }> {
  const existing = await prisma.paymentIntent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { id: existing.id, alreadyExisted: true };

  const intent = await prisma.paymentIntent.create({
    data: {
      reservationId: input.reservationId,
      amountCents: input.amountCents,
      currency: input.currency ?? "USD",
      idempotencyKey: input.idempotencyKey,
      attributionSessionId: input.attributionSessionId ?? null,
      status: "CREATED",
      provider: "CYBERSOURCE",
      orderType: "RESERVATION_DEPOSIT",
    },
    select: { id: true },
  });

  return { id: intent.id, alreadyExisted: false };
}

/**
 * Authorize a payment — contacts Cybersource, creates a `PaymentAttempt`,
 * and advances the `PaymentIntent` status to AUTHORIZED on success.
 * On failure the intent stays CREATED (or retains its previous status) so
 * the caller may retry with corrected credentials.
 */
export async function authorizePayment(
  input: AuthorizePaymentInput,
): Promise<{
  ok: boolean;
  attemptId: string | null;
  cybersourceTransactionId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}> {
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: input.paymentIntentId },
  });
  if (!intent) throw Object.assign(new Error("PaymentIntent not found"), { status: 404 });
  if (intent.status === "CAPTURED" || intent.status === "REFUNDED") {
    throw Object.assign(
      new Error(`PaymentIntent is already ${intent.status}`),
      { status: 409 },
    );
  }

  const amountStr = centsToAmount(intent.amountCents);

  let callResult;
  try {
    callResult = await cybersourceAuthorize({
      amount: amountStr,
      currency: intent.currency,
      invoiceNumber: intent.id.slice(-12),
      transientToken: input.transientToken,
      customerEmail: input.customerEmail,
      billing: input.billing,
    });
  } catch (e: any) {
    callResult = { httpStatus: null, body: null, networkError: e?.message || "unknown" };
  }

  const ok = authorizeOk(callResult.httpStatus, callResult.body);
  const transactionId = callResult.body?.id ?? null;
  const requestId = callResult.body?.reconciliationId ?? null;
  const authCode =
    callResult.body?.processorInformation?.approvalCode ??
    callResult.body?.processorInformation?.authIndicator ?? null;
  const responseCode =
    callResult.body?.processorInformation?.responseCode ??
    String(callResult.httpStatus ?? "");
  const normalized = ok
    ? { code: null, message: null }
    : normalizeCybersourceError(callResult.httpStatus, callResult.body);

  // Persist attempt
  const attempt = await prisma.paymentAttempt.create({
    data: {
      paymentIntentId: intent.id,
      status: ok ? "AUTHORIZED" : "FAILED",
      amountCents: intent.amountCents,
      currency: intent.currency,
      cybersourceTransactionId: transactionId,
      cybersourceRequestId: requestId,
      cybersourceAuthCode: authCode,
      cybersourceResponseCode: responseCode,
      cybersourceRawSafeJson: safeTruncate(callResult.body) as any,
      failureCode: normalized.code,
      failureMessage: normalized.message,
    },
    select: { id: true },
  });

  // Advance intent
  const newIntentStatus: PaymentIntentStatus = ok ? "AUTHORIZED" : intent.status;
  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: newIntentStatus,
      cybersourceTransactionId: ok ? transactionId : intent.cybersourceTransactionId,
      cybersourceRequestId: ok ? requestId : intent.cybersourceRequestId,
      lastFailureCode: ok ? null : normalized.code,
      lastFailureMessage: ok ? null : normalized.message,
    },
  });

  // Emit ledger event (best-effort)
  const ledgerType = ok ? "PAYMENT_AUTHORIZED" : "PAYMENT_FAILED";
  await enqueueLedgerEvent(prisma, {
    eventType: ledgerType,
    source: { system: "reservation_payment_service", connector: null, recordId: null },
    confidenceClass: ok ? "VERIFIED_POS_EVENT" : "CUSTOMER_CLAIMED_EVENT",
    idempotencyKey: `payment_intent:${intent.id}:attempt:${attempt.id}:${ledgerType}`,
    paymentIntentId: intent.id,
    reservationId: intent.reservationId ?? undefined,
    payload: {
      attemptId: attempt.id,
      amountCents: intent.amountCents,
      currency: intent.currency,
      cybersourceTransactionId: transactionId,
      failureCode: normalized.code,
    },
  }).catch(() => {});

  return {
    ok,
    attemptId: attempt.id,
    cybersourceTransactionId: transactionId,
    failureCode: normalized.code,
    failureMessage: normalized.message,
  };
}

/**
 * Capture a previously authorized payment.
 */
export async function capturePayment(
  input: CapturePaymentInput,
): Promise<{ ok: boolean; failureCode: string | null; failureMessage: string | null }> {
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: input.paymentIntentId },
  });
  if (!intent) throw Object.assign(new Error("PaymentIntent not found"), { status: 404 });
  if (intent.status !== "AUTHORIZED") {
    throw Object.assign(
      new Error(`Cannot capture a payment in status ${intent.status}`),
      { status: 409 },
    );
  }
  if (!intent.cybersourceTransactionId) {
    throw Object.assign(new Error("No transaction ID to capture"), { status: 409 });
  }

  let callResult;
  try {
    callResult = await cybersourceCapture({
      originalTransactionId: intent.cybersourceTransactionId,
      amount: centsToAmount(intent.amountCents),
      currency: intent.currency,
    });
  } catch (e: any) {
    callResult = { httpStatus: null, body: null, networkError: e?.message || "unknown" };
  }

  const ok = captureOk(callResult.httpStatus, callResult.body);
  const normalized = ok
    ? { code: null, message: null }
    : normalizeCybersourceError(callResult.httpStatus, callResult.body);

  await prisma.paymentAttempt.create({
    data: {
      paymentIntentId: intent.id,
      status: ok ? "CAPTURED" : "FAILED",
      amountCents: intent.amountCents,
      currency: intent.currency,
      cybersourceTransactionId: callResult.body?.id ?? intent.cybersourceTransactionId,
      cybersourceResponseCode: String(callResult.httpStatus ?? ""),
      cybersourceRawSafeJson: safeTruncate(callResult.body) as any,
      failureCode: normalized.code,
      failureMessage: normalized.message,
    },
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: ok ? "CAPTURED" : intent.status,
      lastFailureCode: ok ? null : normalized.code,
      lastFailureMessage: ok ? null : normalized.message,
    },
  });

  const ledgerType = ok ? "PAYMENT_CAPTURED" : "PAYMENT_FAILED";
  await enqueueLedgerEvent(prisma, {
    eventType: ledgerType,
    source: { system: "reservation_payment_service", connector: null, recordId: null },
    confidenceClass: "VERIFIED_POS_EVENT",
    idempotencyKey: `payment_intent:${intent.id}:captured`,
    paymentIntentId: intent.id,
    reservationId: intent.reservationId ?? undefined,
    payload: { amountCents: intent.amountCents, ok },
  }).catch(() => {});

  return { ok, failureCode: normalized.code, failureMessage: normalized.message };
}

/**
 * Void an authorized-but-uncaptured payment.
 */
export async function voidPayment(
  input: VoidPaymentInput,
): Promise<{ ok: boolean; failureCode: string | null; failureMessage: string | null }> {
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: input.paymentIntentId },
  });
  if (!intent) throw Object.assign(new Error("PaymentIntent not found"), { status: 404 });
  if (intent.status !== "AUTHORIZED") {
    throw Object.assign(
      new Error(`Cannot void a payment in status ${intent.status}`),
      { status: 409 },
    );
  }
  if (!intent.cybersourceTransactionId) {
    throw Object.assign(new Error("No transaction ID to void"), { status: 409 });
  }

  let callResult;
  try {
    callResult = await cybersourceVoid({ originalTransactionId: intent.cybersourceTransactionId });
  } catch (e: any) {
    callResult = { httpStatus: null, body: null, networkError: e?.message || "unknown" };
  }

  const ok = callResult.httpStatus !== null && callResult.httpStatus >= 200 && callResult.httpStatus < 300;
  const normalized = ok
    ? { code: null, message: null }
    : normalizeCybersourceError(callResult.httpStatus, callResult.body);

  await prisma.paymentAttempt.create({
    data: {
      paymentIntentId: intent.id,
      status: ok ? "VOIDED" : "FAILED",
      amountCents: intent.amountCents,
      currency: intent.currency,
      cybersourceTransactionId: intent.cybersourceTransactionId,
      cybersourceRawSafeJson: safeTruncate(callResult.body) as any,
      failureCode: normalized.code,
      failureMessage: normalized.message,
    },
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: ok ? "CANCELLED" : intent.status,
      lastFailureCode: ok ? null : normalized.code,
      lastFailureMessage: ok ? null : normalized.message,
    },
  });

  await enqueueLedgerEvent(prisma, {
    eventType: "PAYMENT_VOIDED",
    source: { system: "reservation_payment_service", connector: null, recordId: null },
    confidenceClass: "VERIFIED_POS_EVENT",
    idempotencyKey: `payment_intent:${intent.id}:voided`,
    paymentIntentId: intent.id,
    reservationId: intent.reservationId ?? undefined,
    payload: { cybersourceTransactionId: intent.cybersourceTransactionId, ok },
  }).catch(() => {});

  return { ok, failureCode: normalized.code, failureMessage: normalized.message };
}

/**
 * Refund a captured payment (full amount by default; partial supported).
 * Does NOT affect attribution anchors — the referrer credit is kept.
 */
export async function refundPayment(
  input: RefundPaymentInput,
): Promise<{ ok: boolean; failureCode: string | null; failureMessage: string | null }> {
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: input.paymentIntentId },
  });
  if (!intent) throw Object.assign(new Error("PaymentIntent not found"), { status: 404 });
  if (intent.status !== "CAPTURED") {
    throw Object.assign(
      new Error(`Cannot refund a payment in status ${intent.status}`),
      { status: 409 },
    );
  }
  if (!intent.cybersourceTransactionId) {
    throw Object.assign(new Error("No transaction ID to refund"), { status: 409 });
  }

  const refundCents = input.amountCents ?? intent.amountCents;

  let callResult;
  try {
    callResult = await cybersourceRefund({
      originalTransactionId: intent.cybersourceTransactionId,
      amount: centsToAmount(refundCents),
      currency: intent.currency,
    });
  } catch (e: any) {
    callResult = { httpStatus: null, body: null, networkError: e?.message || "unknown" };
  }

  const ok = refundOk(callResult.httpStatus, callResult.body);
  const normalized = ok
    ? { code: null, message: null }
    : normalizeCybersourceError(callResult.httpStatus, callResult.body);

  const isFullRefund = refundCents >= intent.amountCents;

  await prisma.paymentAttempt.create({
    data: {
      paymentIntentId: intent.id,
      status: ok ? "REFUNDED" : "FAILED",
      amountCents: refundCents,
      currency: intent.currency,
      cybersourceTransactionId: callResult.body?.id ?? null,
      cybersourceRawSafeJson: safeTruncate(callResult.body) as any,
      failureCode: normalized.code,
      failureMessage: normalized.message,
    },
  });

  if (ok && isFullRefund) {
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: "REFUNDED" },
    });
  }

  await enqueueLedgerEvent(prisma, {
    eventType: "PAYMENT_REFUNDED",
    source: { system: "reservation_payment_service", connector: null, recordId: null },
    confidenceClass: "VERIFIED_POS_EVENT",
    idempotencyKey: `payment_intent:${intent.id}:refund:${Date.now()}`,
    paymentIntentId: intent.id,
    reservationId: intent.reservationId ?? undefined,
    payload: { refundCents, amountCents: intent.amountCents, ok },
  }).catch(() => {});

  return { ok, failureCode: normalized.code, failureMessage: normalized.message };
}

/**
 * Get current status of a PaymentIntent including its latest attempt.
 */
export async function getPaymentStatus(
  paymentIntentId: string,
): Promise<PaymentStatusResult> {
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      attempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!intent) throw Object.assign(new Error("PaymentIntent not found"), { status: 404 });

  const latest = intent.attempts[0] ?? null;
  return {
    intent: {
      id: intent.id,
      reservationId: intent.reservationId,
      amountCents: intent.amountCents,
      currency: intent.currency,
      status: intent.status,
      cybersourceTransactionId: intent.cybersourceTransactionId,
      lastFailureCode: intent.lastFailureCode,
      lastFailureMessage: intent.lastFailureMessage,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
    },
    latestAttempt: latest
      ? {
          id: latest.id,
          status: latest.status,
          cybersourceTransactionId: latest.cybersourceTransactionId,
          failureCode: latest.failureCode,
          failureMessage: latest.failureMessage,
          createdAt: latest.createdAt,
        }
      : null,
  };
}
