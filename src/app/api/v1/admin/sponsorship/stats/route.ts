import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(s: any) {
  return s?.user?.roles?.some((r: string) => ["SUPERADMIN", "ADMIN_COMMERCIAL"].includes(r));
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [
    totalSlots, publishedSlots, openSlots, filledSlots,
    totalApplications, pendingApplications, approvedApplications,
    totalDeals, unpaidDeals, paidDeals,
    paidTotals, agreedTotals,
    recentApplications,
    activePlacements,
  ] = await Promise.all([
    prisma.sponsorshipSlot.count(),
    prisma.sponsorshipSlot.count({ where: { isPublished: true } }),
    prisma.sponsorshipSlot.count({ where: { status: "OPEN" } }),
    prisma.sponsorshipSlot.count({ where: { status: "FILLED" } }),
    prisma.sponsorApplication.count(),
    prisma.sponsorApplication.count({ where: { status: "PENDING" } }),
    prisma.sponsorApplication.count({ where: { status: "APPROVED" } }),
    prisma.sponsorDeal.count(),
    prisma.sponsorDeal.count({ where: { paymentStatus: "UNPAID" } }),
    prisma.sponsorDeal.count({ where: { paymentStatus: "PAID" } }),
    prisma.sponsorDeal.aggregate({ _sum: { paidTotalCents: true } }),
    prisma.sponsorDeal.aggregate({ _sum: { agreedPriceCents: true } }),
    prisma.sponsorApplication.findMany({
      where: { status: "PENDING" },
      include: {
        slot:   { select: { title: true, category: true } },
        entity: { select: { displayName: true, logoUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.sponsorPlacement.count({ where: { isActive: true } }),
  ]);

  return NextResponse.json({
    ok: true,
    stats: {
      slots:        { total: totalSlots, published: publishedSlots, open: openSlots, filled: filledSlots },
      applications: { total: totalApplications, pending: pendingApplications, approved: approvedApplications },
      deals:        { total: totalDeals, unpaid: unpaidDeals, paid: paidDeals },
      revenue: {
        collectedCents: paidTotals._sum.paidTotalCents ?? 0,
        pipelineCents:  agreedTotals._sum.agreedPriceCents ?? 0,
      },
      activePlacements,
      recentApplications,
    },
  });
}
