import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOptionalSession } from "@/server/auth/session";

export async function GET(_req: NextRequest) {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const profile = await prisma.influencerProfile.findUnique({
    where: { userId: auth.userId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PATCH(req: NextRequest) {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const allowed = ["displayName", "headline", "shortBio", "longBio", "profileImageUrl", "coverImageUrl", "instagramUrl", "tiktokUrl", "youtubeUrl", "websiteUrl", "location", "whatsapp", "preferredLanguage"];
  const data: any = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

  const profile = await prisma.influencerProfile.update({
    where: { userId: auth.userId },
    data,
  });

  await prisma.auditLog.create({
    data: { actorId: auth.userId, action: "INFLUENCER_PROFILE_UPDATED", metadata: { fields: Object.keys(data) } },
  });

  return NextResponse.json({ profile });
}
