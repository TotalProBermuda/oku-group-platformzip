import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { localizeSessions } from "@/server/series/localizeSessions";
import { localizeEventCatalog } from "@/server/i18n/eventTranslations";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category  = searchParams.get("category");
  const venue     = searchParams.get("venue");
  const featured  = searchParams.get("featured");
  const slug      = searchParams.get("slug");
  const now       = new Date();

  const where: Prisma.SeriesWhereInput = {
    status: { in: ["PUBLISHED", "SOLD_OUT"] },
  };
  if (category) where.category = category;
  if (venue === "OKU" || venue === "CATCH") where.venue = venue;
  if (featured === "true") where.isFeatured = true;
  if (slug)     where.slug     = slug;

  const series = await prisma.series.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { startsAt: "asc" }],
    include: {
      ticketTypes: { where: { ticketStatus: "ACTIVE" }, orderBy: { displayOrder: "asc" } },
      seriesHosts: { where: { isFrontFacing: true }, orderBy: { sortOrder: "asc" }, select: { role: true, entity: { select: { displayName: true, logoUrl: true, websiteUrl: true } } } },
      sessions: {
        where: { status: "SCHEDULED", OR: [{ startsAt: { gt: now } }, { allowLateSales: true }], endsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        include: {
          ticketPrices: { select: { ticketTypeId: true, priceCents: true } },
          eventHosts: { where: { isFrontFacing: true }, orderBy: { sortOrder: "asc" }, select: { role: true, entity: { select: { displayName: true, logoUrl: true, websiteUrl: true } } } },
        },
        ...(slug ? {} : { take: 3 }),
      },
      experienceInfluencer: {
        where: { isPubliclyVisible: true },
        orderBy: { sortOrder: "asc" },
        include: { influencer: { select: { id: true, displayName: true, handle: true, profileImageUrl: true, isVerified: true } } },
      },
      addons: { where: { isActive: true }, orderBy: { displayOrder: "asc" } },
      _count: { select: { waitlists: true } },
    },
  });

  const localized = await Promise.all(series.map(async s => ({ ...s, sessions: await localizeSessions(s, s.sessions, searchParams.get("locale") ?? "en") })));
  return NextResponse.json({ series: await localizeEventCatalog(localized, searchParams.get("locale") ?? "en") });
}
