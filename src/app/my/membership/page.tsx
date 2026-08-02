import { redirect } from "next/navigation";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { MembershipDashboardContent } from "@/components/account/MembershipDashboardContent";

export default async function MyMembershipPage() {
  const auth = await getOptionalSession();
  if (!auth) redirect("/login");

  const [membership, eligibleData, recentOrders] = await Promise.all([
    prisma.membership.findUnique({ where: { userId: auth.userId } }),
    prisma.series.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          { membershipRuleMode: { in: ["MEMBERS_ONLY", "MEMBERS_EARLY_ACCESS", "MEMBERS_DISCOUNT"] } },
          { minMembershipTier: { not: null } },
        ],
      },
      include: {
        sessions: {
          where: { startsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 1,
        },
      },
      take: 6,
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { userId: auth.userId, status: { in: ["PAID"] } },
      include: {
        tickets: {
          include: {
            session: { include: { series: { select: { title: true, venue: true } } } },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const membershipSerialized = membership
    ? {
        tier: membership.tier,
        status: membership.status,
        startsAt: membership.startsAt.toISOString(),
        renewsAt: membership.renewsAt?.toISOString() ?? null,
        priceAnnualCents: membership.priceAnnualCents ?? null,
        avacaContributionBps: membership.avacaContributionBps ?? null,
      }
    : null;

  const eligibleSerialized = eligibleData.map((s) => ({
    id: s.id,
    title: s.title,
    heroImageUrl: s.heroImageUrl ?? null,
    isFounderOnly: s.isFounderOnly,
    sessions: s.sessions.map((sess) => ({ startsAt: sess.startsAt.toISOString() })),
  }));

  const ordersSerialized = recentOrders.map((o) => ({
    id: o.id,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    tickets: o.tickets.map((tk) => ({
      session: tk.session
        ? { series: tk.session.series ?? null }
        : null,
    })),
  }));

  return (
    <MembershipDashboardContent
      membership={membershipSerialized}
      eligibleData={eligibleSerialized}
      recentOrders={ordersSerialized}
      userName={auth.session.user.name ?? null}
    />
  );
}
