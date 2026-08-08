import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { createTransactionCapture } from "@/server/authorizeNet/client";
import { createCommissionIfAttributed } from "@/server/commerce/commissions";
import { releaseCapacity } from "@/server/commerce/capacity";
import { safeEnqueue } from "@/server/queue/queue";

const Body = z.object({
  intentId: z.string(), // orderId
  opaqueData: z.object({ dataDescriptor: z.string(), dataValue: z.string() }),
});

function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function POST(req: Request) {
  const { userId } = await requireSession();
  const body = Body.parse(await req.json());

  const order = await prisma.order.findUnique({
    where: { id: body.intentId },
    include: { session: true, series: true, lineItems: true },
  });
  if (!order || order.userId !== userId) {
    return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "PENDING") {
    return NextResponse.json({ ok: false, error: "Order not pending" }, { status: 400 });
  }

  // Capture payment with Authorize.net
  const amount = centsToAmount(order.totalCents);
  const invoiceNumber = order.id.slice(-12);
  const qtyTotal = order.lineItems.reduce((s, li) => s + li.qty, 0);

  let response;
  try {
    response = await createTransactionCapture({
      amount,
      opaqueData: body.opaqueData,
      invoiceNumber,
    });
  } catch (err) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await prisma.payment.upsert({
      where: { orderId: order.id },
      update: { status: "FAILED" },
      create: {
        orderId: order.id,
        status: "FAILED",
        amountCents: order.totalCents,
        currency: order.currency,
      },
    });
    await releaseCapacity(order.sessionId, qtyTotal);
    console.error("[checkout/confirm] payment capture threw", { orderId: order.id, err });
    return NextResponse.json({ ok: false, error: "Payment failed" }, { status: 502 });
  }

  const result = response?.transactionResponse;
  const ok = result?.responseCode === "1";

  if (!ok) {
    // Mark failed and release the reserved seats so failed card attempts do
    // not gradually sell out the event.
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await prisma.payment.upsert({
      where: { orderId: order.id },
      update: { status: "FAILED" },
      create: { orderId: order.id, status: "FAILED", amountCents: order.totalCents, currency: order.currency },
    });
    await releaseCapacity(order.sessionId, qtyTotal);
    return NextResponse.json({ ok: false, error: "Payment failed", data: response }, { status: 402 });
  }

  // Mark paid, create tickets, payment record
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
    await tx.payment.upsert({
      where: { orderId: order.id },
      update: { status: "SUCCEEDED", authNetTransId: result?.transId, authNetRefId: response?.refId },
      create: { orderId: order.id, status: "SUCCEEDED", amountCents: order.totalCents, currency: order.currency, authNetTransId: result?.transId, authNetRefId: response?.refId },
    });

    // Create tickets (1 per qty)
    const codes: string[] = [];
    for (let i=0;i<qtyTotal;i++) {
      codes.push(`T-${order.id.slice(0,6)}-${Math.random().toString(36).slice(2,8).toUpperCase()}`);
    }
    await tx.ticket.createMany({
      data: codes.map(code => ({ orderId: order.id, userId: order.userId, sessionId: order.sessionId, code })),
    });
  });

  // Commission ledger automation
  await createCommissionIfAttributed(order.id);

  // Background jobs — uses BullMQ when REDIS_URL is set, otherwise executes inline
  await safeEnqueue("send_order_email", { orderId: order.id });
  await safeEnqueue("post_payment_event", { orderId: order.id });

  return NextResponse.json({ ok: true, data: { orderId: order.id, transId: result?.transId } });
}
