import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { createReferralAssignment, getAssignmentsForScope } from "@/server/referrals/referralAssignmentService";
import { ReferralScopeType } from "@prisma/client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const body = await req.json();
    const {
      scopeType,
      scopeId,
      parentEntityType,
      parentEntityId,
      isCommissionEligible,
      compensationMode,
      rateBps,
      flatAmountCents,
      legacyCompensationPlanId,
    } = body;

    if (!scopeType) {
      return NextResponse.json({ ok: false, error: "scopeType is required" }, { status: 400 });
    }

    const assignment = await createReferralAssignment({
      referralActorId: id,
      scopeType,
      scopeId,
      parentEntityType,
      parentEntityId,
      isCommissionEligible,
      compensationMode,
      rateBps,
      flatAmountCents,
      legacyCompensationPlanId,
    });

    return NextResponse.json({ ok: true, assignment }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}

export async function GET(req: NextRequest, { params: _ }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const { searchParams } = new URL(req.url);
    const scopeType = (searchParams.get("scopeType") ?? "GLOBAL") as ReferralScopeType;
    const scopeId = searchParams.get("scopeId") ?? undefined;

    const assignments = await getAssignmentsForScope(scopeType, scopeId);
    return NextResponse.json({ ok: true, assignments });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
