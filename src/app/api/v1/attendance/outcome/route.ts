import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { recordOutcome } from "@/server/attendance/attendanceService";

const VALID_OUTCOMES = ["COMPLETED", "LEFT_EARLY", "NO_SHOW", "DISSATISFIED", "UNKNOWN"] as const;
const VALID_REASONS = ["WAIT_TIME", "SERVICE", "PRICE", "EXPERIENCE", "UNKNOWN"] as const;

export async function POST(req: Request) {
  try {
    await requireSession();
    const { attendanceEventId, outcomeType, reasonCode, notes } = await req.json();

    if (!attendanceEventId || !outcomeType) {
      return NextResponse.json({ ok: false, error: "attendanceEventId and outcomeType required" }, { status: 400 });
    }
    if (!VALID_OUTCOMES.includes(outcomeType)) {
      return NextResponse.json({ ok: false, error: "Invalid outcomeType" }, { status: 400 });
    }

    await recordOutcome(attendanceEventId, outcomeType, reasonCode ?? "UNKNOWN", notes);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
