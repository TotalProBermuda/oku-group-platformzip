import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { createReferralAssignment, getAssignmentsForScope } from "@/server/referrals/referralAssignmentService";
import { ReferralCompensationMode, ReferralScopeType } from "@prisma/client";
import { z } from "zod";

const CreateAssignmentBody = z.object({
  scopeType: z.nativeEnum(ReferralScopeType),
  scopeId: z.string().optional(),
  parentEntityType: z.string().optional(),
  parentEntityId: z.string().optional(),
  isCommissionEligible: z.boolean().optional(),
  compensationMode: z.nativeEnum(ReferralCompensationMode).optional(),
  rateBps: z.number().int().min(0).max(10000).optional(),
  flatAmountCents: z.number().int().nonnegative().optional(),
  legacyCompensationPlanId: z.string().optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const parsed = CreateAssignmentBody.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid referral assignment" }, { status: 400 });
    const { scopeType, scopeId, parentEntityType, parentEntityId, isCommissionEligible, compensationMode, rateBps, flatAmountCents, legacyCompensationPlanId } = parsed.data;

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
  } catch (e: unknown) {
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status });
  }
}

export async function GET(req: NextRequest, { params: _ }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const { searchParams } = new URL(req.url);
    const parsedScope = z.nativeEnum(ReferralScopeType).safeParse(searchParams.get("scopeType") ?? "GLOBAL");
    if (!parsedScope.success) return NextResponse.json({ ok: false, error: "Invalid scopeType" }, { status: 400 });
    const scopeType = parsedScope.data;
    const scopeId = searchParams.get("scopeId") ?? undefined;

    const assignments = await getAssignmentsForScope(scopeType, scopeId);
    return NextResponse.json({ ok: true, assignments });
  } catch (e: unknown) {
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, { status });
  }
}
