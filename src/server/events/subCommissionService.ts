import { prisma } from "@/lib/prisma";
import { EventReferrerCommissionMode, Prisma } from "@prisma/client";
import {
  calculatePartnerCommission,
  isPartnerCommissionMode,
  type CommissionSnapshot,
} from "@/server/partnerSeats/commissionModel";

/**
 * Creates a sub-commission ledger entry when an order is attributed to an
 * event referrer.
 *
 * Two anchor modes:
 *
 * 1) INFLUENCER-anchored (legacy) — OKU pays the influencer via LedgerEntry
 *    (commissions.ts), and the influencer owes their referrer a percentage of
 *    that commission. Calculation uses the assignment's commissionShareBps.
 *
 * 2) PARTNER-anchored (new) — OKU does NOT pay anyone here. The partner pays
 *    the seat directly per the snapshotted commission model on the seat
 *    (flat / per-seat / percent / combos). The platform writes a ledger row
 *    purely for reporting.
 */
export async function createSubCommissionIfApplicable(
  orderId: string,
  grossInfluencerCommissionCents: number
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      lineItems: { select: { qty: true, itemType: true } },
      attributedEventReferrerAssignment: {
        include: {
          parentInfluencer: { select: { id: true, commissionRateBps: true } },
          delegateSeat: {
            select: {
              id: true,
              commissionMode: true,
              flatAmountCents: true,
              perSeatAmountCents: true,
              percentageBps: true,
            },
          },
        },
      },
    },
  });

  if (!order || !order.attributedEventReferrerAssignment) return;

  const assignment = order.attributedEventReferrerAssignment;

  // PARTNER-anchored
  if (assignment.parentPartnerId) {
    const seat = assignment.delegateSeat;
    if (!seat || !isPartnerCommissionMode(seat.commissionMode)) return;
    const seatQty = order.lineItems
      .filter((li) => li.itemType === "ticket" || !li.itemType)
      .reduce((s, li) => s + li.qty, 0);
    const snapshot: CommissionSnapshot = {
      mode: seat.commissionMode,
      flatAmountCents: seat.flatAmountCents,
      perSeatAmountCents: seat.perSeatAmountCents,
      percentageBps: seat.percentageBps,
    };
    const owed = calculatePartnerCommission(snapshot, order.subtotalCents, seatQty);
    await prisma.influencerSubCommissionLedger.create({
      data: {
        orderId,
        seriesId: order.seriesId,
        parentType: "PARTNER",
        parentPartnerId: assignment.parentPartnerId,
        eventReferrerAssignmentId: assignment.id,
        ticketAmountCents: order.subtotalCents,
        // No OKU-paid influencer commission upstream for partner anchor.
        grossInfluencerCommissionCents: 0,
        referrerShareCents: owed,
        influencerRetainedCents: 0,
        currency: order.currency,
        payoutResponsibility: "PARTNER",
        payoutStatus: owed > 0 ? "PENDING" : "NOT_ELIGIBLE",
        commissionModelSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        notes: `Partner-anchored ${seat.commissionMode}`,
      },
    });
    return;
  }

  // HOST-anchored — streetside hosts employed by the restaurant. The
  // restaurant settles payout off-platform (typically payroll), so we
  // emit a reporting row only. Amount stays at 0 here — admin can
  // configure a per-restaurant policy later that fills in the share;
  // for now we record attribution so the host's bookings are visible
  // in commission reports without claiming a payout obligation.
  if (assignment.parentHostProfileId) {
    await prisma.influencerSubCommissionLedger.create({
      data: {
        orderId,
        seriesId: order.seriesId,
        parentType: "HOST",
        parentHostProfileId: assignment.parentHostProfileId,
        eventReferrerAssignmentId: assignment.id,
        ticketAmountCents: order.subtotalCents,
        grossInfluencerCommissionCents: 0,
        referrerShareCents: 0,
        influencerRetainedCents: 0,
        currency: order.currency,
        payoutResponsibility: "RESTAURANT",
        payoutStatus: "NOT_ELIGIBLE",
        notes: "Host-anchored — restaurant settles off-platform",
      },
    });
    return;
  }

  // INFLUENCER-anchored (legacy path)
  if (!assignment.parentInfluencerId) return;
  let referrerShareCents = 0;
  let payoutStatus: "PENDING" | "NOT_ELIGIBLE" = "NOT_ELIGIBLE";

  if (
    assignment.isCommissionEligible &&
    assignment.commissionMode ===
      EventReferrerCommissionMode.PERCENT_OF_INFLUENCER_COMMISSION &&
    assignment.commissionShareBps != null
  ) {
    referrerShareCents = Math.floor(
      (grossInfluencerCommissionCents * assignment.commissionShareBps) / 10000
    );
    payoutStatus = referrerShareCents > 0 ? "PENDING" : "NOT_ELIGIBLE";
  }

  const influencerRetainedCents =
    grossInfluencerCommissionCents - referrerShareCents;

  await prisma.influencerSubCommissionLedger.create({
    data: {
      orderId,
      seriesId: order.seriesId,
      parentType: "INFLUENCER",
      parentInfluencerId: assignment.parentInfluencerId,
      eventReferrerAssignmentId: assignment.id,
      ticketAmountCents: order.subtotalCents,
      grossInfluencerCommissionCents,
      referrerShareCents,
      influencerRetainedCents,
      currency: order.currency,
      payoutResponsibility: "INFLUENCER",
      payoutStatus,
      notes:
        assignment.isCommissionEligible && referrerShareCents > 0
          ? `${(assignment.commissionShareBps! / 100).toFixed(1)}% of influencer commission`
          : "Non-compensated referrer — attribution only",
    },
  });
}

/**
 * Reverses a sub-commission ledger entry when an order is refunded.
 */
export async function reverseSubCommissionForRefund(
  orderId: string
): Promise<void> {
  await prisma.influencerSubCommissionLedger.updateMany({
    where: { orderId, payoutStatus: "PENDING" },
    data: { payoutStatus: "NOT_ELIGIBLE", notes: "Reversed due to refund" },
  });
}

/**
 * Returns payout summary for an influencer:
 * - How much OKU owes them (from LedgerEntry)
 * - How much they owe their referrers (from InfluencerSubCommissionLedger)
 */
export async function getInfluencerPayoutSummary(influencerId: string) {
  const [ledgerEntries, subCommissions] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { influencerId, payoutBatchId: null },
      select: { amountCents: true, currency: true, type: true },
    }),
    prisma.influencerSubCommissionLedger.findMany({
      where: { parentInfluencerId: influencerId, payoutStatus: "PENDING" },
      select: {
        referrerShareCents: true,
        influencerRetainedCents: true,
        grossInfluencerCommissionCents: true,
        currency: true,
      },
    }),
  ]);

  const receivableFromOkuCents = ledgerEntries.reduce((sum, e) => {
    return sum + e.amountCents;
  }, 0);

  const payableToReferrersCents = subCommissions.reduce(
    (sum, s) => sum + s.referrerShareCents,
    0
  );

  const netInfluencerRetainedCents = subCommissions.reduce(
    (sum, s) => sum + s.influencerRetainedCents,
    0
  );

  return {
    receivableFromOkuCents,
    payableToReferrersCents,
    netInfluencerRetainedCents,
    currency: "USD",
  };
}

/**
 * Partner-anchored sub-commission summary. Reports what the partner owes its
 * own referrer/co-host network — informational only (platform doesn't pay).
 */
export async function getPartnerReferrerSummary(partnerId: string, seriesId?: string) {
  const rows = await prisma.influencerSubCommissionLedger.findMany({
    where: {
      parentPartnerId: partnerId,
      ...(seriesId ? { seriesId } : {}),
    },
    select: {
      referrerShareCents: true,
      ticketAmountCents: true,
      payoutStatus: true,
      eventReferrerAssignmentId: true,
      currency: true,
    },
  });
  const totals = {
    ordersAttributed: rows.length,
    grossSalesCents: rows.reduce((s, r) => s + r.ticketAmountCents, 0),
    pendingOwedCents: rows
      .filter((r) => r.payoutStatus === "PENDING")
      .reduce((s, r) => s + r.referrerShareCents, 0),
  };
  return { totals, rows };
}
