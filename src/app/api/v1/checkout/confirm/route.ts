import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { createCommissionIfAttributed } from "@/server/commerce/commissions";
import { releaseCapacity } from "@/server/commerce/capacity";
import { safeEnqueue } from "@/server/queue/queue";
import { writeTicketAttributionSession } from "@/server/events/eventReferrerService";
import { assertActiveGatewayReady } from "@/server/payments/activeGateway";
import { getActiveCheckoutAdapter } from "@/server/payments/providers";
import type { PaymentInstrument } from "@/server/payments/providers/types";

// Payments P5 — accept either Authorize.net Accept.js opaqueData or a
// Cybersource Flex transient token (or sandbox raw card). The active
// checkout gateway decides which one is consumed.
const Body = z.object({
  intentId: z.string(), // orderId
  opaqueData: z
    .object({ dataDescriptor: z.string(), dataValue: z.string() })
    .optional(),
  cybersourceTransientToken: z.string().optional(),
  cybersourceCard: z
    .object({
      number: z.string(),
      expirationMonth: z.string(),
      expirationYear: z.string(),
      securityCode: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const { userId } = await requireSession();
  const body = Body.parse(await req.json());

  // Payments P4 — block checkout when the active gateway isn't ready.
  const guard = await assertActiveGatewayReady();
  if (guard) {
    return NextResponse.json(
      { ok: false, error: guard.error, data: { provider: guard.provider } },
      { status: guard.status },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: body.intentId },
    include: { session: true, series: true, lineItems: true, user: true },
  });
  if (!order || order.userId !== userId) {
    return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "PENDING") {
    return NextResponse.json({ ok: false, error: "Order not pending" }, { status: 400 });
  }

  const invoiceNumber = order.id.slice(-12);
  const qtyTotal = order.lineItems.reduce((s, li) => s + li.qty, 0);

  const { adapter, provider } = await getActiveCheckoutAdapter();
  const instrument: PaymentInstrument = {
    authNetOpaqueData: body.opaqueData,
    cybersourceTransientToken: body.cybersourceTransientToken,
    cybersourceCard: body.cybersourceCard,
  };

  const result = await adapter.charge({
    amountCents: order.totalCents,
    currency: order.currency,
    invoiceNumber,
    orderId: order.id,
    customerEmail: order.user?.email ?? null,
    customerName: order.user?.name ?? null,
    instrument,
  });

  if (!result.ok) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await prisma.payment.upsert({
      where: { orderId: order.id },
      update: {
        status: "FAILED",
        provider,
        gatewayResponseCode: result.responseCode,
        gatewayRawSafeJson: (result.rawSafeResponse ?? null) as any,
      },
      create: {
        orderId: order.id,
        status: "FAILED",
        provider,
        amountCents: order.totalCents,
        currency: order.currency,
        gatewayResponseCode: result.responseCode,
        gatewayRawSafeJson: (result.rawSafeResponse ?? null) as any,
      },
    });
    await releaseCapacity(order.sessionId, qtyTotal);
    await prisma.auditLog
      .create({
        data: {
          actorId: userId,
          action: "checkout.charge.failed",
          metadata: {
            orderId: order.id,
            provider,
            failureCode: result.failureCode,
            failureMessage: result.failureMessage,
            timestamp: new Date().toISOString(),
          },
        },
      })
      .catch(() => {});
    return NextResponse.json(
      {
        ok: false,
        error: result.failureMessage ?? "Payment failed",
        data: { provider, code: result.failureCode },
      },
      { status: 402 },
    );
  }

  // Mark paid, create tickets, payment record. Persist generic gateway fields
  // for both providers AND legacy authNet* for Authorize.net (for backward
  // compatibility with refund/void code paths that still read them).
  const isAuthNet = provider === "AUTHORIZE_NET";
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await tx.payment.upsert({
      where: { orderId: order.id },
      update: {
        status: "SUCCEEDED",
        provider,
        gatewayTransactionId: result.transactionId,
        gatewayReferenceId: result.referenceId,
        gatewayAuthCode: result.authCode,
        gatewayResponseCode: result.responseCode,
        gatewayRawSafeJson: (result.rawSafeResponse ?? null) as any,
        ...(isAuthNet
          ? {
              authNetTransId: result.transactionId,
              authNetRefId: result.referenceId,
            }
          : {}),
      },
      create: {
        orderId: order.id,
        status: "SUCCEEDED",
        provider,
        amountCents: order.totalCents,
        currency: order.currency,
        gatewayTransactionId: result.transactionId,
        gatewayReferenceId: result.referenceId,
        gatewayAuthCode: result.authCode,
        gatewayResponseCode: result.responseCode,
        gatewayRawSafeJson: (result.rawSafeResponse ?? null) as any,
        ...(isAuthNet
          ? {
              authNetTransId: result.transactionId,
              authNetRefId: result.referenceId,
            }
          : {}),
      },
    });

    // Create tickets (1 per qty)
    const codes: string[] = [];
    for (let i = 0; i < qtyTotal; i++) {
      codes.push(
        `T-${order.id.slice(0, 6)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      );
    }
    await tx.ticket.createMany({
      data: codes.map((code) => ({
        orderId: order.id,
        userId: order.userId,
        sessionId: order.sessionId,
        code,
        attendeeName: order.user.name,
        attendeeEmail: order.user.email.trim().toLowerCase(),
        attendeeEmailNormalized: order.user.email.trim().toLowerCase(),
      })),
    });
  });

  // Commission ledger automation
  await createCommissionIfAttributed(order.id);

  // Step 1 of ticket-referrer convergence: write an AttributionSession row
  // so this purchase appears in the shared getMyReferrals feed alongside
  // walk-in commissions. Errors are non-fatal — a missing session never
  // blocks the buyer from receiving their tickets — but failures are
  // explicitly logged to AuditLog so attribution gaps are detectable and
  // actionable (backfill, retry, or ops review).
  await writeTicketAttributionSession(order.id).catch(async (err: unknown) => {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: "system:ticket-attribution",
          action: "ticket.attribution.session_write_failed",
          metadata: {
            orderId: order.id,
            errorMessage: err instanceof Error ? err.message : String(err),
          } as object,
        },
      });
    } catch {
      // Best-effort — never throw from the catch handler.
    }
  });

  // Background jobs — uses BullMQ when REDIS_URL is set, otherwise inline
  await safeEnqueue("send_order_email", { orderId: order.id });
  await safeEnqueue("post_payment_event", { orderId: order.id });

  return NextResponse.json({
    ok: true,
    data: {
      orderId: order.id,
      provider,
      transId: result.transactionId,
    },
  });
}
