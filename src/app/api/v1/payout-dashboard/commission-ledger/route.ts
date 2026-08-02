import { NextRequest, NextResponse } from "next/server";


import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";

function mapLedgerEarningStatus(type: string): string {
  if (type === "COMMISSION_EARNED") return "EARNED";
  if (type === "COMMISSION_REVERSED") return "VOIDED";
  return "EARNED";
}

function mapLedgerPayoutStatus(type: string, hasPaid: boolean): string {
  if (type === "COMMISSION_REVERSED") return "NOT_PAYABLE";
  if (hasPaid) return "PAID";
  return "PENDING_PAYOUT";
}

function mapCommissionEarningStatus(status: string): string {
  if (status === "PENDING") return "PENDING_VALIDATION";
  if (status === "APPROVED") return "EARNED";
  if (status === "PAID") return "EARNED";
  if (status === "REJECTED") return "VOIDED";
  return "PENDING_VALIDATION";
}

function mapCommissionPayoutStatus(status: string): string {
  if (status === "PENDING" || status === "APPROVED") return "PENDING_PAYOUT";
  if (status === "PAID") return "PAID";
  if (status === "REJECTED") return "NOT_PAYABLE";
  return "PENDING_PAYOUT";
}

export async function GET(req: NextRequest) {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = auth.userId;
  const roles: string[] = auth.roles;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const skip = (page - 1) * limit;
  const earningStatusFilter = searchParams.get("earningStatus");
  const payoutStatusFilter = searchParams.get("payoutStatus");

  const isInfluencer = roles.includes("INFLUENCER");
  const isReferrer = roles.includes("REFERRER") || roles.includes("STREETSIDE_HOST") ||
    roles.includes("RESTAURANT_HOST");

  if (isInfluencer) {
    const profile = await prisma.influencerProfile.findUnique({ where: { userId } });
    if (!profile) return NextResponse.json({ error: "No influencer profile" }, { status: 403 });

    const paidOrderIds = await prisma.ledgerEntry.findMany({
      where: { influencerId: profile.id, type: "COMMISSION_PAID" },
      select: { orderId: true },
    }).then(rows => new Set(rows.map(r => r.orderId)));

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        influencerId: profile.id,
        type: { in: ["COMMISSION_EARNED", "COMMISSION_REVERSED"] },
      },
      include: {
        order: { select: { id: true, totalCents: true, series: { select: { title: true } }, user: { select: { name: true, email: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const rows = entries
      .map(e => {
        const hasPaid = e.orderId ? paidOrderIds.has(e.orderId) : false;
        const earningStatus = mapLedgerEarningStatus(e.type);
        const payoutStatus = mapLedgerPayoutStatus(e.type, hasPaid);

        if (earningStatusFilter && earningStatus !== earningStatusFilter) return null;
        if (payoutStatusFilter && payoutStatus !== payoutStatusFilter) return null;

        return {
          id: e.id,
          date: e.createdAt,
          sourceLabel: e.order?.series?.title ?? "Direct Commission",
          sourceType: "EVENT_TICKET",
          reference: e.orderId,
          customerName: e.order?.user?.name ?? e.order?.user?.email ?? null,
          grossBaseCents: e.order?.totalCents ?? 0,
          commissionCents: e.amountCents,
          earningStatus,
          payoutStatus,
          payerType: "OKU",
          payerDisplayName: "OKU Hospitality Group",
          currency: e.currency,
          notes: e.note,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, rows, page, limit });
  }

  if (isReferrer) {
    const referrer = await prisma.referrer.findUnique({ where: { userId } });
    if (!referrer) return NextResponse.json({ error: "No referrer profile" }, { status: 403 });

    const earnerScope = (await resolveEarnerScopeForReferrer(referrer.id))!;
    const entries = await prisma.commissionEntry.findMany({
      where: commissionWhereForEarner(earnerScope),
      include: {
        reservation: {
          select: {
            id: true,
            estimatedRevenueCents: true,
            actualRevenueCents: true,
            conceptRequested: true,
            contactName: true,
            venue: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const rows = entries
      .map(e => {
        const earningStatus = mapCommissionEarningStatus(e.status);
        const payoutStatus = mapCommissionPayoutStatus(e.status);

        if (earningStatusFilter && earningStatus !== earningStatusFilter) return null;
        if (payoutStatusFilter && payoutStatus !== payoutStatusFilter) return null;

        return {
          id: e.id,
          date: e.createdAt,
          sourceLabel: e.reservation?.venue?.name ?? e.conceptKey ?? "Restaurant Booking",
          sourceType: "RESTAURANT_BOOKING",
          reference: e.reservationId,
          customerName: e.reservation?.contactName ?? null,
          grossBaseCents: e.reservation?.actualRevenueCents ?? e.reservation?.estimatedRevenueCents ?? 0,
          commissionCents: e.amountCents,
          earningStatus,
          payoutStatus,
          payerType: "OKU",
          payerDisplayName: "OKU Hospitality Group",
          currency: e.currency,
          notes: e.reason,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, rows, page, limit });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
