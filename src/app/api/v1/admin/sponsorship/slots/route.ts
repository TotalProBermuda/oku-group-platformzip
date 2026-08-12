import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(s: any) {
  return s?.user?.roles?.some((r: string) => ["SUPERADMIN"].includes(r));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status")   ?? "";
  const category = searchParams.get("category") ?? "";
  const seriesId = searchParams.get("seriesId") ?? "";

  const slots = await prisma.sponsorshipSlot.findMany({
    where: {
      ...(status   ? { status:   status   as any } : {}),
      ...(category ? { category: category as any } : {}),
      ...(seriesId ? { seriesId } : {}),
    },
    include: {
      series:  { select: { id: true, title: true, slug: true } },
      session: { select: { id: true, title: true, startsAt: true } },
      _count:  { select: { applications: true, deals: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ ok: true, slots });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const {
    seriesId, sessionId, scopeType, title, category, description,
    benefits, deliverables, audienceProfile, exclusivityNote,
    isExclusive, maxSponsors, askPriceCents, floorPriceCents,
    isPublished, availableFrom, availableTo, sortOrder, internalNotes,
  } = body;

  if (!title?.trim())  return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!scopeType)      return NextResponse.json({ error: "scopeType required" }, { status: 400 });
  if (!category)       return NextResponse.json({ error: "category required" }, { status: 400 });

  const slot = await prisma.sponsorshipSlot.create({
    data: {
      seriesId:        seriesId        || null,
      sessionId:       sessionId       || null,
      scopeType,
      title:           title.trim(),
      category,
      description:     description     || null,
      benefits:        benefits        ?? null,
      deliverables:    deliverables    ?? null,
      audienceProfile: audienceProfile || null,
      exclusivityNote: exclusivityNote || null,
      isExclusive:     isExclusive     ?? true,
      maxSponsors:     maxSponsors     ?? 1,
      askPriceCents:   askPriceCents   ?? null,
      floorPriceCents: floorPriceCents ?? null,
      isPublished:     isPublished     ?? false,
      availableFrom:   availableFrom   ? new Date(availableFrom) : null,
      availableTo:     availableTo     ? new Date(availableTo)   : null,
      sortOrder:       sortOrder       ?? 0,
      internalNotes:   internalNotes   || null,
    },
    include: {
      series:  { select: { id: true, title: true } },
      session: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({ ok: true, slot }, { status: 201 });
}
