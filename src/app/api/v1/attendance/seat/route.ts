import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { markSeated } from "@/server/attendance/attendanceService";

export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();
    const { attendanceEventId } = await req.json();

    if (!attendanceEventId) {
      return NextResponse.json({ ok: false, error: "attendanceEventId required" }, { status: 400 });
    }

    const event = await markSeated(attendanceEventId, userId);
    return NextResponse.json({ ok: true, event });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
