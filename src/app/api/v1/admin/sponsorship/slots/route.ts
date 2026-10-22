import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SponsorshipSlotCategory, SponsorshipSlotStatus } from "@prisma/client";

function isAdmin(s: Session | null) {
  return s?.user?.roles?.includes("SUPERADMIN") ?? false;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const statusRaw   = searchParams.get("status")   ?? "";
  const categoryRaw = searchParams.get("category") ?? "";
  const status = statusRaw ? Object.values(SponsorshipSlotStatus).find((value) => value === statusRaw) : undefined;
  const category = categoryRaw ? Object.values(SponsorshipSlotCategory).find((value) => value === categoryRaw) : undefined;
  if ((statusRaw && !status) || (categoryRaw && !category)) return NextResponse.json({ ok: false, error: "Invalid sponsorship filter" }, { status: 400 });
  const seriesId = searchParams.get("seriesId") ?? "";

  const slots = await prisma.sponsorshipSlot.findMany({
    where: {
      ...(status   ? { status } : {}),
      ...(category ? { category } : {}),
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
