import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendInfluencerInviteEmail } from "@/server/influencer/inviteEmail";
import { requireAdminRoles } from "@/server/auth/adminGuard";

function randRefCode(prefix: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = (prefix.toUpperCase().replace(/[^A-Z0-9]/g, "") || "INF").slice(0, 3);
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function GET(req: NextRequest) {
  await requireAdminRoles(req, ["SUPERADMIN"]);

  const { searchParams } = new URL(req.url);
  const seriesId = searchParams.get("seriesId");

  const invites = await prisma.influencerInvite.findMany({
    where: seriesId ? { seriesId } : undefined,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      series: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, invites });
}

export async function POST(req: NextRequest) {
  const { session } = await requireAdminRoles(req, ["SUPERADMIN"]);

  const body = await req.json().catch(() => ({}));
  const { invitedEmail, invitedName, commissionPct, seriesId } = body;

  if (!invitedEmail?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!invitedName?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const commissionRateBps = Math.round(Number(commissionPct ?? 10) * 100);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const series = seriesId
    ? await prisma.series.findUnique({ where: { id: seriesId }, select: { id: true, title: true, heroImageUrl: true } })
    : null;

  const invite = await prisma.influencerInvite.create({
    data: {
      token,
      invitedEmail: invitedEmail.trim().toLowerCase(),
      invitedName: invitedName.trim(),
      commissionRateBps,
      seriesId: series?.id ?? null,
      createdByUserId: session.user.id,
      expiresAt,
    },
  });

  await sendInfluencerInviteEmail({
    toEmail: invite.invitedEmail,
    toName: invite.invitedName,
    token,
    eventTitle: series?.title ?? null,
    eventImageUrl: series?.heroImageUrl ?? null,
    commissionPct: commissionRateBps / 100,
  });

  return NextResponse.json({ ok: true, invite });
}
