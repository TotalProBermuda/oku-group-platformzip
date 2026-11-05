import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendInfluencerInviteEmail } from "@/server/influencer/inviteEmail";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { z } from "zod/v3";

const InviteBody = z.object({
  invitedEmail: z.string().trim().email(),
  invitedName: z.string().trim().min(1),
  commissionPct: z.coerce.number().finite().min(0).max(100).optional(),
  seriesId: z.string().trim().min(1).nullable().optional(),
});

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
  const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);

  const parsed = InviteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Valid email and name are required" }, { status: 400 });
  const { invitedEmail, invitedName, commissionPct, seriesId } = parsed.data;

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
      createdByUserId: userId,
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
