type SaleWindowSource = {
  saleStartsAt?: Date | null;
  saleEndsAt?: Date | null;
};

type SessionSaleWindow = {
  ticketSalesMode?: "INHERIT" | "OVERRIDE" | null;
  ticketSalesStartAt?: Date | null;
  ticketSalesEndAt?: Date | null;
};

/** Resolve a ticket's effective window for one event. OVERRIDE intentionally
 * replaces both boundaries (including a null/open boundary) for that event;
 * INHERIT keeps the existing series ticket-type behavior. */
export function resolveTicketSalesWindow(ticket: SaleWindowSource, session: SessionSaleWindow) {
  if (session.ticketSalesMode === "OVERRIDE") {
    return { startsAt: session.ticketSalesStartAt ?? null, endsAt: session.ticketSalesEndAt ?? null };
  }
  return { startsAt: ticket.saleStartsAt ?? null, endsAt: ticket.saleEndsAt ?? null };
}

export function isWithinTicketSalesWindow(
  ticket: SaleWindowSource,
  session: SessionSaleWindow,
  now: Date,
) {
  const window = resolveTicketSalesWindow(ticket, session);
  return !(window.startsAt && now < window.startsAt) && !(window.endsAt && now > window.endsAt);
}
