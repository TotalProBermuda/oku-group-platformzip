import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const sessions = await resolveSessions(id);
    const sessionIds = sessions.map((s) => s.id);

    const orders = await prisma.order.findMany({
      where: {
        sessions: { some: { id: { in: sessionIds } } },
        status: "PAID",
      },
      include: {
        attributedInfluencer: {
          select: {
            id: true,
            handle: true,
            user: { select: { name: true, email: true } },
          },
        },
        tickets: {
          select: {
            id: true,
            ticketStatus: true,
            attendanceEvent: { select: { status: true, durationMinutes: true } },
          },
        },
      },
    });

    const COMMISSION_RATE = 0.10;

    const influencerMap: Record<string, {
      influencerId: string;
      handle: string;
      name: string | null;
      ordersCount: number;
      ticketsSold: number;
      revenueUsd: number;
      checkedInCount: number;
      completedCount: number;
      durationSamples: number[];
      commissionOwedCents: number;
    }> = {};

    let unattributedRevenueCents = 0;
    let unattributedOrders = 0;

    for (const order of orders) {
      if (!order.attributedInfluencerId) {
        unattributedRevenueCents += order.amountCents;
        unattributedOrders++;
        continue;
      }

      const iid = order.attributedInfluencerId;
      if (!influencerMap[iid]) {
        influencerMap[iid] = {
          influencerId: iid,
          handle: order.attributedInfluencer?.handle ?? "unknown",
          name: order.attributedInfluencer?.user.name ?? null,
          ordersCount: 0,
          ticketsSold: 0,
          revenueUsd: 0,
          checkedInCount: 0,
          completedCount: 0,
          durationSamples: [],
          commissionOwedCents: 0,
        };
      }

      const entry = influencerMap[iid];
      entry.ordersCount++;
      entry.revenueUsd += order.amountCents / 100;
      entry.ticketsSold += order.tickets.length;
      entry.commissionOwedCents += Math.round(order.amountCents * COMMISSION_RATE);

      for (const t of order.tickets) {
        if (t.ticketStatus === "CHECKED_IN" || t.attendanceEvent) entry.checkedInCount++;
        if (t.attendanceEvent?.status === "COMPLETED") entry.completedCount++;
        if (t.attendanceEvent?.durationMinutes != null) {
          entry.durationSamples.push(t.attendanceEvent.durationMinutes);
        }
      }
    }

    const performers = Object.values(influencerMap).map((e) => ({
      influencerId: e.influencerId,
      handle: e.handle,
      name: e.name,
      ordersCount: e.ordersCount,
      ticketsSold: e.ticketsSold,
      revenueUsd: Math.round(e.revenueUsd * 100) / 100,
      checkedInCount: e.checkedInCount,
      completedCount: e.completedCount,
      checkInRate: e.ticketsSold > 0 ? Math.round((e.checkedInCount / e.ticketsSold) * 1000) / 10 : 0,
      completionRate: e.checkedInCount > 0 ? Math.round((e.completedCount / e.checkedInCount) * 1000) / 10 : 0,
      avgDurationMinutes:
        e.durationSamples.length > 0
          ? Math.round(e.durationSamples.reduce((a, b) => a + b, 0) / e.durationSamples.length)
          : null,
      commissionOwedCents: e.commissionOwedCents,
    })).sort((a, b) => b.revenueUsd - a.revenueUsd);

    return NextResponse.json({
      ok: true,
      performers,
      unattributed: {
        orders: unattributedOrders,
        revenueUsd: Math.round(unattributedRevenueCents / 100 * 100) / 100,
      },
      totals: {
        revenueUsd: performers.reduce((s, p) => s + p.revenueUsd, 0) + unattributedRevenueCents / 100,
        commissionOwedCents: performers.reduce((s, p) => s + p.commissionOwedCents, 0),
        ticketsSold: performers.reduce((s, p) => s + p.ticketsSold, 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

async function resolveSessions(id: string) {
  const session = await prisma.session.findUnique({ where: { id } });
  if (session) return [session];
  return prisma.session.findMany({ where: { seriesId: id }, select: { id: true } });
}
