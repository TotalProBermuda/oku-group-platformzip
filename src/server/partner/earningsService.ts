import { prisma } from "@/lib/prisma";
import type { EventReferrerCommissionMode } from "@prisma/client";
import { calculatePartnerCommission, type CommissionSnapshot } from "@/server/partnerSeats/commissionModel";

export interface SeatCommissionContext {
  commissionMode: EventReferrerCommissionMode;
  flatAmountCents: number | null;
  perSeatAmountCents: number | null;
  percentageBps: number | null;
}

function seatToSnapshot(seat: SeatCommissionContext): CommissionSnapshot {
  return {
    mode: seat.commissionMode,
    flatAmountCents: seat.flatAmountCents,
    perSeatAmountCents: seat.perSeatAmountCents,
    percentageBps: seat.percentageBps,
  };
}

export interface PartnerEarningsRow {
  sessionId: string | null;
  sessionTitle: string | null;
  sessionStartsAt: string | null;
  ticketsSold: number;
  ordersCount: number;
  grossCents: number;
  /** Estimated partner share — null when share/commission not configured. */
  partnerShareCents: number | null;
}

export interface PartnerEarningsSummary {
  /**
   * Effective basis-points rate when the commission can be expressed as a
   * single percentage (series.partnerShareBps OR seat PARTNER_PERCENT_OF_TICKET).
   * Null for flat/per-seat/composite seat commissions — UI should fall back to
   * `commissionLabel`.
   */
  partnerShareBps: number | null;
  /** Human-readable commission descriptor (e.g. "3.50% per ticket", "$5.00 / seat"). */
  commissionLabel: string | null;
  /** Source of the commission shown to the caller. */
  commissionSource: "series" | "seat" | null;
  totals: {
    ticketsSold: number;
    ordersCount: number;
    grossCents: number;
    partnerShareCents: number | null;
  };
  bySession: PartnerEarningsRow[];
}

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function describeSeatCommission(seat: SeatCommissionContext): string {
  const pct = seat.percentageBps != null ? `${(seat.percentageBps / 100).toFixed(2)}%` : null;
  const flat = seat.flatAmountCents != null ? fmtUsd(seat.flatAmountCents) : null;
  const perSeat = seat.perSeatAmountCents != null ? fmtUsd(seat.perSeatAmountCents) : null;

  switch (seat.commissionMode) {
    case "PARTNER_PERCENT_OF_TICKET":
      return `${pct ?? "0%"} of ticket`;
    case "PARTNER_FLAT_PER_ORDER":
      return `${flat ?? "$0"} per order`;
    case "PARTNER_PER_SEAT":
      return `${perSeat ?? "$0"} per seat`;
    case "PARTNER_FLAT_PLUS_PER_SEAT":
      return `${flat ?? "$0"} + ${perSeat ?? "$0"}/seat`;
    case "PARTNER_FLAT_PLUS_PERCENT":
      return `${flat ?? "$0"} + ${pct ?? "0%"}`;
    case "PERCENT_OF_INFLUENCER_COMMISSION":
      return `${pct ?? "0%"} of influencer commission`;
    case "NONE":
    default:
      return "Not configured";
  }
}

/**
 * Aggregate sales/earnings for a series, broken down by session. When the
 * caller has a sales-enabled delegate seat (`callerSeat`), earnings reflect
 * the seat's commission model (partner-anchored). Otherwise falls back to
 * series.partnerShareBps. When neither is configured, partnerShareCents is
 * null and the panel surfaces a "share not configured" hint.
 *
 * `restrictToSessionIds` scopes the result to specific session IDs (used for
 * CO_HOST callers who only see their own sessions).
 */
export async function getPartnerEarnings(
  seriesId: string,
  opts: {
    restrictToSessionIds?: Set<string> | null;
    callerSeat?: SeatCommissionContext | null;
  } = {},
): Promise<PartnerEarningsSummary> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { partnerShareBps: true },
  });
  const seriesBps = series?.partnerShareBps ?? null;
  const seat = opts.callerSeat && opts.callerSeat.commissionMode !== "NONE" ? opts.callerSeat : null;

  const orderWhere: any = { seriesId, status: "PAID" };
  if (opts.restrictToSessionIds && opts.restrictToSessionIds.size > 0) {
    orderWhere.sessionId = { in: Array.from(opts.restrictToSessionIds) };
  }

  const orders = await prisma.order.findMany({
    where: orderWhere,
    select: {
      totalCents: true,
      sessionId: true,
      session: { select: { id: true, title: true, startsAt: true } },
      lineItems: { select: { qty: true, itemType: true, unitPriceCents: true } },
    },
  });

  const seatSnapshot = seat ? seatToSnapshot(seat) : null;

  const acc = new Map<string, PartnerEarningsRow>();
  let totalGross = 0;
  let totalTickets = 0;
  let totalOrders = 0;
  let totalShare = 0;

  for (const o of orders) {
    const sid = o.sessionId ?? "__none__";
    // Tickets count and ticket subtotal exclude non-ticket line items (addons).
    let tickets = 0;
    let ticketSubtotalCents = 0;
    for (const li of o.lineItems) {
      const isTicket = !li.itemType || li.itemType === "ticket";
      if (!isTicket) continue;
      tickets += li.qty ?? 0;
      ticketSubtotalCents += (li.unitPriceCents ?? 0) * (li.qty ?? 0);
    }

    // Per-order commission via canonical calculator (seat) or series bps (legacy).
    let orderShare = 0;
    if (seatSnapshot) {
      orderShare = calculatePartnerCommission(seatSnapshot, ticketSubtotalCents, tickets);
    } else if (seriesBps != null) {
      orderShare = Math.round((o.totalCents * seriesBps) / 10000);
    }

    totalGross += o.totalCents;
    totalTickets += tickets;
    totalOrders += 1;
    totalShare += orderShare;

    const existing = acc.get(sid);
    if (existing) {
      existing.grossCents += o.totalCents;
      existing.ticketsSold += tickets;
      existing.ordersCount += 1;
      existing.partnerShareCents = (existing.partnerShareCents ?? 0) + orderShare;
    } else {
      acc.set(sid, {
        sessionId: o.session?.id ?? null,
        sessionTitle: o.session?.title ?? null,
        sessionStartsAt: o.session?.startsAt ? o.session.startsAt.toISOString() : null,
        ticketsSold: tickets,
        ordersCount: 1,
        grossCents: o.totalCents,
        partnerShareCents: seatSnapshot || seriesBps != null ? orderShare : null,
      });
    }
  }

  const bySession = Array.from(acc.values()).sort((a, b) => {
    if (!a.sessionStartsAt) return 1;
    if (!b.sessionStartsAt) return -1;
    return a.sessionStartsAt.localeCompare(b.sessionStartsAt);
  });

  // Headline rate / label resolution.
  let partnerShareBps: number | null = null;
  let commissionLabel: string | null = null;
  let commissionSource: "series" | "seat" | null = null;
  if (seat) {
    commissionSource = "seat";
    commissionLabel = describeSeatCommission(seat);
    partnerShareBps = seat.commissionMode === "PARTNER_PERCENT_OF_TICKET" ? seat.percentageBps : null;
  } else if (seriesBps != null) {
    commissionSource = "series";
    partnerShareBps = seriesBps;
    commissionLabel = `${(seriesBps / 100).toFixed(2)}%`;
  }

  const haveCommission = seatSnapshot != null || seriesBps != null;

  return {
    partnerShareBps,
    commissionLabel,
    commissionSource,
    totals: {
      ticketsSold: totalTickets,
      ordersCount: totalOrders,
      grossCents: totalGross,
      partnerShareCents: haveCommission ? totalShare : null,
    },
    bySession,
  };
}
