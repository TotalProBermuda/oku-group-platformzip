import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/** Read-only, venue-scoped ticket list for the Reservations dashboard. */
export async function GET() {
  try {
    const { userId, roles } = await requireSession();
    const isSuperadmin = roles.includes("SUPERADMIN");
    if (!isSuperadmin && !roles.some((role) => ["RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"].includes(role))) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const hostProfile = await prisma.restaurantHostProfile.findUnique({ where: { userId }, select: { venueId: true } });
    const venueId = hostProfile?.venueId ?? null;
    if (!isSuperadmin && !venueId) {
      return NextResponse.json({ ok: false, error: "No venue is assigned to this host" }, { status: 403 });
    }

    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const through = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const sessionLimit = 250;
    const sessions = await prisma.session.findMany({
      where: {
        startsAt: { gte: from, lt: through },
        status: { not: "CANCELLED" },
        ...(venueId ? { series: { venueId } } : {}),
      },
      orderBy: { startsAt: "asc" },
      take: sessionLimit + 1,
      select: { id: true, title: true, startsAt: true, status: true, series: { select: { title: true } } },
    });
    const sessionsTruncated = sessions.length > sessionLimit;
    const selectedSessions = sessions.slice(0, sessionLimit);
    const sessionIds = selectedSessions.map((session) => session.id);
    const ticketLimit = 2000;
    const tickets = sessionIds.length ? await prisma.ticket.findMany({
      where: { sessionId: { in: sessionIds } },
      orderBy: { createdAt: "asc" },
      take: ticketLimit + 1,
      select: {
        id: true, code: true, attendeeName: true, attendeeEmail: true,
        ticketStatus: true, checkedInAt: true, createdAt: true, sessionId: true,
        ticketType: { select: { name: true } },
        order: { select: { status: true, orderType: true, channel: true } },
      },
    }) : [];
    const ticketsTruncated = tickets.length > ticketLimit;

    return NextResponse.json({
      ok: true,
      sessions: selectedSessions,
      tickets: tickets.slice(0, ticketLimit),
      truncated: sessionsTruncated || ticketsTruncated,
      updatedAt: now.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message ?? "Unable to load ticket monitor" }, { status: error.status || 500 });
  }
}
