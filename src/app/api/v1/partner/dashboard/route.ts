import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { getMyReferrals } from "@/server/referrals/myReferralsSource";

export async function GET() {
  try {
    const { userId } = await requireSession();

    const profile = await prisma.partnerProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "No partner profile found" }, { status: 403 });
    }

    // Reservation-referral feed from the ONE shared source (Task #140). A
    // partner who drives restaurant reservations (or whose managed host actors
    // do) sees them live on the same feed as every other referrer surface —
    // separate from the series/ticketing rollups below.
    const referrals = await getMyReferrals(userId);

    const series = await prisma.series.findMany({
      where: { partnerId: profile.id },
      include: {
        sessions: { select: { id: true } },
        Order: {
          where: { status: "PAID" },
          select: { totalCents: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let totalSessions = 0;
    let totalTicketsSold = 0;
    let totalRevenueCents = 0;

    const seriesList = series.map((s) => {
      const sessionsCount = s.sessions.length;
      const ticketsSold = s.Order.length;
      const revenue = s.Order.reduce((sum, o) => sum + o.totalCents, 0);

      totalSessions += sessionsCount;
      totalTicketsSold += ticketsSold;
      totalRevenueCents += revenue;

      return {
        id: s.id,
        title: s.title,
        status: s.status,
        sessionsCount,
        ticketsSold,
        revenueCents: revenue,
      };
    });

    // Resolve the partner's primary referral code + actor type for the
    // PureReferrerConsole identity. Partners may not have a ReferralActor
    // yet — the console handles null gracefully (QR tab shows a no-code state).
    const referralActor = await prisma.referralActor.findFirst({
      where: { userId },
      select: {
        actorTypeCode: true,
        referralLinks: {
          where: { isActive: true },
          select: { code: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      profile: { name: profile.name },
      stats: {
        totalSeries: series.length,
        totalSessions,
        totalTicketsSold,
        totalRevenueCents,
      },
      series: seriesList,
      referrals,
      referral: {
        referralCode: referralActor?.referralLinks[0]?.code ?? null,
        actorTypeCode: referralActor?.actorTypeCode ?? null,
      },
    });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
