type PricingRule = {
  conditionJson: unknown;
  actionJson: unknown;
};

type PriceableTicket = {
  priceCents: number;
  typeCapacity: number | null;
  soldCount: number;
  pricingRules?: PricingRule[];
};

/** One authoritative ticket-price calculation shared by quote and intent. */
export function calculateTicketUnitPrice(input: {
  ticket: PriceableTicket;
  sessionPriceCents?: number | null;
  membershipDiscountBps?: number | null;
  applyMembershipDiscount?: boolean;
}): number {
  const { ticket } = input;
  const sessionPrice = input.sessionPriceCents;
  let unitPrice = Number.isInteger(sessionPrice) && sessionPrice! >= 0 ? sessionPrice! : ticket.priceCents;
  const remaining = Math.max(0, (ticket.typeCapacity ?? 9999) - ticket.soldCount);
  const remainingPct = remaining / (ticket.typeCapacity ?? 1);

  for (const rule of ticket.pricingRules ?? []) {
    const condition = rule.conditionJson as { field?: string; operator?: string; value?: number };
    const action = rule.actionJson as { type?: string; value?: number };
    const matches = condition.field === "remainingPct" && condition.operator === "lt" &&
      typeof condition.value === "number" && remainingPct < condition.value / 100;
    if (matches && action.type === "price_increase_pct" && typeof action.value === "number") {
      unitPrice = Math.round(unitPrice * (1 + action.value / 100));
    }
  }

  if (input.applyMembershipDiscount && input.membershipDiscountBps) {
    unitPrice = Math.round(unitPrice * (1 - input.membershipDiscountBps / 10_000));
  }
  return unitPrice;
}
