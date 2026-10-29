import { describe, expect, it } from "vitest";
import { isWithinTicketSalesWindow, resolveTicketSalesWindow } from "@/server/commerce/ticketSalesWindow";

const ticket = {
  saleStartsAt: new Date("2026-10-01T00:00:00Z"),
  saleEndsAt: new Date("2026-10-28T22:59:00Z"),
};

describe("session ticket sale windows", () => {
  it("inherits the series ticket window unless the session opts into an override", () => {
    expect(resolveTicketSalesWindow(ticket, { ticketSalesMode: "INHERIT" })).toEqual({
      startsAt: ticket.saleStartsAt,
      endsAt: ticket.saleEndsAt,
    });
    expect(isWithinTicketSalesWindow(ticket, { ticketSalesMode: "INHERIT" }, new Date("2026-10-28T23:00:00Z"))).toBe(false);
  });

  it("allows one session to replace a stale series cutoff without changing the ticket type", () => {
    const event = {
      ticketSalesMode: "OVERRIDE" as const,
      ticketSalesStartAt: new Date("2026-10-28T20:00:00Z"),
      ticketSalesEndAt: new Date("2026-10-29T02:00:00Z"),
    };
    expect(isWithinTicketSalesWindow(ticket, event, new Date("2026-10-28T23:00:00Z"))).toBe(true);
    expect(isWithinTicketSalesWindow(ticket, event, new Date("2026-10-29T02:01:00Z"))).toBe(false);
  });

  it("treats blank boundaries in override mode as open boundaries", () => {
    expect(isWithinTicketSalesWindow(ticket, { ticketSalesMode: "OVERRIDE", ticketSalesStartAt: null, ticketSalesEndAt: null }, new Date("2026-10-29T02:00:00Z"))).toBe(true);
  });
});
