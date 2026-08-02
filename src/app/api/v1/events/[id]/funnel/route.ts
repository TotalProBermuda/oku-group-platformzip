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

    // Resolve sessions for this series or single session
    const sessions = await resolveSessions(id);
    const sessionIds = sessions.map((s) => s.id);

    // Funnel: Series views → Registrations → Ticket purchases → Check-ins → Completions
    const [
      registrations,
      ticketsSold,
      checkedIn,
      completed,
      noShows,
    ] = await Promise.all([
      prisma.eventRegistrant.count({ where: { sessionId: { in: sessionIds } } }),
      prisma.ticket.count({
        where: {
          sessionId: { in: sessionIds },
          order: { status: "PAID" },
          ticketStatus: { not: "CANCELLED" },
        },
      }),
      prisma.ticket.count({
        where: {
          sessionId: { in: sessionIds },
          ticketStatus: "CHECKED_IN",
        },
      }),
      prisma.attendanceEvent.count({
        where: {
          sessionId: { in: sessionIds },
          status: "COMPLETED",
        },
      }),
      prisma.attendanceEvent.count({
        where: {
          sessionId: { in: sessionIds },
          status: "NO_SHOW",
        },
      }),
    ]);

    const funnel = [
      { stage: "registrations", count: registrations, label: "RSVPs / Registrations" },
      { stage: "tickets_sold", count: ticketsSold, label: "Tickets Sold" },
      { stage: "checked_in", count: checkedIn, label: "Checked In" },
      { stage: "completed", count: completed, label: "Completed Event" },
    ];

    const conversionRates = funnel.map((step, i) => ({
      ...step,
      rateFromPrevious: i === 0 ? 1 : funnel[i - 1].count > 0 ? step.count / funnel[i - 1].count : 0,
      rateFromTop: funnel[0].count > 0 ? step.count / funnel[0].count : 0,
    }));

    return NextResponse.json({
      ok: true,
      funnel: conversionRates,
      noShows,
      sessionCount: sessions.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

async function resolveSessions(id: string) {
  const session = await prisma.session.findUnique({ where: { id } });
  if (session) return [session];

  return prisma.session.findMany({
    where: { seriesId: id },
    select: { id: true },
  });
}
