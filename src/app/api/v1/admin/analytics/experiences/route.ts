import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN","FB_DIRECTOR"].includes(r));
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const analytics = await prisma.experienceAnalyticsDaily.findMany({
    orderBy: { date: "desc" },
    include: { series: { select: { title: true, slug: true, status: true, venue: true } } },
  });

  // Aggregate platform totals
  const totals = analytics.reduce((acc, row) => ({
    pageViews:        acc.pageViews        + row.pageViews,
    ordersPaid:       acc.ordersPaid       + row.ordersPaid,
    ticketsSold:      acc.ticketsSold      + row.ticketsSold,
    grossRevenueCents: acc.grossRevenueCents + row.grossRevenueCents,
    waitlistSignups:  acc.waitlistSignups  + row.waitlistSignups,
    newsletterSignups: acc.newsletterSignups + row.newsletterSignups,
    memberPurchases:  acc.memberPurchases  + row.memberPurchases,
    checkoutStarts:   acc.checkoutStarts   + row.checkoutStarts,
  }), { pageViews: 0, ordersPaid: 0, ticketsSold: 0, grossRevenueCents: 0, waitlistSignups: 0, newsletterSignups: 0, memberPurchases: 0, checkoutStarts: 0 });

  const conversionRate = totals.checkoutStarts > 0
    ? Math.round((totals.ordersPaid / totals.checkoutStarts) * 100)
    : 0;

  const avgOrderCents = totals.ordersPaid > 0
    ? Math.round(totals.grossRevenueCents / totals.ordersPaid)
    : 0;

  return NextResponse.json({ analytics, totals: { ...totals, conversionRate, avgOrderCents } });
}
