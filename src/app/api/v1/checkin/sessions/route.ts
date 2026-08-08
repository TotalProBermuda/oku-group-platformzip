import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey } from "@/types/roles";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/checkin/sessions[?range=today|future]
 *  - today (default): now-12h .. now+36h. Used by the staff scanner.
 *  - future: now-2h .. now+90d. Used by the admin "issue comp ticket" modal,
 *    which needs to pick any upcoming session, not just today's.
 * Permission: tickets:checkin.
 */
export async function GET(req: Request) {
  try {
    const { roles } = await requireSession();
    if (!hasPermission((roles ?? []) as RoleKey[], "tickets:checkin")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") === "future" ? "future" : "today";

    const now = new Date();
    const windowStart =
      range === "future"
        ? new Date(now.getTime() - 2 * 60 * 60 * 1000)
        : new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd =
      range === "future"
        ? new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + 36 * 60 * 60 * 1000);

    const sessions = await prisma.session.findMany({
      where: {
        startsAt: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { startsAt: "asc" },
      take: range === "future" ? 200 : 25,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        series: { select: { id: true, title: true, venue: true } },
      },
    });

    if (sessions.length === 0) {
      return NextResponse.json({ ok: true, sessions: [] });
    }

    const sessionIds = sessions.map((s) => s.id);
    const counts = await prisma.ticket.groupBy({
      by: ["sessionId", "ticketStatus"],
      where: { sessionId: { in: sessionIds } },
      _count: { _all: true },
    });

    const totals = new Map<string, { total: number; checkedIn: number }>();
    for (const sid of sessionIds) totals.set(sid, { total: 0, checkedIn: 0 });
    for (const row of counts) {
      const t = totals.get(row.sessionId)!;
      t.total += row._count._all;
      if (row.ticketStatus === "CHECKED_IN") t.checkedIn += row._count._all;
    }

    return NextResponse.json({
      ok: true,
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        series: s.series,
        ticketCount: totals.get(s.id)?.total ?? 0,
        checkedInCount: totals.get(s.id)?.checkedIn ?? 0,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
