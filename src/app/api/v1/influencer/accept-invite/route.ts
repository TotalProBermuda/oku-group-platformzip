import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function randRefCode(name: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = (name.toUpperCase().replace(/[^A-Z0-9]/g, "") || "INF").slice(0, 3);
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const invite = await prisma.influencerInvite.findUnique({
    where: { token },
    include: { series: { select: { id: true, title: true, heroImageUrl: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: "This invite has already been used or revoked", status: invite.status }, { status: 410 });
  if (invite.expiresAt < new Date()) {
    await prisma.influencerInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
  }

  return NextResponse.json({
    ok: true,
    invite: {
      id: invite.id,
      invitedEmail: invite.invitedEmail,
      invitedName: invite.invitedName,
      commissionRateBps: invite.commissionRateBps,
      commissionPct: invite.commissionRateBps / 100,
      series: invite.series,
      expiresAt: invite.expiresAt,
    },
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const invite = await prisma.influencerInvite.findUnique({
    where: { token },
    include: { series: { select: { id: true, title: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: "This invite has already been used or revoked" }, { status: 410 });
  if (invite.expiresAt < new Date()) {
    await prisma.influencerInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, email, profileImageUrl, shortBio, instagramUrl, tiktokUrl, websiteUrl, whatsapp, preferredLanguage } = body;

  const userEmail = (email?.trim() || invite.invitedEmail).toLowerCase();
  const userName = name?.trim() || invite.invitedName;

  const user = await prisma.$transaction(async (tx) => {
    let existingUser = await tx.user.findUnique({ where: { email: userEmail } });

    if (!existingUser) {
      existingUser = await tx.user.create({
        data: {
          email: userEmail,
          name: userName,
          status: "ACTIVE",
          roles: { create: [{ roleKey: "INFLUENCER" }] },
        },
      });
    } else {
      const hasRole = await tx.userRole.findUnique({ where: { userId_roleKey: { userId: existingUser.id, roleKey: "INFLUENCER" } } });
      if (!hasRole) {
        await tx.userRole.create({ data: { userId: existingUser.id, roleKey: "INFLUENCER" } });
      }
      if (userName && !existingUser.name) {
        await tx.user.update({ where: { id: existingUser.id }, data: { name: userName } });
      }
    }

    let profile = await tx.influencerProfile.findUnique({ where: { userId: existingUser.id } });
    if (!profile) {
      let refCode = randRefCode(userName);
      let attempts = 0;
      while (await tx.influencerProfile.findUnique({ where: { refCode } }) && attempts++ < 10) {
        refCode = randRefCode(userName);
      }

      profile = await tx.influencerProfile.create({
        data: {
          userId: existingUser.id,
          refCode,
          displayName: userName,
          commissionRateBps: invite.commissionRateBps,
          approvalStatus: "APPROVED",
          approved: true,
          profileImageUrl: profileImageUrl || null,
          shortBio: shortBio || null,
          instagramUrl: instagramUrl || null,
          tiktokUrl: tiktokUrl || null,
          websiteUrl: websiteUrl || null,
          whatsapp: whatsapp || null,
          preferredLanguage: preferredLanguage || null,
        },
      });
    } else {
      profile = await tx.influencerProfile.update({
        where: { id: profile.id },
        data: {
          commissionRateBps: invite.commissionRateBps,
          ...(profileImageUrl ? { profileImageUrl } : {}),
          ...(shortBio ? { shortBio } : {}),
          ...(instagramUrl ? { instagramUrl } : {}),
          ...(tiktokUrl ? { tiktokUrl } : {}),
          ...(websiteUrl ? { websiteUrl } : {}),
          ...(whatsapp ? { whatsapp } : {}),
          ...(preferredLanguage ? { preferredLanguage } : {}),
        },
      });
    }

    if (invite.seriesId) {
      await tx.series.update({
        where: { id: invite.seriesId },
        data: { influencerId: profile.id },
      }).catch(() => {});
    }

    await tx.influencerInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED" },
    });

    return existingUser;
  });

  return NextResponse.json({ ok: true, userId: user.id, email: user.email });
}
