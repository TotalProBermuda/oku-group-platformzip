import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) =>
    ["SUPERADMIN", "ADMIN_COMMERCIAL"].includes(r)
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: seriesId } = await params;

  const [assignments, invites] = await Promise.all([
    prisma.experienceInfluencer.findMany({
      where: { seriesId },
      include: {
        influencer: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            profileImageUrl: true,
            commissionRateBps: true,
            refCode: true,
            whatsapp: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.influencerInvite.findMany({
      where: { seriesId, status: "PENDING" },
      select: {
        id: true,
        invitedEmail: true,
        invitedName: true,
        commissionRateBps: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, assignments, invites });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: seriesId } = await params;
  const body = await req.json().catch(() => ({}));
  const { influencerProfileId, commissionRateBps, roleLabel } = body;

  if (!influencerProfileId) return NextResponse.json({ error: "influencerProfileId required" }, { status: 400 });

  const existing = await prisma.experienceInfluencer.findUnique({
    where: { seriesId_influencerProfileId: { seriesId, influencerProfileId } },
  });
  if (existing) return NextResponse.json({ error: "Already assigned" }, { status: 409 });

  if (commissionRateBps != null) {
    await prisma.influencerProfile.update({
      where: { id: influencerProfileId },
      data: { commissionRateBps: Number(commissionRateBps) },
    });
  }

  const assignment = await prisma.experienceInfluencer.create({
    data: {
      seriesId,
      influencerProfileId,
      roleLabel: roleLabel ?? "FEATURED_HOST",
      isPubliclyVisible: true,
    },
    include: {
      influencer: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          profileImageUrl: true,
          commissionRateBps: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return NextResponse.json({ ok: true, assignment });
}
