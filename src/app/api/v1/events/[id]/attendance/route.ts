import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { getSessionAttendance } from "@/server/attendance/attendanceService";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    // id can be a sessionId or a seriesId
    const session = await prisma.session.findUnique({ where: { id } });
    if (session) {
      const events = await getSessionAttendance(id);
      return NextResponse.json({ ok: true, sessionId: id, events });
    }

    // Try as seriesId — get all sessions
    const sessions = await prisma.session.findMany({
      where: { seriesId: id },
      select: { id: true, title: true, startsAt: true },
      orderBy: { startsAt: "desc" },
    });

    const allEvents = await Promise.all(
      sessions.map(async (s) => ({
        session: s,
        events: await getSessionAttendance(s.id),
      }))
    );

    return NextResponse.json({ ok: true, seriesId: id, sessions: allEvents });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
