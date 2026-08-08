import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; hostId: string }> }
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { hostId } = await params;
    const body = await req.json();

    const { commissionPayer, commissionMode, commissionShareBps, seriesId, referrerAssignmentId } = body;

    if (referrerAssignmentId) {
      await prisma.eventReferrerAssignment.update({
        where: { id: referrerAssignmentId },
        data: {
          commissionPayer: commissionPayer ?? "OKU",
          commissionMode: commissionMode ?? "NONE",
          commissionShareBps: commissionShareBps ?? null,
          seriesId: seriesId ?? null,
          isCommissionEligible: commissionMode && commissionMode !== "NONE",
        },
      });
    }

    const hostProfile = await prisma.restaurantHostProfile.update({
      where: { id: hostId },
      data: { isActive: body.isActive ?? undefined },
      include: {
        user: { select: { id: true, name: true, email: true, status: true } },
        referrerAssignments: {
          select: {
            id: true, referralCode: true, displayName: true,
            commissionPayer: true, commissionMode: true,
            isCommissionEligible: true, status: true, seriesId: true,
            series: { select: { id: true, title: true } },
          },
        },
      },
    });

    return NextResponse.json({ ok: true, data: hostProfile });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; hostId: string }> }
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { id, hostId } = await params;

    const host = await prisma.restaurantHostProfile.findUnique({
      where: { id: hostId },
      select: { parentProfileId: true },
    });

    if (!host || host.parentProfileId !== id) {
      return NextResponse.json({ ok: false, error: "Sub-host not found under this profile" }, { status: 404 });
    }

    await prisma.restaurantHostProfile.update({
      where: { id: hostId },
      data: { parentProfileId: null },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
