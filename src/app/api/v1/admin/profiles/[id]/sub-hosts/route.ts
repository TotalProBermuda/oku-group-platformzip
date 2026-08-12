import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;

    const subHosts = await prisma.restaurantHostProfile.findMany({
      where: { parentProfileId: id },
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
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ ok: true, data: subHosts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const body = await req.json();

    const { userId, displayName, asReferrer, commissionPayer, seriesId, commissionMode, commissionShareBps } = body;

    if (!userId || !displayName) {
      return NextResponse.json({ ok: false, error: "userId and displayName required" }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({ where: { id }, select: { id: true, profileType: true } });
    if (!profile || profile.profileType !== "COMPANY") {
      return NextResponse.json({ ok: false, error: "Profile must be a COMPANY type" }, { status: 400 });
    }

    let hostProfile = await prisma.restaurantHostProfile.findUnique({ where: { userId } });

    if (hostProfile) {
      hostProfile = await prisma.restaurantHostProfile.update({
        where: { userId },
        data: { parentProfileId: id, displayName },
      });
    } else {
      hostProfile = await prisma.restaurantHostProfile.create({
        data: { userId, displayName, isActive: true, parentProfileId: id },
      });
    }

    if (asReferrer) {
      const influencer = await prisma.influencerProfile.findFirst({ orderBy: { createdAt: "asc" } });
      if (!influencer) {
        return NextResponse.json({ ok: false, error: "No influencer profile found to create referrer assignment under" }, { status: 400 });
      }

      const code = `HOST-${displayName.replace(/\s+/g, "").toUpperCase().slice(0, 6)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      await prisma.eventReferrerAssignment.create({
        data: {
          parentInfluencerId:    influencer.id,
          createdByInfluencerId: influencer.id,
          displayName,
          referralCode: code,
          assignedUserId: userId,
          assignedHostProfileId: hostProfile.id,
          commissionPayer: commissionPayer ?? "OKU",
          commissionEntityProfileId: commissionPayer === "ENTITY" ? id : null,
          isCommissionEligible: commissionMode !== "NONE",
          commissionMode: commissionMode ?? "NONE",
          commissionShareBps: commissionShareBps ?? null,
          seriesId: seriesId ?? null,
          status: "ACTIVE",
        },
      });
    }

    const result = await prisma.restaurantHostProfile.findUnique({
      where: { id: hostProfile.id },
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

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
