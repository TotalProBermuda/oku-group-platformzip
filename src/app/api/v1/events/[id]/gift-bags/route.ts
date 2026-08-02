import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

const ANALYTICS_ROLES = new Set([
  "SUPERADMIN",
  "ADMIN",
  "OPS_ADMIN",
  "EVENTS_ADMIN",
  "STREETSIDE_HOST",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { roles } = await requireSession();
    if (!roles.some((r) => ANALYTICS_ROLES.has(r))) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const sessions = await resolveSessions(id);
    if (sessions.length === 0) {
      return NextResponse.json({ ok: true, sessions: [], totals: { givenCount: 0, ticketGiven: 0, blockGiven: 0, eligibleTickets: 0 } });
    }
    const sessionIds = sessions.map((s) => s.id);

    // All gift bag logs for these sessions
    const logs = await prisma.giftBagLog.findMany({
      where: { sessionId: { in: sessionIds } },
      select: {
        sessionId: true,
        ticketId: true,
        blockArrivalId: true,
        quantity: true,
        createdAt: true,
        givenBy: { select: { id: true, name: true } },
      },
    });

    // Eligible tickets per session (paid + checked-in)
    const tickets = await prisma.ticket.groupBy({
      by: ["sessionId"],
      where: {
        sessionId: { in: sessionIds },
        order: { status: "PAID" },
        ticketStatus: { not: "CANCELLED" },
        checkedInAt: { not: null },
      },
      _count: { _all: true },
    });
    const eligibleBySession = new Map<string, number>(
      tickets.map((t) => [t.sessionId!, t._count._all]),
    );

    // Aggregate per session
    const perSession = sessions.map((s) => {
      const sLogs = logs.filter((l) => l.sessionId === s.id);
      const ticketGiven = sLogs.filter((l) => l.ticketId).reduce((acc, l) => acc + l.quantity, 0);
      const blockGiven = sLogs.filter((l) => l.blockArrivalId).reduce((acc, l) => acc + l.quantity, 0);
      const givenCount = ticketGiven + blockGiven;
      const eligible = eligibleBySession.get(s.id) ?? 0;

      // Top distributors
      const byUser = new Map<string, { name: string; count: number }>();
      sLogs.forEach((l) => {
        const key = l.givenBy.id;
        const name = l.givenBy.name ?? "—";
        const cur = byUser.get(key) ?? { name, count: 0 };
        cur.count += l.quantity;
        byUser.set(key, cur);
      });
      const distributors = Array.from(byUser.values()).sort((a, b) => b.count - a.count);

      return {
        sessionId: s.id,
        title: s.title,
        startsAt: s.startsAt,
        giftBagEnabled: s.giftBagEnabled,
        givenCount,
        ticketGiven,
        blockGiven,
        eligibleTickets: eligible,
        coverageRate: eligible > 0 ? Math.round((ticketGiven / eligible) * 100) : null,
        distributors,
      };
    }).sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));

    const totals = {
      givenCount: perSession.reduce((s, x) => s + x.givenCount, 0),
      ticketGiven: perSession.reduce((s, x) => s + x.ticketGiven, 0),
      blockGiven: perSession.reduce((s, x) => s + x.blockGiven, 0),
      eligibleTickets: perSession.reduce((s, x) => s + x.eligibleTickets, 0),
    };

    return NextResponse.json({ ok: true, sessions: perSession, totals });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

async function resolveSessions(id: string) {
  const single = await prisma.session.findUnique({
    where: { id },
    select: { id: true, title: true, startsAt: true, giftBagEnabled: true },
  });
  if (single) return [single];
  return prisma.session.findMany({
    where: { seriesId: id },
    select: { id: true, title: true, startsAt: true, giftBagEnabled: true },
  });
}
