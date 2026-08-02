import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { safeEnqueue } from "@/server/queue/queue";
import { isDemoModeEnabled, DEMO_DISABLED_MESSAGE } from "@/lib/demoMode";
import { assertActiveGatewayReady } from "@/server/payments/activeGateway";

function genCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `TIX-${s}`;
}

export async function POST(req: Request) {
  try {
    if (!isDemoModeEnabled()) {
      return NextResponse.json(
        { ok: false, error: DEMO_DISABLED_MESSAGE },
        { status: 403 },
      );
    }

    const auth = await requireSession();
    const { userId } = auth;
    if (!auth.roles?.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Payments P4 — block demo checkout when the active gateway isn't ready.
    // Run after auth so readiness state is not disclosed to anonymous callers.
    const guard = await assertActiveGatewayReady();
    if (guard) {
      return NextResponse.json(
        { ok: false, error: guard.error, data: { provider: guard.provider } },
        { status: guard.status },
      );
    }

    const body = await req.json();
    const { seriesId, sessionId, items } = body as {
      seriesId: string;
      sessionId: string;
      items: { ticketTypeId: string; qty: number }[];
    };

    if (!seriesId || !sessionId || !items || items.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.seriesId !== seriesId) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }

    const ticketTypes = await prisma.ticketType.findMany({
      where: { seriesId, id: { in: items.map((i) => i.ticketTypeId) } },
    });

    const ttMap = new Map(ticketTypes.map((tt) => [tt.id, tt]));

    let subtotalCents = 0;
    let totalQty = 0;
    const lineItemsData: { ticketTypeId: string; qty: number; unitPriceCents: number; totalCents: number }[] = [];

    for (const item of items) {
      const tt = ttMap.get(item.ticketTypeId);
      if (!tt) {
        return NextResponse.json({ ok: false, error: `Ticket type ${item.ticketTypeId} not found` }, { status: 400 });
      }
      if (item.qty < 1 || item.qty > tt.maxPerOrder) {
        return NextResponse.json({ ok: false, error: `Invalid quantity for ${tt.name}` }, { status: 400 });
      }
      const lineTotalCents = tt.priceCents * item.qty;
      subtotalCents += lineTotalCents;
      totalQty += item.qty;
      lineItemsData.push({
        ticketTypeId: tt.id,
        nameSnapshot: tt.name,
        qty: item.qty,
        unitPriceCents: tt.priceCents,
        totalCents: lineTotalCents,
      });
    }

    if (session.soldCount + totalQty > session.capacity) {
      return NextResponse.json({ ok: false, error: "Not enough capacity" }, { status: 400 });
    }

    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        where: {
          id: sessionId,
          soldCount: { lte: session.capacity - totalQty },
        },
        data: { soldCount: { increment: totalQty } },
      });

      if (updated.count === 0) {
        throw new Error("Not enough capacity");
      }

      const newOrder = await tx.order.create({
        data: {
          userId,
          seriesId,
          sessionId,
          status: "PAID",
          subtotalCents,
          feesCents: 0,
          taxCents: 0,
          totalCents: subtotalCents,
          currency: "USD",
          lineItems: {
            create: lineItemsData,
          },
          payment: {
            create: {
              provider: "AUTHORIZE_NET",
              status: "SUCCEEDED",
              amountCents: subtotalCents,
              currency: "USD",
              authNetTransId: `demo-${Date.now()}`,
            },
          },
        },
      });

      const ticketData = [];
      for (const item of items) {
        for (let i = 0; i < item.qty; i++) {
          ticketData.push({
            orderId: newOrder.id,
            userId,
            sessionId,
            code: genCode(),
          });
        }
      }

      await tx.ticket.createMany({ data: ticketData });

      return tx.order.findUnique({
        where: { id: newOrder.id },
        include: {
          lineItems: true,
          tickets: true,
          payment: true,
        },
      });
    });

    // Fire order confirmation email (inline when Redis unavailable)
    if (order) {
      await safeEnqueue("send_order_email", { orderId: order.id });
    }

    return NextResponse.json({ ok: true, data: order });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "Not enough capacity") {
      return NextResponse.json({ ok: false, error: "Not enough capacity" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
