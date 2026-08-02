import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getSessionsLedger } from "@/lib/revenue/trustDashboard";

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:revenue:read");

    const { searchParams } = new URL(req.url);
    const preset = searchParams.get("preset") as "today" | "7d" | "30d" | "custom" | null;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const venueId = searchParams.get("venueId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const matchMethod = searchParams.get("matchMethod") ?? undefined;
    const trustScoreMax = searchParams.get("trustScoreMax") ? parseFloat(searchParams.get("trustScoreMax")!) : undefined;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;

    const data = await getSessionsLedger({
      range: { preset: preset ?? "30d", from, to },
      venueId,
      status,
      matchMethod,
      trustScoreMax,
      page,
      limit,
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
