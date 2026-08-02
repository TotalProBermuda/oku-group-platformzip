import { EventReferrerCommissionMode } from "@prisma/client";

export interface CommissionModelInput {
  isReferrerEnabled: boolean;
  commissionMode: EventReferrerCommissionMode;
  flatAmountCents?: number | null;
  perSeatAmountCents?: number | null;
  percentageBps?: number | null;
}

export const PARTNER_COMMISSION_MODES: EventReferrerCommissionMode[] = [
  "PARTNER_FLAT_PER_ORDER",
  "PARTNER_PER_SEAT",
  "PARTNER_PERCENT_OF_TICKET",
  "PARTNER_FLAT_PLUS_PER_SEAT",
  "PARTNER_FLAT_PLUS_PERCENT",
];

export function isPartnerCommissionMode(mode: EventReferrerCommissionMode): boolean {
  return PARTNER_COMMISSION_MODES.includes(mode);
}

/**
 * Validates a commission model. Returns null if valid, error string otherwise.
 */
export function validateCommissionModel(input: CommissionModelInput): string | null {
  if (!input.isReferrerEnabled) {
    if (input.commissionMode !== "NONE") {
      return "commissionMode must be NONE when sales is disabled";
    }
    return null;
  }
  if (!isPartnerCommissionMode(input.commissionMode)) {
    return "Invalid partner commission mode";
  }
  const needsFlat = ["PARTNER_FLAT_PER_ORDER", "PARTNER_FLAT_PLUS_PER_SEAT", "PARTNER_FLAT_PLUS_PERCENT"].includes(input.commissionMode);
  const needsPerSeat = ["PARTNER_PER_SEAT", "PARTNER_FLAT_PLUS_PER_SEAT"].includes(input.commissionMode);
  const needsPct = ["PARTNER_PERCENT_OF_TICKET", "PARTNER_FLAT_PLUS_PERCENT"].includes(input.commissionMode);
  if (needsFlat && (input.flatAmountCents == null || input.flatAmountCents < 0)) {
    return "flatAmountCents required and must be >= 0";
  }
  if (needsPerSeat && (input.perSeatAmountCents == null || input.perSeatAmountCents < 0)) {
    return "perSeatAmountCents required and must be >= 0";
  }
  if (needsPct && (input.percentageBps == null || input.percentageBps < 0 || input.percentageBps > 10000)) {
    return "percentageBps required and must be between 0 and 10000";
  }
  return null;
}

export interface CommissionSnapshot {
  mode: EventReferrerCommissionMode;
  flatAmountCents: number | null;
  perSeatAmountCents: number | null;
  percentageBps: number | null;
}

export function snapshotFromInput(input: CommissionModelInput): CommissionSnapshot {
  return {
    mode: input.commissionMode,
    flatAmountCents: input.flatAmountCents ?? null,
    perSeatAmountCents: input.perSeatAmountCents ?? null,
    percentageBps: input.percentageBps ?? null,
  };
}

/**
 * Computes the partner-owed commission for a single attributed order using
 * the snapshotted model. ticketAmountCents is order subtotal, seatQty is
 * total ticket count on the order.
 */
export function calculatePartnerCommission(
  snapshot: CommissionSnapshot,
  ticketAmountCents: number,
  seatQty: number,
): number {
  const flat = snapshot.flatAmountCents ?? 0;
  const perSeat = snapshot.perSeatAmountCents ?? 0;
  const pctBps = snapshot.percentageBps ?? 0;
  switch (snapshot.mode) {
    case "PARTNER_FLAT_PER_ORDER":
      return flat;
    case "PARTNER_PER_SEAT":
      return perSeat * seatQty;
    case "PARTNER_PERCENT_OF_TICKET":
      return Math.floor((ticketAmountCents * pctBps) / 10000);
    case "PARTNER_FLAT_PLUS_PER_SEAT":
      return flat + perSeat * seatQty;
    case "PARTNER_FLAT_PLUS_PERCENT":
      return flat + Math.floor((ticketAmountCents * pctBps) / 10000);
    default:
      return 0;
  }
}
