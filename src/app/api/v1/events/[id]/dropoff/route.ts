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

    // Drop-off by outcome reason
    const outcomes = await prisma.attendanceOutcome.findMany({
      where: {
        attendanceEvent: { sessionId: { in: sessionIds } },
      },
      select: {
        outcomeType: true,
        reasonCode: true,
      },
    });

    // Aggregate by reason
    const reasonMap: Record<string, { count: number; outcomeTypes: Record<string, number> }> = {};
    for (const o of outcomes) {
      if (!reasonMap[o.reasonCode]) reasonMap[o.reasonCode] = { count: 0, outcomeTypes: {} };
      reasonMap[o.reasonCode].count++;
      reasonMap[o.reasonCode].outcomeTypes[o.outcomeType] = (reasonMap[o.reasonCode].outcomeTypes[o.outcomeType] ?? 0) + 1;
    }

    // Average duration by status
    const avgDuration = await prisma.attendanceEvent.aggregate({
      where: { sessionId: { in: sessionIds }, durationMinutes: { not: null } },
      _avg: { durationMinutes: true },
    });

    // Duration distribution
    const durationBuckets = [
      { label: "< 30 min", min: 0, max: 29 },
      { label: "30–60 min", min: 30, max: 59 },
      { label: "60–90 min", min: 60, max: 89 },
      { label: "90–120 min", min: 90, max: 119 },
      { label: "> 120 min", min: 120, max: 99999 },
    ];

    const durationCounts = await Promise.all(
      durationBuckets.map(async (bucket) => ({
        label: bucket.label,
        count: await prisma.attendanceEvent.count({
          where: {
            sessionId: { in: sessionIds },
            durationMinutes: { gte: bucket.min, lte: bucket.max },
          },
        }),
      }))
    );

    // Early departures by ticket tier
    const earlyLeft = await prisma.attendanceEvent.findMany({
      where: {
        sessionId: { in: sessionIds },
        status: { in: ["LEFT_EARLY"] },
      },
      include: {
        ticket: {
          select: { ticketType: { select: { tierCode: true, name: true } } },
        },
      },
    });

    const tierDropoff: Record<string, number> = {};
    for (const e of earlyLeft) {
      const tier = e.ticket?.ticketType?.tierCode ?? "STANDARD";
      tierDropoff[tier] = (tierDropoff[tier] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      reasonBreakdown: Object.entries(reasonMap).map(([reason, data]) => ({ reason, ...data })),
      avgDurationMinutes: avgDuration._avg.durationMinutes,
      durationDistribution: durationCounts,
      tierDropoff,
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
