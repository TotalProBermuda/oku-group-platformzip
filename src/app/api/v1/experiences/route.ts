import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category  = searchParams.get("category");
  const venue     = searchParams.get("venue");
  const featured  = searchParams.get("featured");
  const slug      = searchParams.get("slug");

  const where: any = {
    status: { in: ["PUBLISHED", "SOLD_OUT"] },
  };
  if (category) where.category = category;
  if (venue)    where.venue    = venue;
  if (featured === "true") where.isFeatured = true;
  if (slug)     where.slug     = slug;

  const series = await prisma.series.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { startsAt: "asc" }],
    include: {
      ticketTypes: { where: { ticketStatus: "ACTIVE" }, orderBy: { displayOrder: "asc" } },
      sessions: { where: { status: "SCHEDULED" }, orderBy: { startsAt: "asc" }, take: 3 },
      experienceInfluencer: {
        where: { isPubliclyVisible: true },
        orderBy: { sortOrder: "asc" },
        include: { influencer: { select: { id: true, displayName: true, handle: true, profileImageUrl: true, isVerified: true } } },
      },
      addons: { where: { isActive: true }, orderBy: { displayOrder: "asc" } },
      _count: { select: { waitlists: true } },
    },
  });

  return NextResponse.json({ series });
}
