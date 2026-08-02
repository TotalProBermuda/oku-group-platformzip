import { NextResponse } from "next/server";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await getOptionalSession();
  if (!auth) {
    return NextResponse.json({ events: [] });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId: auth.userId },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return NextResponse.json({ events: [] });
  }

  const tier = membership.tier;
  const tierRank: Record<string, number> = { EXPLORER: 0, INSIDER: 1, PATRON: 2, FOUNDER: 3 };
  const userRank = tierRank[tier] ?? 0;

  const now = new Date();

  const series = await prisma.series.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { membershipRuleMode: { in: ["MEMBERS_ONLY", "MEMBERS_EARLY_ACCESS", "MEMBERS_DISCOUNT"] } },
        { minMembershipTier: { not: null } },
        { isFounderOnly: tier === "FOUNDER" ? true : undefined },
      ],
    },
    include: {
      sessions: {
        where: { startsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
        take: 1,
      },
    },
    take: 12,
    orderBy: { createdAt: "desc" },
  });

  const eligible = series.filter((s) => {
    if (s.isFounderOnly && tier !== "FOUNDER") return false;
    if (s.minMembershipTier) {
      const required = tierRank[s.minMembershipTier] ?? 0;
      if (userRank < required) return false;
    }
    return true;
  });

  const events = eligible.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    subtitle: s.subtitle,
    venue: s.venue,
    heroImageUrl: s.heroImageUrl,
    membershipRuleMode: s.membershipRuleMode,
    minMembershipTier: s.minMembershipTier,
    isFounderOnly: s.isFounderOnly,
    nextSession: s.sessions[0] ?? null,
    accessLevel: s.isFounderOnly ? "FOUNDER" : (s.minMembershipTier ?? "PATRON"),
  }));

  return NextResponse.json({ events });
}
