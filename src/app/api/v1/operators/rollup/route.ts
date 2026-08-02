import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getOperatorRollup } from "@/server/referrals/operatorRollup";
import type { ReferralScopeType } from "@prisma/client";
import type { DateRangePreset } from "@/lib/analytics/dateFilters";

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const { searchParams } = new URL(req.url);
    const parentEntityId = searchParams.get("parentEntityId") ?? undefined;
    const scopeType = (searchParams.get("scopeType") as ReferralScopeType | null) ?? undefined;
    const scopeId = searchParams.get("scopeId") ?? undefined;
    const preset = (searchParams.get("preset") as DateRangePreset | null) ?? undefined;
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;

    if (!parentEntityId && !scopeType) {
      return NextResponse.json(
        { ok: false, error: "parentEntityId or scopeType is required" },
        { status: 400 }
      );
    }

    const rollup = await getOperatorRollup(
      { parentEntityId, scopeType, scopeId },
      preset || startDate || endDate ? { preset, startDate, endDate } : undefined
    );

    return NextResponse.json({ ok: true, rollup });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
