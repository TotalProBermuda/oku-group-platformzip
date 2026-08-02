import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getProviderAdapterSafe } from "@/server/payments/providers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:orders:write");
    const { id } = await params;

    const order = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: { payment: true },
    });

    if (order.status === "CANCELLED") {
      return NextResponse.json(
        { ok: false, error: "Order is already cancelled" },
        { status: 400 }
      );
    }

    // Unpaid order — safe to cancel without touching the gateway.
    if (order.status !== "PAID") {
      const updated = await prisma.order.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      await prisma.orderEvent
        .create({
          data: {
            orderId: id,
            eventType: "ORDER_CANCELLED",
            eventLabel: "Order cancelled (no payment)",
            eventPayload: { previousStatus: order.status },
            performedBy: userId,
          },
        })
        .catch(() => {});
      return NextResponse.json({ ok: true, data: updated });
    }

    // Paid order — Payments P5: route void by Payment.provider, never by
    // active checkout gateway. DEMO is blocked.
    if (!order.payment) {
      return NextResponse.json(
        { ok: false, error: "Cannot cancel a paid order without a payment record." },
        { status: 400 }
      );
    }
    if (order.payment.provider === "DEMO") {
      return NextResponse.json(
        { ok: false, error: "Demo payments cannot be voided through the gateway." },
        { status: 400 }
      );
    }
    const adapter = getProviderAdapterSafe(order.payment.provider);
    if (!adapter) {
      return NextResponse.json(
        { ok: false, error: `No void adapter for provider ${order.payment.provider}` },
        { status: 400 }
      );
    }
    const refTransId =
      order.payment.gatewayTransactionId ?? order.payment.authNetTransId ?? null;
    if (!refTransId) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot void: original ${adapter.provider} transaction id is missing. Use the refund flow instead.`,
        },
        { status: 400 }
      );
    }

    const result = await adapter.voidPayment({
      originalTransactionId: refTransId,
      orderId: order.id,
    });

    if (!result.ok) {
      await prisma.auditLog
        .create({
          data: {
            actorId: userId,
            action: "order.void.failed",
            metadata: {
              orderId: order.id,
              paymentId: order.payment.id,
              provider: adapter.provider,
              refTransId,
              gatewayErrorCode: result.failureCode,
              gatewayErrorMessage: result.failureMessage,
              gatewayResponse: (result.rawSafeResponse as object) ?? null,
              hint:
                "If the original transaction has already settled, void is no longer possible — issue a refund instead.",
              timestamp: new Date().toISOString(),
            },
          },
        })
        .catch(() => {});
      return NextResponse.json(
        {
          ok: false,
          error: result.failureMessage ?? "Void failed at gateway",
          gateway: { provider: adapter.provider, code: result.failureCode, message: result.failureMessage },
        },
        { status: 502 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      await tx.payment.update({
        where: { orderId: id },
        data: { status: "VOIDED" },
      });
      await tx.orderEvent.create({
        data: {
          orderId: id,
          eventType: "ORDER_CANCELLED",
          eventLabel: "Order cancelled (payment voided)",
          eventPayload: {
            provider: adapter.provider,
            previousStatus: order.status,
            refTransId,
            gatewayVoidTransId: result.voidTransactionId,
          },
          performedBy: userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "order.void.succeeded",
          metadata: {
            orderId: order.id,
            paymentId: order.payment!.id,
            provider: adapter.provider,
            refTransId,
            gatewayVoidTransId: result.voidTransactionId,
            timestamp: new Date().toISOString(),
          },
        },
      });
      return o;
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
