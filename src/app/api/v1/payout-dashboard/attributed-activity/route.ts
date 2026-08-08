import { NextResponse } from "next/server";


import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = auth.userId;
  const roles: string[] = auth.roles;

  const isInfluencer = roles.includes("INFLUENCER");
  const isReferrer = roles.includes("REFERRER") || roles.includes("STREETSIDE_HOST") ||
    roles.includes("RESTAURANT_HOST");

  if (isInfluencer) {
    const profile = await prisma.influencerProfile.findUnique({ where: { userId } });
    if (!profile) return NextResponse.json({ error: "No influencer profile" }, { status: 403 });

    const orders = await prisma.order.findMany({
      where: { attributedInfluencerId: profile.id },
      include: {
        series: { select: { title: true } },
        user: { select: { name: true, email: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const paidOrderIds = await prisma.ledgerEntry.findMany({
      where: { influencerId: profile.id, type: "COMMISSION_EARNED" },
      select: { orderId: true },
    }).then(rows => new Set(rows.map(r => r.orderId)));

    const rows = orders.map(o => ({
      id: o.id,
      date: o.createdAt,
      customerName: o.user.name ?? o.user.email,
      sourceLabel: o.series?.title ?? "Event",
      orderTotalCents: o.totalCents,
      attributionType: "REFERRAL_LINK",
      conversionStatus: o.status === "PAID" ? "COMPLETED" : o.status === "CANCELLED" ? "CANCELLED" : "PENDING",
      commissionOutcome: paidOrderIds.has(o.id) ? "EARNED" : o.status === "PAID" ? "PENDING_VALIDATION" : "NOT_APPLICABLE",
      currency: o.currency,
      managerNote: o.notes[0]?.body ?? null,
      managerNoteAuthor: o.notes[0]?.authorName ?? null,
    }));

    return NextResponse.json({ ok: true, rows });
  }

  if (isReferrer) {
    const referrer = await prisma.referrer.findUnique({ where: { userId } });
    if (!referrer) return NextResponse.json({ error: "No referrer profile" }, { status: 403 });

    const attributions = await prisma.reservationAttribution.findMany({
      where: { referrerId: referrer.id },
      include: {
        reservation: {
          select: {
            id: true,
            contactName: true,
            partySize: true,
            estimatedRevenueCents: true,
            actualRevenueCents: true,
            conceptRequested: true,
            status: true,
            venue: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const rows = attributions.map(a => ({
      id: a.id,
      date: a.createdAt,
      customerName: a.reservation?.contactName ?? "Guest",
      sourceLabel: a.reservation?.venue?.name ?? a.reservation?.conceptRequested ?? "Booking",
      orderTotalCents: a.reservation?.actualRevenueCents ?? a.reservation?.estimatedRevenueCents ?? 0,
      attributionType: a.sourceType ?? "WALK_IN",
      conversionStatus: a.conversionStage === "PATRONIZED"
        ? "COMPLETED"
        : ["ARRIVED", "OFFERED"].includes(a.conversionStage)
        ? "IN_PROGRESS"
        : ["DECLINED", "LOST"].includes(a.conversionStage)
        ? "LOST"
        : "PENDING",
      commissionOutcome: a.commissionStatus ?? "PENDING",
      currency: "USD",
    }));

    return NextResponse.json({ ok: true, rows });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
