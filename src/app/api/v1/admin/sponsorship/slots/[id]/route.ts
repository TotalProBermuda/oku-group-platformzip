import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(s: any) {
  return s?.user?.roles?.some((r: string) => ["SUPERADMIN", "ADMIN_COMMERCIAL"].includes(r));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const slot = await prisma.sponsorshipSlot.findUnique({
    where: { id },
    include: {
      series:  { select: { id: true, title: true, slug: true } },
      session: { select: { id: true, title: true, startsAt: true } },
      applications: {
        include: { entity: { select: { id: true, displayName: true, logoUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
      deals: {
        include: {
          entity:    { select: { id: true, displayName: true } },
          payments:  { orderBy: { paidAt: "desc" } },
          placements: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, slot });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const allowed = [
    "title", "category", "scopeType", "description", "benefits", "deliverables",
    "audienceProfile", "exclusivityNote", "isExclusive", "maxSponsors",
    "askPriceCents", "floorPriceCents", "isPublished", "status",
    "availableFrom", "availableTo", "sortOrder", "internalNotes", "seriesId", "sessionId",
  ] as const;
  const data: any = {};
  for (const key of allowed) {
    if (key in body) {
      if (key === "availableFrom" || key === "availableTo") {
        data[key] = body[key] ? new Date(body[key]) : null;
      } else {
        data[key] = body[key] === "" ? null : body[key];
      }
    }
  }

  const slot = await prisma.sponsorshipSlot.update({
    where: { id },
    data,
    include: {
      series:  { select: { id: true, title: true } },
      session: { select: { id: true, title: true } },
      _count:  { select: { applications: true, deals: true } },
    },
  });
  return NextResponse.json({ ok: true, slot });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.sponsorshipSlot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
