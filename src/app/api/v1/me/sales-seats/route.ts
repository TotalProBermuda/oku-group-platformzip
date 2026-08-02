import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

/**
 * Returns the current user's partner-anchored seller assignments — i.e. the
 * referrer codes they hold on behalf of one or more partners. For each
 * assignment, computes ticketsSold, gross sales, owed-by-partner, and
 * pending/paid breakdown. Informational only; the partner pays directly.
 */
export async function GET() {
  try {
    const { userId } = await requireSession();

    const assignments = await prisma.eventReferrerAssignment.findMany({
      where: {
        assignedUserId: userId,
        parentPartnerId: { not: null },
        status: "ACTIVE",
      },
      select: {
        id: true,
        referralCode: true,
        referralUrl: true,
        displayName: true,
        commissionMode: true,
        createdAt: true,
        parentPartner: { select: { id: true, name: true } },
        series: { select: { id: true, slug: true, title: true } },
        delegateSeat: {
          select: {
            id: true,
            commissionMode: true,
            flatAmountCents: true,
            perSeatAmountCents: true,
            percentageBps: true,
          },
        },
        subCommissionLedger: {
          select: {
            referrerShareCents: true,
            payoutStatus: true,
            currency: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = await Promise.all(
      assignments.map(async (a) => {
        // Lifetime totals: aggregate across ALL paid orders for this assignment.
        const allOrders = await prisma.order.findMany({
          where: {
            attributedEventReferrerAssignmentId: a.id,
            status: "PAID",
          },
          select: {
            subtotalCents: true,
            lineItems: { select: { qty: true, itemType: true } },
          },
        });

        const ticketsSold = allOrders.reduce(
          (acc, o) =>
            acc +
            o.lineItems
              .filter((li) => li.itemType === "ticket" || !li.itemType)
              .reduce((s, li) => s + li.qty, 0),
          0,
        );
        const grossSalesCents = allOrders.reduce((s, o) => s + o.subtotalCents, 0);
        const ordersAttributed = allOrders.length;

        // Recent orders are a separate, limited query for the activity feed.
        const recentOrdersRaw = await prisma.order.findMany({
          where: {
            attributedEventReferrerAssignmentId: a.id,
            status: "PAID",
          },
          select: {
            id: true,
            subtotalCents: true,
            createdAt: true,
            lineItems: { select: { qty: true, itemType: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        });

        const pendingOwedCents = a.subCommissionLedger
          .filter((r) => r.payoutStatus === "PENDING")
          .reduce((s, r) => s + r.referrerShareCents, 0);
        const paidCents = a.subCommissionLedger
          .filter((r) => r.payoutStatus === "PAID")
          .reduce((s, r) => s + r.referrerShareCents, 0);

        return {
          id: a.id,
          referralCode: a.referralCode,
          referralUrl: a.referralUrl,
          displayName: a.displayName,
          commissionMode: a.commissionMode,
          partner: a.parentPartner,
          series: a.series,
          seatCommission: a.delegateSeat
            ? {
                mode: a.delegateSeat.commissionMode,
                flatAmountCents: a.delegateSeat.flatAmountCents,
                perSeatAmountCents: a.delegateSeat.perSeatAmountCents,
                percentageBps: a.delegateSeat.percentageBps,
              }
            : null,
          ticketsSold,
          grossSalesCents,
          pendingOwedCents,
          paidCents,
          ordersAttributed,
          recentOrders: recentOrdersRaw.map((o) => ({
            id: o.id,
            subtotalCents: o.subtotalCents,
            createdAt: o.createdAt,
            qty: o.lineItems
              .filter((li) => li.itemType === "ticket" || !li.itemType)
              .reduce((s, li) => s + li.qty, 0),
          })),
        };
      }),
    );

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    const message = (e as Error).message ?? "Internal error";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
