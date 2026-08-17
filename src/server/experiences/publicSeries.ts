import { Prisma, SeriesStatus, SeriesVisibilityMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** The single eligibility rule for anything a guest can discover or open. */
export function publicSeriesWhere(extra: Prisma.SeriesWhereInput = {}): Prisma.SeriesWhereInput {
  return {
    ...extra,
    status: { in: [SeriesStatus.PUBLISHED, SeriesStatus.SOLD_OUT] },
    seriesVisibilityMode: { not: SeriesVisibilityMode.PRIVATE_HIDDEN },
  };
}

export const publicExperienceInclude = {
  ticketTypes: { where: { ticketStatus: "ACTIVE" }, orderBy: { displayOrder: "asc" } },
  sessions: { where: { status: "SCHEDULED" }, orderBy: { startsAt: "asc" }, take: 3 },
  experienceInfluencer: {
    where: { isPubliclyVisible: true },
    orderBy: { sortOrder: "asc" },
    include: { influencer: { select: { id: true, displayName: true, handle: true, profileImageUrl: true, isVerified: true } } },
  },
  addons: { where: { isActive: true }, orderBy: { displayOrder: "asc" } },
  _count: { select: { waitlists: true } },
} satisfies Prisma.SeriesInclude;

export const publicExperienceDetailInclude = {
  ...publicExperienceInclude,
  sessions: {
    where: { status: "SCHEDULED" },
    orderBy: { startsAt: "asc" },
  },
} satisfies Prisma.SeriesInclude;

export function listPublicExperiences(extra: Prisma.SeriesWhereInput = {}) {
  return prisma.series.findMany({
    where: publicSeriesWhere(extra),
    orderBy: [{ isFeatured: "desc" }, { startsAt: "asc" }],
    include: publicExperienceInclude,
  });
}

export function getPublicExperienceBySlug(slug: string) {
  return prisma.series.findFirst({
    where: publicSeriesWhere({ slug }),
    include: publicExperienceDetailInclude,
  });
}
