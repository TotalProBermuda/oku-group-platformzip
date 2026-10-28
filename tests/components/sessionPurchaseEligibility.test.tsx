import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCalendarPurchaseSeries, nextPurchaseBoundary, sessionTicketsOnSale } from "@/lib/sessionPurchaseEligibility";
import SessionTicketAction from "@/components/experiences/SessionTicketAction";

const clicks = vi.hoisted(() => ({ handlers: [] as Array<(event: { preventDefault: () => void }) => void> }));
vi.mock("next/link", () => ({
  default: ({ children, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    if (onClick) clicks.handlers.push(onClick as unknown as typeof clicks.handlers[number]);
    return <a {...props}>{children}</a>;
  },
}));
const now = Date.parse("2026-10-28T18:00:00Z");
const session = {
  id: "cmv1ohwb40006w3f2woikjbnk", status: "SCHEDULED",
  startsAt: "2026-10-28T23:00:00Z", endsAt: "2026-10-29T02:00:00Z",
  capacity: 20, soldCount: 0, allowLateSales: false,
};
const ticket = { id: "ticket", ticketStatus: "ACTIVE", saleStartsAt: "2026-10-28T17:00:00Z", saleEndsAt: "2026-10-28T22:00:00Z" };
const series = { status: "PUBLISHED", ticketTypes: [ticket] };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); clicks.handlers = []; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("UI session sale eligibility follows existing catalog policy", () => {
  it("keeps the exact active Wine Down session, overriding conflicting checkout context", () => {
    const markup = renderToStaticMarkup(<SessionTicketAction session={session} series={series}
      checkoutHrefBase="/en/checkout/wine-down-wednesday" query={{ sessionId: "sibling", ref: "calendar" }}
      unavailableLabel="Tickets not currently on sale">Select Tickets</SessionTicketAction>);
    expect(markup).toContain(`href="/en/checkout/wine-down-wednesday?sessionId=${session.id}&amp;ref=calendar"`);
  });

  it.each([
    ["past", { ...session, endsAt: "2026-10-27T23:00:00Z" }, series],
    ["started without late sales", { ...session, startsAt: "2026-10-28T17:00:00Z" }, series],
    ["cancelled", { ...session, status: "CANCELLED" }, series],
    ["sold out", { ...session, soldCount: 20 }, series],
    ["private series", session, { ...series, status: "DRAFT" }],
    ["sold-out series", session, { ...series, status: "SOLD_OUT" }],
    ["not yet on sale", session, { ...series, ticketTypes: [{ ...ticket, saleStartsAt: "2026-10-29T00:00:00Z" }] }],
    ["sale ended", session, { ...series, ticketTypes: [{ ...ticket, saleEndsAt: "2026-10-27T00:00:00Z" }] }],
    ["inactive product", session, { ...series, ticketTypes: [{ ...ticket, ticketStatus: "INACTIVE" }] }],
    ["hidden product", session, { ...series, ticketTypes: [{ ...ticket, visibilityMode: "HIDDEN" }] }],
    ["disabled session product", { ...session, fieldModes: { "ticket.ticket.enabled": { mode: "clear" } } }, series],
    ["disabled default product", session, { ...series, sessionDefaults: { "ticket.ticket.enabled": { mode: "clear" } } }],
    ["ticket inventory exhausted", session, { ...series, ticketTypes: [{ ...ticket, typeCapacity: 2, soldCount: 2 }] }],
    ["minimum exceeds session inventory", { ...session, soldCount: 19 }, { ...series, ticketTypes: [{ ...ticket, minPerOrder: 2 }] }],
    ["no ticket products", session, { ...series, ticketTypes: [] }],
  ])("does not render a checkout link for %s", (_reason, candidate, catalog) => {
    const markup = renderToStaticMarkup(<SessionTicketAction session={candidate} series={catalog}
      checkoutHrefBase="/en/checkout/wine-down-wednesday"
      unavailableLabel="Tickets not currently on sale">Select Tickets</SessionTicketAction>);
    expect(markup).not.toContain("href=");
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("Tickets not currently on sale");
    expect(sessionTicketsOnSale(candidate, catalog, now)).toBe(false);
  });

  it("allows existing late sales only before the event ends, and honors inclusive ticket boundaries", () => {
    const late = { ...session, startsAt: "2026-10-28T17:00:00Z", allowLateSales: true };
    expect(sessionTicketsOnSale(late, series, now)).toBe(true);
    expect(sessionTicketsOnSale(late, series, Date.parse(late.endsAt))).toBe(false);
    expect(sessionTicketsOnSale(session, series, Date.parse(ticket.saleStartsAt))).toBe(true);
    expect(sessionTicketsOnSale(session, series, Date.parse(ticket.saleStartsAt) - 1)).toBe(false);
    expect(sessionTicketsOnSale(session, series, Date.parse(ticket.saleEndsAt))).toBe(true);
    expect(sessionTicketsOnSale(session, series, Date.parse(ticket.saleEndsAt) + 1)).toBe(false);
    expect(nextPurchaseBoundary(session, series, now)).toBe(Date.parse(ticket.saleEndsAt) + 1);
    expect(nextPurchaseBoundary(session, { ...series, ticketTypes: [{ ...ticket, saleEndsAt: null }] }, now)).toBe(Date.parse(session.startsAt));
  });

  it("prevents activation of a stale link after a sale closes in a background tab", () => {
    renderToStaticMarkup(<SessionTicketAction session={session} series={series}
      checkoutHrefBase="/en/checkout/wine-down-wednesday"
      unavailableLabel="Tickets not currently on sale">Select Tickets</SessionTicketAction>);
    const preventDefault = vi.fn();
    vi.setSystemTime(new Date("2026-10-28T22:00:01Z"));
    clicks.handlers[0]({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    const markup = renderToStaticMarkup(<SessionTicketAction session={session} series={series}
      checkoutHrefBase="/en/checkout/wine-down-wednesday"
      unavailableLabel="Tickets not currently on sale">Select Tickets</SessionTicketAction>);
    expect(markup).not.toContain("href=");
  });

  it("reads each calendar series once without a session override or a truncated general catalog", async () => {
    const fetch = vi.fn(async () => Response.json({ series: [{ ...series, slug: "wine-down-wednesday", sessions: [session] }] }));
    vi.stubGlobal("fetch", fetch);
    const catalog = await loadCalendarPurchaseSeries(["wine-down-wednesday", "wine-down-wednesday"], "es");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/v1/experiences?slug=wine-down-wednesday&locale=es");
    expect(catalog["wine-down-wednesday"].sessions.map(row => row.id)).toEqual([session.id]);
  });

  it("fails closed on unavailable or mismatched calendar sale data", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network failure"); }));
    expect(await loadCalendarPurchaseSeries(["wine-down-wednesday"], "en")).toEqual({});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ series: [{ ...series, slug: "wrong-series", sessions: [session] }] })));
    expect(await loadCalendarPurchaseSeries(["wine-down-wednesday"], "en")).toEqual({});
  });
});
