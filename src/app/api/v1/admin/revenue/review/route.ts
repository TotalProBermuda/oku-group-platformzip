import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getReviewItems } from "@/lib/revenue/trustDashboard";

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:revenue:read");

    const { searchParams } = new URL(req.url);
    const preset = searchParams.get("preset") as "today" | "7d" | "30d" | "custom" | null;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const venueId = searchParams.get("venueId") ?? undefined;

    const data = await getReviewItems({
      range: { preset: preset ?? "30d", from, to },
      venueId,
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
