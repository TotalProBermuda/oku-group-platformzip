import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET(_req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:compensation:read");

    const plans = await prisma.compensationPlan.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { referrers: true } },
      },
    });

    return NextResponse.json({ ok: true, data: plans });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:compensation:write");

    const body = await req.json();
    const {
      name, appliesToType, modelType,
      commissionPercent, hourlyRateCents, fixedSalaryCents,
      flatPerPartyCents, flatPerCoverCents, notes, isActive,
    } = body;

    if (!name?.trim()) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    if (!appliesToType?.trim()) return NextResponse.json({ ok: false, error: "Applies-to type is required" }, { status: 400 });
    if (!modelType?.trim()) return NextResponse.json({ ok: false, error: "Model type is required" }, { status: 400 });

    const plan = await prisma.compensationPlan.create({
      data: {
        name: name.trim(),
        appliesToType: appliesToType.trim(),
        modelType,
        commissionPercent: commissionPercent != null ? parseFloat(commissionPercent) : null,
        hourlyRateCents:   hourlyRateCents   != null ? parseInt(hourlyRateCents)   : null,
        fixedSalaryCents:  fixedSalaryCents  != null ? parseInt(fixedSalaryCents)  : null,
        flatPerPartyCents: flatPerPartyCents != null ? parseInt(flatPerPartyCents) : null,
        flatPerCoverCents: flatPerCoverCents != null ? parseInt(flatPerCoverCents) : null,
        notes: notes?.trim() || null,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ ok: true, data: plan }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
