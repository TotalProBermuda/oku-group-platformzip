import { prisma } from "@/lib/prisma";
import {
  createSubCommissionIfApplicable,
  reverseSubCommissionForRefund,
} from "@/server/events/subCommissionService";

/**
 * Order-level commission router. Called once per paid order.
 *
 * Three anchor systems, mutually exclusive on a per-order basis:
 *
 * SYSTEM 1 — INFLUENCER COMMISSION (paid by OKU)
 *   When the order is attributed to an influencer (host), OKU writes a
 *   LedgerEntry payable to that influencer. If a referrer was also attributed,
 *   we then write a sub-commission row for that referrer.
 *
 * SYSTEM 2 — PARTNER-ANCHORED REFERRER (paid by Partner, NOT OKU)
 *   When the order is attributed to a partner-anchored referrer assignment,
 *   OKU writes NO LedgerEntry. We only write a sub-commission row for
 *   reporting; the partner pays the seller out-of-band.
 *
 * SYSTEM 3 — HOST-ANCHORED REFERRER (paid by Restaurant, NOT OKU)
 *   Streetside hosts are first-class referrers, employed by the restaurant.
 *   The restaurant settles their commission off-platform (typically via
 *   payroll). OKU writes NO LedgerEntry; we only emit a reporting row,
 *   same as the partner-anchored path.
 *
 * If multiple anchors are somehow present, partner > host > influencer
 * (an explicit external sales seat takes precedence over an internally
 * employed host, which takes precedence over implicit host attribution).
 */
export async function createCommissionIfAttributed(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      attributedInfluencer: true,
      attributedEventReferrerAssignment: {
        select: { id: true, parentPartnerId: true, parentInfluencerId: true, parentHostProfileId: true },
      },
    },
  });
  if (!order) throw new Error("Order not found");

  const referrer = order.attributedEventReferrerAssignment;
  const isPartnerAnchored = !!referrer?.parentPartnerId;
  const isHostAnchored = !!referrer?.parentHostProfileId;

  // PARTNER-anchored: skip OKU LedgerEntry, only emit reporting row.
  if (isPartnerAnchored) {
    await createSubCommissionIfApplicable(order.id, 0);
    return null;
  }

  // HOST-anchored: same as partner — restaurant pays, OKU just reports.
  if (isHostAnchored) {
    await createSubCommissionIfApplicable(order.id, 0);
    return null;
  }

  // INFLUENCER-anchored (or unattributed)
  if (!order.attributedInfluencerId || !order.attributedInfluencer) {
    // No influencer attribution and no partner referrer — nothing to do.
    // (If a non-partner referrer assignment exists without an influencer, we
    // still emit a sub-commission reporting row.)
    if (referrer?.id) {
      await createSubCommissionIfApplicable(order.id, 0);
    }
    return null;
  }

  const rateBps = order.attributedInfluencer.commissionRateBps;
  const net = order.subtotalCents;
  const grossCommissionCents = Math.floor((net * rateBps) / 10000);

  const ledgerEntry = await prisma.ledgerEntry.create({
    data: {
      influencerId: order.attributedInfluencerId,
      orderId: order.id,
      type: "COMMISSION_EARNED",
      amountCents: grossCommissionCents,
      currency: order.currency,
      note: `Commission ${rateBps / 100}% on net ${net}`,
    },
  });

  if (referrer?.id) {
    await createSubCommissionIfApplicable(order.id, grossCommissionCents);
  }

  return ledgerEntry;
}

/**
 * Reverses influencer commission and any referrer sub-commissions on refund.
 */
export async function reverseCommissionForRefund(orderId: string) {
  const earned = await prisma.ledgerEntry.findFirst({
    where: { orderId, type: "COMMISSION_EARNED" },
  });

  // Always reverse any sub-commission rows (covers partner-anchored case where
  // no LedgerEntry exists).
  await reverseSubCommissionForRefund(orderId);

  if (!earned) return null;

  const reversal = await prisma.ledgerEntry.create({
    data: {
      influencerId: earned.influencerId,
      orderId,
      type: "COMMISSION_REVERSED",
      amountCents: -Math.abs(earned.amountCents),
      currency: earned.currency,
      note: "Refund/chargeback reversal",
    },
  });

  return reversal;
}
