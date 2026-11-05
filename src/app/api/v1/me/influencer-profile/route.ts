import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOptionalSession } from "@/server/auth/session";
import { Prisma } from "@prisma/client";

export async function GET(_req: NextRequest) {
  void _req;
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

  const body: unknown = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid profile data" }, { status: 400 });
  }
  const allowed = ["displayName", "headline", "shortBio", "longBio", "profileImageUrl", "coverImageUrl", "instagramUrl", "tiktokUrl", "youtubeUrl", "websiteUrl", "location", "whatsapp", "preferredLanguage"] as const;
  const input = body as Record<string, unknown>;
  const data: Prisma.InfluencerProfileUpdateInput = {};
  for (const key of allowed) {
    const value = input[key];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") {
      return NextResponse.json({ error: `${key} must be a string or null` }, { status: 400 });
    }
    data[key] = value;
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
