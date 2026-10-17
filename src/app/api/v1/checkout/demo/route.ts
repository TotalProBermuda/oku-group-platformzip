import { NextResponse } from "next/server";
import { reserveCatalogCapacityInTransaction } from "@/server/commerce/capacity";
import { purchasedEntitlements } from "@/server/commerce/sessionProducts";
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
    const lineItemsData: { ticketTypeId: string; nameSnapshot: string; qty: number; unitPriceCents: number; totalCents: number }[] = [];

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
      const current = await reserveCatalogCapacityInTransaction(tx, { sessionId, ticketItems: items.map(i => ({ id: i.ticketTypeId, qty: i.qty })), addonItems: [] });
      const rights = purchasedEntitlements(current);
      const [currentProducts, currentPrices] = await Promise.all([
        tx.ticketType.findMany({ where: { seriesId: current.seriesId } }),
        tx.sessionTicketPrice.findMany({ where: { sessionId } }),
      ]);
      for (const line of lineItemsData) {
        const product = currentProducts.find(p => p.id === line.ticketTypeId);
        if (!product) throw new Error("Ticket product is unavailable");
        line.nameSnapshot = product.name;
        line.unitPriceCents = currentPrices.find(p => p.ticketTypeId === product.id)?.priceCents ?? product.priceCents;
        line.totalCents = line.unitPriceCents * line.qty;
      }
      subtotalCents = lineItemsData.reduce((n, l) => n + l.totalCents, 0);

      const newOrder = await tx.order.create({
        data: {
          userId,
          seriesId,
          sessionId,
          status: "PAID",
          entitlementSnapshot: rights,
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
            ticketTypeId: item.ticketTypeId,
            entitlementSnapshot: rights,
            code: genCode(),
            attendeeName: auth.session.user.name ?? null,
            attendeeEmail: auth.session.user.email?.trim().toLowerCase() ?? null,
            attendeeEmailNormalized: auth.session.user.email?.trim().toLowerCase() ?? null,
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
