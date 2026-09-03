import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getOptionalSession } from "@/server/auth/session";

export async function GET(_req: NextRequest) {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    include: {
      series: { select: { title: true, slug: true, venue: true } },
      session: { select: { title: true, startsAt: true } },
      lineItems: { include: { ticketType: { select: { name: true } } } },
      payments: { select: { status: true, amountCents: true } },
    },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // SECURITY: this endpoint mints PAID orders with provider=DEMO without
  // running through Authorize.net. It exists solely for SuperAdmin
  // reconciliation / demo seeding. Anyone else must go through
  // /api/v1/checkout/intent + /api/v1/checkout/confirm.
  if (!auth.roles.includes("SUPERADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { seriesId, sessionId, lineItems, subtotalCents, feesCents, taxCents, totalCents, currency } = body;

  if (!seriesId || !sessionId || !lineItems?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const series = await prisma.series.findUnique({ where: { id: seriesId } });
  if (!series) return NextResponse.json({ error: "Experience not found" }, { status: 404 });

  const order = await prisma.$transaction(async (tx) => {
    const ord = await tx.order.create({
      data: {
        userId: auth.userId,
        seriesId,
        sessionId,
        status: "PAID",
        subtotalCents: subtotalCents ?? 0,
        feesCents: feesCents ?? 0,
        taxCents: taxCents ?? 0,
        totalCents: totalCents ?? 0,
        currency: currency ?? "USD",
        lineItems: {
          create: lineItems.map((li: any) => ({
            ticketTypeId: li.ticketTypeId ?? null,
            addonId: li.addonId ?? null,
            nameSnapshot: li.nameSnapshot,
            itemType: li.itemType ?? "ticket",
            qty: li.qty,
            unitPriceCents: li.unitPriceCents,
            totalCents: li.totalCents,
          })),
        },
      },
    });

    await tx.payment.create({
      data: {
        orderId: ord.id,
        provider: "DEMO",
        status: "SUCCEEDED",
        amountCents: totalCents ?? 0,
        currency: currency ?? "USD",
        authNetTransId: "DEMO-" + Math.random().toString(36).slice(2, 12).toUpperCase(),
      },
    });

    const ticketLines = lineItems.filter((li: any) => li.itemType === "ticket" && li.ticketTypeId);
    for (const li of ticketLines) {
      for (let i = 0; i < li.qty; i++) {
        await tx.ticket.create({
          data: {
            orderId: ord.id,
            userId: auth.userId,
            sessionId,
            ticketTypeId: li.ticketTypeId,
            code: "TIX-" + Math.random().toString(36).slice(2, 10).toUpperCase(),
            attendeeName: auth.session.user.name ?? "Guest",
            attendeeEmail: auth.session.user.email ?? "",
            attendeeEmailNormalized: auth.session.user.email?.trim().toLowerCase() ?? null,
            ticketStatus: "ISSUED",
          },
        });
      }
    }

    const ticketCount = ticketLines.reduce((sum: number, li: any) => sum + li.qty, 0);
    await tx.series.update({
      where: { id: seriesId },
      data: { capacitySold: { increment: ticketCount } },
    });

    await tx.eventLog.create({
      data: { type: "PAYMENT_SUCCEEDED", userId: auth.userId, entityId: ord.id },
    });

    return ord;
  });

  return NextResponse.json({ order }, { status: 201 });
}
