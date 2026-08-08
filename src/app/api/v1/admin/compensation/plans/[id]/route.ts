import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:compensation:write");
    const { id } = await params;

    const body = await req.json();
    const {
      name, appliesToType, modelType,
      commissionPercent, hourlyRateCents, fixedSalaryCents,
      flatPerPartyCents, flatPerCoverCents, notes, isActive,
    } = body;

    const plan = await prisma.compensationPlan.update({
      where: { id },
      data: {
        ...(name          !== undefined && { name: name.trim() }),
        ...(appliesToType !== undefined && { appliesToType: appliesToType.trim() }),
        ...(modelType     !== undefined && { modelType }),
        ...(commissionPercent !== undefined && { commissionPercent: commissionPercent != null ? parseFloat(commissionPercent) : null }),
        ...(hourlyRateCents   !== undefined && { hourlyRateCents:   hourlyRateCents   != null ? parseInt(hourlyRateCents)   : null }),
        ...(fixedSalaryCents  !== undefined && { fixedSalaryCents:  fixedSalaryCents  != null ? parseInt(fixedSalaryCents)  : null }),
        ...(flatPerPartyCents !== undefined && { flatPerPartyCents: flatPerPartyCents != null ? parseInt(flatPerPartyCents) : null }),
        ...(flatPerCoverCents !== undefined && { flatPerCoverCents: flatPerCoverCents != null ? parseInt(flatPerCoverCents) : null }),
        ...(notes    !== undefined && { notes: notes?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ ok: true, data: plan });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:compensation:write");
    const { id } = await params;

    const inUse = await prisma.referrer.count({ where: { compensationPlanId: id } });
    if (inUse > 0) {
      return NextResponse.json(
        { ok: false, error: `Cannot delete — ${inUse} referrer(s) are assigned to this plan. Reassign or deactivate it first.` },
        { status: 409 }
      );
    }

    await prisma.compensationPlan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
