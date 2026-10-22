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
    if (typeof outcomeType !== "string" || !VALID_OUTCOMES.includes(outcomeType as (typeof VALID_OUTCOMES)[number])) {
      return NextResponse.json({ ok: false, error: "Invalid outcomeType" }, { status: 400 });
    }
    if (reasonCode !== undefined && (typeof reasonCode !== "string" || !VALID_REASONS.includes(reasonCode as (typeof VALID_REASONS)[number]))) {
      return NextResponse.json({ ok: false, error: "Invalid reasonCode" }, { status: 400 });
    }

    await recordOutcome(
      attendanceEventId,
      outcomeType as (typeof VALID_OUTCOMES)[number],
      (reasonCode as (typeof VALID_REASONS)[number] | undefined) ?? "UNKNOWN",
      typeof notes === "string" ? notes : undefined
    );
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to record attendance outcome" }, { status });
  }
}
