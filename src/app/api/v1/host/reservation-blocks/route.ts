import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

export async function GET(_req: NextRequest) {
  try {
    const { roles } = await requireSession();

    const isHost = roles.some((r) => ["STREETSIDE_HOST", "SUPERADMIN"].includes(r));
    if (!isHost) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Show blocks for sessions happening today (within ±12h window)
    const now = new Date();
    const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    const blocks = await prisma.reservationBlock.findMany({
      where: {
        OR: [
          // Blocks tied to a session starting within ±12h of now
          {
            session: {
              startsAt: { gte: windowStart, lte: windowEnd },
            },
          },
          // Blocks with no session, created within the last 24h
          {
            sessionId: null,
            createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
        ],
      },
      include: {
        arrivals: {
          select: {
            id: true,
            partySize: true,
            arrivedAt: true,
          },
        },
        session: { select: { id: true, title: true, startsAt: true, streetsideEnabled: true, giftBagEnabled: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Count gift bags given per block (via blockArrivalId on GiftBagLog)
    const arrivalIds = blocks.flatMap((b) => b.arrivals.map((a) => a.id));
    const giftBagLogs = arrivalIds.length > 0
      ? await prisma.giftBagLog.findMany({
          where: { blockArrivalId: { in: arrivalIds } },
          select: { blockArrivalId: true, quantity: true },
        })
      : [];

    // Map arrivalId → total gift bags given (using quantity for party-size accuracy)
    const giftBagsByArrival = new Map<string, number>();
    giftBagLogs.forEach((g) => {
      if (g.blockArrivalId) {
        giftBagsByArrival.set(g.blockArrivalId, (giftBagsByArrival.get(g.blockArrivalId) ?? 0) + g.quantity);
      }
    });

    const result = blocks.map((b) => ({
      id: b.id,
      groupLabel: b.groupLabel,
      expectedCount: b.expectedCount,
      giftBagEnabled: b.giftBagEnabled || (b.session?.giftBagEnabled ?? false),
      session: b.session,
      totalArrived: b.arrivals.reduce((s, a) => s + a.partySize, 0),
      giftBagsGiven: b.arrivals.reduce((s, a) => s + (giftBagsByArrival.get(a.id) ?? 0), 0),
    }));

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
