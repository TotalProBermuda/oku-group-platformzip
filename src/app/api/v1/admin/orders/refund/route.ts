import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { reverseCommissionForRefund } from "@/server/commerce/commissions";
import { releaseCapacity } from "@/server/commerce/capacity";
import { getProviderAdapterSafe } from "@/server/payments/providers";

const Body = z.object({
  orderId: z.string(),
  amountCents: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const { userId, roles } = await requireSession();
  requirePermission(roles, "admin:payments:refund");

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof z.ZodError ? "Invalid request body" : "Bad request" },
      { status: 400 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    include: { payment: true, lineItems: true },
  });
  if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

  // Block double-refund.
  if (order.status === "REFUNDED") {
    return NextResponse.json(
      { ok: false, error: "Order is already fully refunded" },
      { status: 409 },
    );
  }

  // Refund amount must not exceed order total.
  if (body.amountCents > order.totalCents) {
    return NextResponse.json(
      { ok: false, error: `Refund amount exceeds order total (${order.totalCents})` },
      { status: 400 },
    );
  }

  if (!order.payment) {
    return NextResponse.json(
      { ok: false, error: "No payment record on this order" },
      { status: 400 },
    );
  }
  if (order.payment.status !== "SUCCEEDED") {
    return NextResponse.json(
      { ok: false, error: `Cannot refund a payment in status ${order.payment.status}` },
      { status: 409 },
    );
  }

  // Payments P5 — route by Payment.provider, NOT by activeCheckoutGateway.
  // Block DEMO. Block missing gateway transaction id. Block adapter unavailable.
  if (order.payment.provider === "DEMO") {
    return NextResponse.json(
      { ok: false, error: "Demo payments cannot be refunded — no gateway transaction" },
      { status: 400 },
    );
  }
  const adapter = getProviderAdapterSafe(order.payment.provider);
  if (!adapter) {
    return NextResponse.json(
      { ok: false, error: `No refund adapter for provider ${order.payment.provider}` },
      { status: 400 },
    );
  }
  // Prefer generic gateway txn id; fall back to legacy authNetTransId.
  const refTransId =
    order.payment.gatewayTransactionId ?? order.payment.authNetTransId ?? null;
  if (!refTransId) {
    return NextResponse.json(
      {
        ok: false,
        error: `Original ${adapter.provider} transaction id is missing — cannot issue gateway refund`,
      },
      { status: 400 },
    );
  }

  // ───── Call provider adapter ─────
  const result = await adapter.refund({
    amountCents: body.amountCents,
    currency: order.currency,
    originalTransactionId: refTransId,
    orderId: order.id,
    reason: body.reason,
  });

  // ───── Failure path: audit + return, do NOT mutate order/payment ─────
  if (!result.ok) {
    await prisma.auditLog
      .create({
        data: {
          actorId: userId,
          action: "order.refund.failed",
          metadata: {
            orderId: order.id,
            paymentId: order.payment.id,
            provider: adapter.provider,
            amountCents: body.amountCents,
            reason: body.reason ?? null,
            refTransId,
            gatewayErrorCode: result.failureCode,
            gatewayErrorMessage: result.failureMessage,
            gatewayResponse: (result.rawSafeResponse as object) ?? null,
            timestamp: new Date().toISOString(),
          },
        },
      })
      .catch(() => {});
    return NextResponse.json(
      {
        ok: false,
        error: result.failureMessage ?? "Refund failed at the gateway",
        gateway: { provider: adapter.provider, code: result.failureCode, message: result.failureMessage },
      },
      { status: 502 },
    );
  }

  // ───── Success path: update DB, then release capacity & reverse commission ─────
  const isFullRefund = body.amountCents >= order.totalCents;
  const newOrderStatus: "REFUNDED" | "PARTIALLY_REFUNDED" = isFullRefund
    ? "REFUNDED"
    : "PARTIALLY_REFUNDED";
  const newPaymentStatus: "REFUNDED" | "SUCCEEDED" = isFullRefund ? "REFUNDED" : "SUCCEEDED";
  const isAuthNet = adapter.provider === "AUTHORIZE_NET";

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: newOrderStatus,
        cancelledAt: isFullRefund ? new Date() : order.cancelledAt,
      },
    });
    await tx.payment.update({
      where: { orderId: order.id },
      data: {
        status: newPaymentStatus,
        gatewayReferenceId:
          result.refundTransactionId ?? order.payment!.gatewayReferenceId,
        ...(isAuthNet
          ? {
              authNetRefId:
                result.refundTransactionId ?? order.payment!.authNetRefId,
            }
          : {}),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        eventType: "ORDER_REFUNDED",
        eventLabel: isFullRefund ? "Order refunded (full)" : "Order partially refunded",
        eventPayload: {
          provider: adapter.provider,
          amountCents: body.amountCents,
          totalCents: order.totalCents,
          reason: body.reason ?? null,
          refTransId,
          gatewayRefundTransId: result.refundTransactionId,
        },
        performedBy: userId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "order.refund.succeeded",
        metadata: {
          orderId: order.id,
          paymentId: order.payment!.id,
          provider: adapter.provider,
          amountCents: body.amountCents,
          isFullRefund,
          reason: body.reason ?? null,
          refTransId,
          gatewayRefundTransId: result.refundTransactionId,
          gatewayResponse: (result.rawSafeResponse as object) ?? null,
          timestamp: new Date().toISOString(),
        },
      },
    });
  });

  if (isFullRefund) {
    const qtyTotal = order.lineItems.reduce((s, li) => s + li.qty, 0);
    try {
      await releaseCapacity(order.sessionId, qtyTotal);
    } catch (err) {
      await prisma.auditLog
        .create({
          data: {
            actorId: userId,
            action: "order.refund.postprocess.capacity_failed",
            metadata: {
              orderId: order.id,
              sessionId: order.sessionId,
              qty: qtyTotal,
              error: err instanceof Error ? err.message : String(err),
            },
          },
        })
        .catch(() => {});
    }

    try {
      await reverseCommissionForRefund(order.id);
    } catch (err) {
      await prisma.auditLog
        .create({
          data: {
            actorId: userId,
            action: "order.refund.postprocess.commission_failed",
            metadata: {
              orderId: order.id,
              error: err instanceof Error ? err.message : String(err),
            },
          },
        })
        .catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      orderId: order.id,
      provider: adapter.provider,
      refundedCents: body.amountCents,
      isFullRefund,
      gatewayRefundTransId: result.refundTransactionId,
      orderStatus: newOrderStatus,
      paymentStatus: newPaymentStatus,
    },
  });
}
