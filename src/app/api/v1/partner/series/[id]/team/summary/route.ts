import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PartnerAuthError, requireSeriesPartnerOnly } from "@/lib/partnerAuth";
import { getPartnerReferrerSummary } from "@/server/events/subCommissionService";

/**
 * Per-series team summary for the Partner UI:
 *  - totals across all sales-enabled seats on this series
 *  - per-seat breakdown of attributed orders, gross sales, and partner-owed
 *
 * This is informational only — the platform does not pay these commissions.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: seriesId } = await ctx.params;
    const auth = await requireSeriesPartnerOnly(seriesId);
    const partnerId = auth.partnerProfileId ?? auth.series.partnerId;
    if (!partnerId) {
      return NextResponse.json({ error: "Series has no partner" }, { status: 400 });
    }

    const summary = await getPartnerReferrerSummary(partnerId, seriesId);

    // Per-seat breakdown
    const salesSeats = await prisma.partnerDelegateSeat.findMany({
      where: { partnerId, seriesId, isReferrerEnabled: true },
      select: {
        id: true,
        invitedName: true,
        invitedEmail: true,
        status: true,
        commissionMode: true,
        flatAmountCents: true,
        perSeatAmountCents: true,
        percentageBps: true,
        referrerAssignment: {
          select: {
            id: true,
            referralCode: true,
            referralUrl: true,
            orders: {
              where: { status: "PAID" },
              select: {
                id: true,
                subtotalCents: true,
                lineItems: { select: { qty: true, itemType: true } },
              },
            },
            subCommissionLedger: {
              select: { referrerShareCents: true, payoutStatus: true },
            },
          },
        },
      },
    });

    const perSeat = salesSeats.map((s) => {
      const orders = s.referrerAssignment?.orders ?? [];
      const ledger = s.referrerAssignment?.subCommissionLedger ?? [];
      return {
        seatId: s.id,
        name: s.invitedName ?? s.invitedEmail,
        email: s.invitedEmail,
        status: s.status,
        commissionMode: s.commissionMode,
        flatAmountCents: s.flatAmountCents,
        perSeatAmountCents: s.perSeatAmountCents,
        percentageBps: s.percentageBps,
        referralCode: s.referrerAssignment?.referralCode ?? null,
        referralUrl: s.referrerAssignment?.referralUrl ?? null,
        ticketsSold: orders.reduce(
          (a, o) =>
            a +
            o.lineItems
              .filter((li) => li.itemType === "ticket" || !li.itemType)
              .reduce((s, li) => s + li.qty, 0),
          0,
        ),
        grossSalesCents: orders.reduce((a, o) => a + o.subtotalCents, 0),
        owedCents: ledger
          .filter((r) => r.payoutStatus === "PENDING")
          .reduce((a, r) => a + r.referrerShareCents, 0),
      };
    });

    return NextResponse.json({ totals: summary.totals, perSeat });
  } catch (e) {
    if (e instanceof PartnerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
