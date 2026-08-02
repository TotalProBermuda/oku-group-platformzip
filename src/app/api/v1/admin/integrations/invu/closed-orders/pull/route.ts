import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pullLast7DaysClosedOrders } from "@/server/services/invu/invuClosedOrdersService";

function isSuperadmin(session: unknown): boolean {
  const s = session as { user?: { roles?: string[]; id?: string } } | null;
  return !!s?.user?.roles?.some((r) => r === "SUPERADMIN");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperadmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const venueId = body?.venueId as string | undefined;
  if (!venueId) {
    return NextResponse.json({ error: "venueId required" }, { status: 400 });
  }

  // Optional tighter window for live testing — clamped to a sane range so a
  // typo can't accidentally pull a year of data.
  const rawMinutes = body?.windowMinutes;
  let windowMinutes: number | undefined;
  if (typeof rawMinutes === "number" && Number.isFinite(rawMinutes)) {
    windowMinutes = Math.min(Math.max(Math.floor(rawMinutes), 1), 7 * 24 * 60);
  }

  try {
    const userId = (session as { user?: { id?: string } } | null)?.user?.id;
    const result = await pullLast7DaysClosedOrders({
      venueId,
      triggeredByUserId: userId,
      windowMinutes,
    });
    return NextResponse.json({ success: true, syncRunId: result.syncRunId, windowMinutes: windowMinutes ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pull failed" },
      { status: 422 }
    );
  }
}
