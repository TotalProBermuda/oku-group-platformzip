import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; hostId: string }> }
) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string; hostId: string }> }
) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
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
