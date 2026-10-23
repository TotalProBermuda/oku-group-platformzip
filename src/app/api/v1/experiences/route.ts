import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { localizeSessions } from "@/server/series/localizeSessions";
import { localizeContent, localizeEventCatalog } from "@/server/i18n/eventTranslations";

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
          profileAssignments: {
            where: { profile: { publicVisible: true, status: "ACTIVE" } },
            orderBy: { displayOrder: "asc" },
            select: {
              assignmentRole: true,
              displayOrder: true,
              isPrimary: true,
              profile: {
                select: { id: true, displayName: true, shortDescription: true, bio: true, websiteUrl: true, avatarUrl: true, logoUrl: true, slug: true },
              },
            },
          },
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

  const locale = searchParams.get("locale") ?? "en";
  const localized = await Promise.all(series.map(async s => ({ ...s, sessions: await localizeSessions(s, s.sessions, locale) })));
  const profiles = localized.flatMap((item) => item.sessions.flatMap((session) => session.profileAssignments.map((assignment) => assignment.profile)));
  const translatedProfiles = await localizeContent("Profile", profiles, locale);
  const profilesById = new Map(translatedProfiles.map((profile) => [profile.id, profile]));
  const localizedProfiles = localized.map((item) => ({
    ...item,
    sessions: item.sessions.map((session) => ({
      ...session,
      profileAssignments: session.profileAssignments.map((assignment) => ({
        ...assignment,
        profile: profilesById.get(assignment.profile.id) ?? assignment.profile,
      })),
    })),
  }));
  return NextResponse.json({ series: await localizeEventCatalog(localizedProfiles, locale) });
}
