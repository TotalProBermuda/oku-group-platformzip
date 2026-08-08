import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartnerForSeries, PartnerAuthError, hasFullSeriesAccess, accessibleSessionIds } from "@/lib/partnerAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requirePartnerForSeries(id);
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const fullAccess = hasFullSeriesAccess(auth);
    const allowedSessions = accessibleSessionIds(auth);

    const where: any = { order: { seriesId: id, status: "PAID" } };
    if (sessionId) {
      where.sessionId = sessionId;
    } else if (!fullAccess) {
      where.sessionId = { in: Array.from(allowedSessions) };
    }
    if (sessionId && !fullAccess && !allowedSessions.has(sessionId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        attendeeName: true,
        attendeeEmail: true,
        ticketStatus: true,
        checkedInAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        ticketType: { select: { name: true, tierCode: true } },
        session: { select: { id: true, title: true, startsAt: true } },
      },
    });

    return NextResponse.json({ ok: true, tickets });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/attendees] GET", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
