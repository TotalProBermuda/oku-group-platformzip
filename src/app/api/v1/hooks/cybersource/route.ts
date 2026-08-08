/**
 * Cybersource Webhook Endpoint (Payments P215)
 *
 * Receives server-to-server event notifications from Cybersource (payment
 * status changes: authorized, captured, voided, reversed, etc.) and
 * advances the matching PaymentIntent accordingly.
 *
 * Security:
 *   - HMAC-SHA256 signature verification is MANDATORY in ALL environments.
 *     If CYBERSOURCE_WEBHOOK_SECRET is not configured the endpoint returns 503
 *     (not 401) so that misconfigured deployments fail closed and do not
 *     silently accept unsigned requests during development.
 *   - Requests with an invalid or missing signature return 401 to avoid
 *     leaking schema information.
 *   - Raw body is read before any parsing to guarantee signature coverage.
 *
 * Idempotency:
 *   - Each (cybersourceTransactionId, eventType) pair is deduplicated via
 *     the LedgerEvent unique index. Duplicate webhook deliveries increment
 *     the duplicateCount counter and return 200 (not an error).
 *
 * NOTE: This endpoint requires a configured Cybersource Notification URL
 * pointing to this route, plus CYBERSOURCE_WEBHOOK_SECRET set to the shared
 * secret from the Cybersource Business Center notification settings.
 * The endpoint will return 503 until the secret is configured.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { enqueueLedgerEvent } from "@/server/services/ledger/ledgerOutboxService";

export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.CYBERSOURCE_WEBHOOK_SECRET;

/**
 * Verify the Cybersource HMAC-SHA256 signature.
 * Returns false if the secret is not configured (fail-closed in all envs).
 */
function verifySignature(rawBody: Buffer, signatureHeader: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    // Fail closed — never accept unsigned requests regardless of environment.
    return false;
  }
  if (!signatureHeader) return false;

  // Cybersource may send: "sha256=<hex>" or just "<hex>"
  const hex = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hex, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/** Map Cybersource webhook eventType strings to our ledger types */
function mapLedgerEventType(csEventType: string): string | null {
  switch (csEventType) {
    case "payments.payments.authorized":
    case "payments.payments.authorized_pending_review":
      return "PAYMENT_AUTHORIZED";
    case "payments.payments.captured":
    case "payments.payments.transmitted":
      return "PAYMENT_CAPTURED";
    case "payments.payments.failed":
    case "payments.payments.declined":
      return "PAYMENT_FAILED";
    case "payments.payments.voided":
    case "payments.payments.reversed":
      return "PAYMENT_VOIDED";
    case "payments.payments.refund":
    case "payments.payments.refunded":
      return "PAYMENT_REFUNDED";
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  // 1. Fail immediately if the secret is not configured.
  //    This ensures a misconfigured deployment cannot accept unsigned requests.
  if (!WEBHOOK_SECRET) {
    console.error(
      "[cybersource-webhook] CYBERSOURCE_WEBHOOK_SECRET is not set — " +
        "refusing all requests until the secret is configured",
    );
    return NextResponse.json(
      {
        error:
          "Webhook endpoint not configured. Set CYBERSOURCE_WEBHOOK_SECRET to enable.",
      },
      { status: 503 },
    );
  }

  // 2. Read raw body for signature verification BEFORE any parsing
  let rawBody: Buffer;
  try {
    const arrayBuf = await req.arrayBuffer();
    rawBody = Buffer.from(arrayBuf);
  } catch {
    return NextResponse.json({ error: "Could not read request body" }, { status: 400 });
  }

  // 3. Verify signature
  const sigHeader =
    req.headers.get("v-c-signature") ??
    req.headers.get("x-cybersource-signature") ??
    req.headers.get("signature") ??
    null;

  if (!verifySignature(rawBody, sigHeader)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 4. Parse body
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 5. Extract key fields
  const csEventType: string = payload?.eventType ?? payload?.type ?? "";
  const csTransactionId: string =
    payload?.payload?.id ??
    payload?.data?.object?.id ??
    payload?.id ??
    "";
  const csStatus: string =
    payload?.payload?.status ??
    payload?.data?.object?.status ??
    "";

  if (!csTransactionId) {
    // Not actionable — return 200 so Cybersource stops retrying
    return NextResponse.json({ ok: true, skipped: "no_transaction_id" });
  }

  const mappedLedgerType = mapLedgerEventType(csEventType);

  // 6. Find matching PaymentIntent by Cybersource transaction ID
  const intent = await prisma.paymentIntent.findFirst({
    where: { cybersourceTransactionId: csTransactionId },
  });

  if (!intent) {
    // Could be for a non-deposit payment (ticket checkout) — not actionable here
    return NextResponse.json({ ok: true, skipped: "intent_not_found" });
  }

  // 7. Deduplicate via LedgerEvent outbox idempotency key
  const idempotencyKey = `webhook:cybersource:${csTransactionId}:${csEventType || csStatus}`;

  try {
    await enqueueLedgerEvent(prisma, {
      eventType: (mappedLedgerType ?? "PAYMENT_AUTHORIZED") as any,
      source: {
        system: "cybersource_webhook",
        connector: "cybersource_v2",
        recordId: csTransactionId,
      },
      confidenceClass: "VERIFIED_POS_EVENT",
      idempotencyKey,
      paymentIntentId: intent.id,
      reservationId: intent.reservationId ?? undefined,
      payload: {
        cybersourceEventType: csEventType,
        cybersourceTransactionId: csTransactionId,
        cybersourceStatus: csStatus,
      },
    });
  } catch (err: any) {
    // P2002 = duplicate — treat as idempotent success
    if (err?.code !== "P2002") {
      console.error("[cybersource-webhook] ledger enqueue failed", err);
    }
  }

  // 8. Advance intent status based on event type (if not already in terminal state)
  // Note: these service calls are advisory (best-effort). The durable state is the
  // PaymentIntent row; any failure here is logged and the webhook returns 200 so
  // Cybersource does not retry (re-delivery is deduplicated via the ledger outbox).
  const terminalStatuses = ["CAPTURED", "REFUNDED", "CANCELLED"];
  if (!terminalStatuses.includes(intent.status)) {
    try {
      if (
        csEventType.includes("captured") ||
        csEventType.includes("transmitted")
      ) {
        if (intent.status === "AUTHORIZED") {
          await prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { status: "CAPTURED" },
          });
        }
      } else if (
        csEventType.includes("voided") ||
        csEventType.includes("reversed")
      ) {
        if (intent.status === "AUTHORIZED") {
          await prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { status: "CANCELLED" },
          });
        }
      } else if (csEventType.includes("refund")) {
        if (intent.status === "CAPTURED") {
          await prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { status: "REFUNDED" },
          });
        }
      }
    } catch (err) {
      console.error("[cybersource-webhook] intent status advance failed", err);
    }
  }

  return NextResponse.json({ ok: true, intentId: intent.id });
}
