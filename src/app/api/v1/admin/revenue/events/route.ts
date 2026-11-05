import { NextRequest, NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getEventAttribution } from "@/lib/revenue/trustDashboard";

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:revenue:read");

    const { searchParams } = new URL(req.url);
    const preset = searchParams.get("preset") as "today" | "7d" | "30d" | "custom" | null;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const venueId = searchParams.get("venueId") ?? undefined;

    const data = await getEventAttribution({
      range: { preset: preset ?? "30d", from, to },
      venueId,
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
