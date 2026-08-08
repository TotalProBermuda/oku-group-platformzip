import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { getMyReferrals } from "@/server/referrals/myReferralsSource";

export async function GET() {
  try {
    const { userId } = await requireSession();

    const profile = await prisma.influencerProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "No influencer profile found" }, { status: 403 });
    }

    // Reservation-referral feed from the ONE shared source (Task #140), keyed
    // off the AttributionSession superset. An influencer who drives restaurant
    // reservations (e.g. an INFLUENCER_SUB_REFERRER actor chain) now sees those
    // live on the same feed every other referrer surface uses — separate from
    // the event/series funnel stats below.
    const referrals = await getMyReferrals(userId);

    const attributions = await prisma.attribution.findMany({
      where: { influencerId: profile.id },
      select: { id: true },
    });

    const attributionIds = attributions.map((a) => a.id);

    const eventCounts = await prisma.attributionEvent.groupBy({
      by: ["type"],
      where: { attributionId: { in: attributionIds } },
      _count: { id: true },
    });

    const clicks = eventCounts.find((e) => e.type === "CLICK")?._count.id ?? 0;
    const signups = eventCounts.find((e) => e.type === "SIGNUP")?._count.id ?? 0;
    const purchases = eventCounts.find((e) => e.type === "PURCHASE")?._count.id ?? 0;

    const orders = await prisma.order.findMany({
      where: { attributedInfluencerId: profile.id, status: "PAID" },
      include: {
        series: { select: { title: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const revenueCents = orders.reduce((sum, o) => sum + o.totalCents, 0);

    const ledger = await prisma.ledgerEntry.findMany({
      where: { influencerId: profile.id },
      include: {
        order: { select: { id: true, series: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    const commissionEarnedCents = ledger
      .filter((e) => e.type === "COMMISSION_EARNED")
      .reduce((sum, e) => sum + e.amountCents, 0);

    const commissionPaidCents = ledger
      .filter((e) => e.type === "COMMISSION_PAID")
      .reduce((sum, e) => sum + e.amountCents, 0);

    return NextResponse.json({
      profile: {
        handle: profile.handle,
        refCode: profile.refCode,
        commissionRateBps: profile.commissionRateBps,
      },
      stats: {
        clicks,
        signups,
        purchases,
        revenueCents,
        commissionEarnedCents,
        commissionPaidCents,
      },
      ledger: ledger.map((e) => ({
        id: e.id,
        date: e.createdAt,
        orderRef: e.orderId,
        seriesTitle: e.order?.series?.title ?? null,
        type: e.type,
        amountCents: e.amountCents,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        date: o.createdAt,
        attendeeName: o.user.name ?? o.user.email,
        seriesTitle: o.series.title,
        amountCents: o.totalCents,
      })),
      referrals,
    });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
