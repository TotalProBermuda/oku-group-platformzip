import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN", "FB_DIRECTOR"].includes(r));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q    = searchParams.get("q")    ?? "";
  const type = searchParams.get("type") ?? "";

  const entities = await prisma.entity.findMany({
    where: {
      ...(q ? { displayName: { contains: q, mode: "insensitive" } } : {}),
      ...(type ? { type: type as any } : {}),
    },
    include: {
      linkedInfluencerProfile: { select: { id: true, handle: true, refCode: true, commissionRateBps: true } },
      linkedUser: { select: { id: true, name: true, email: true } },
      _count: { select: { seriesHosts: true, eventHosts: true } },
    },
    orderBy: { displayName: "asc" },
    take: 100,
  });

  return NextResponse.json({ ok: true, entities });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { type, displayName, logoUrl, description, websiteUrl, instagramUrl, twitterUrl,
          linkedUserId, linkedInfluencerProfileId } = body;

  if (!displayName?.trim()) return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  if (!type || !["PERSON", "COMPANY"].includes(type)) return NextResponse.json({ error: "type must be PERSON or COMPANY" }, { status: 400 });

  const entity = await prisma.entity.create({
    data: {
      type,
      displayName: displayName.trim(),
      logoUrl:     logoUrl     || null,
      description: description || null,
      websiteUrl:  websiteUrl  || null,
      instagramUrl: instagramUrl || null,
      twitterUrl:  twitterUrl  || null,
      linkedUserId:              linkedUserId              || null,
      linkedInfluencerProfileId: linkedInfluencerProfileId || null,
    },
    include: {
      linkedInfluencerProfile: { select: { id: true, handle: true, refCode: true } },
      linkedUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ ok: true, entity }, { status: 201 });
}
