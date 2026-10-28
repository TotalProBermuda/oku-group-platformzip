import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enCommon from "@/i18n/translations/en/common.json";
import esCommon from "@/i18n/translations/es/common.json";
import ptCommon from "@/i18n/translations/pt/common.json";

// Seed only the parent component's state for deterministic rendered calendar states.
// Effects never run during server rendering, so no API or database is contacted.
const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useState: (initial: unknown) => actual.useState(
      state.index < state.values.length ? state.values[state.index++] : initial,
    ),
  };
});

import ExperienceSessionsView from "@/components/experiences/ExperienceSessionsView";
import EventsCalendarView from "@/components/ui/EventsCalendarView";

const slug = "wine-down-wednesday";
const sessionId = "cmv1ohwb40006w3f2woikjbnk";
const sessions = [
  { id: sessionId, title: "Wine Down January 13", description: "Inline description stays here.",
    startsAt: "2027-01-14T00:00:00Z", endsAt: "2027-01-14T03:00:00Z",
    capacity: 20, soldCount: 0, status: "SCHEDULED" },
  { id: "sibling-session", title: "Wine Down January 20", description: "Sibling description.",
    startsAt: "2027-01-21T00:00:00Z", endsAt: "2027-01-21T03:00:00Z",
    capacity: 20, soldCount: 0, status: "SCHEDULED" },
];
const calendars = { en: enCommon, es: esCommon, pt: ptCommon };
const ticketTypes = [{ id: "ticket", ticketStatus: "ACTIVE", priceCents: 3500 }];
const purchaseSeries = { status: "PUBLISHED", ticketTypes };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-28T18:00:00Z")); });
afterEach(() => { state.values = []; state.index = 0; vi.useRealTimers(); });

function seed(values: unknown[]) {
  state.values = values;
  state.index = 0;
}

function assertCardLinks(markup: string, locale: string, expectedIds: string[], onSaleIds = expectedIds) {
  const cards = [...markup.matchAll(/<article\b[^>]*id="session-([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
  expect(cards.map(card => card[1])).toEqual(expectedIds);
  for (const [, id, card] of cards) {
    const hrefs = [...card.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&"));
    expect(hrefs.filter(href => href.includes("/experiences/"))).toEqual([
      `/${locale}/experiences/${slug}/sessions/${id}`,
    ]);
    expect(hrefs.filter(href => href.includes("/checkout/"))).toEqual(onSaleIds.includes(id) ? [
      `/${locale}/checkout/${slug}?sessionId=${id}`,
    ] : []);
  }
}

describe("rendered session navigation (fixtures only, no database)", () => {
  it.each(["en", "es", "pt"] as const)("keeps %s sibling series cards distinct in list and calendar modes", locale => {
    for (const view of ["list", "calendar"]) {
      seed([view, new Date(2027, 0, 1), ""]);
      const markup = renderToStaticMarkup(<ExperienceSessionsView
        sessions={sessions} seriesSlug={slug} seriesTitle="Wine Down Wednesday" seriesDescription=""
        seriesStatus="PUBLISHED" ticketTypes={ticketTypes} checkoutHrefBase={`/${locale}/checkout/${slug}`} venue="OKU" locale={locale}
        focusSessionId={sessionId}
        labels={{ viewEvent: calendars[locale].viewEventLink, selectTickets: calendars[locale].selectTickets }}
      />);
      assertCardLinks(markup, locale, [sessionId, "sibling-session"]);
      expect(markup).toContain(calendars[locale].viewEventLink);
      expect(markup).toContain("Inline description stays here.");
      expect(markup).toContain("-webkit-line-clamp:2");
      expect(markup).toContain("border-color:#c41e3a;border-width:2px");
    }
  });

  it("retains navigation on day-filtered shared series cards and on non-scheduled cards", () => {
    seed(["calendar", new Date(2027, 0, 1), "2027-01-20"]);
    const markup = renderToStaticMarkup(<ExperienceSessionsView
      sessions={[sessions[0], { ...sessions[1], status: "CANCELLED" }]} seriesSlug={slug}
      seriesStatus="PUBLISHED" seriesTitle="Wine Down" seriesDescription="" ticketTypes={[]}
      checkoutHrefBase={`/en/checkout/${slug}`} venue="OKU" locale="en"
      labels={{ viewEvent: "View event", selectTickets: "Select Tickets" }}
    />);
    expect(markup).not.toContain(`id="session-${sessionId}"`);
    expect(markup).toContain(`href="/en/experiences/${slug}/sessions/sibling-session"`);
    expect(markup).not.toContain("/checkout/");
  });

  it.each(["en", "es", "pt"])("uses canonical %s month, day-filtered and compact preview links", locale => {
    const rows = sessions.map(session => ({
      ...session, series: { id: "series", slug, title: "Wine Down Wednesday", venue: "OKU", heroImageUrl: null },
    }));
    for (const [selectedDay, hoveredDay, expectedIds] of [
      [null, null, [sessionId, "sibling-session"]],
      [20, null, ["sibling-session"]],
      [null, 13, [sessionId, "sibling-session", sessionId]],
    ] as const) {
      seed([2027, 0, selectedDay, hoveredDay, rows, false, "calendar", { [slug]: { ...purchaseSeries, slug, sessions } }]);
      const markup = renderToStaticMarkup(<EventsCalendarView locale={locale} labels={{ calendarGetTickets: "Get Tickets" }} />);
      assertCardLinks(markup, locale, [...expectedIds]);
      if (hoveredDay) expect(markup).toContain('aria-label="Event previews for 13"');
    }
  });

  it.each([
    ["ongoing without late sales", "2027-01-14T01:00:00Z"],
    ["past", "2027-01-15T01:00:00Z"],
  ])("keeps %s cards readable but cannot buy a sibling instead", (_reason, now) => {
    vi.setSystemTime(new Date(now));
    for (const view of ["list", "calendar"]) {
      seed([view, new Date(2027, 0, 1), ""]);
      const markup = renderToStaticMarkup(<ExperienceSessionsView
        sessions={sessions} seriesSlug={slug} seriesStatus="PUBLISHED"
        seriesTitle="Wine Down" seriesDescription="" ticketTypes={ticketTypes}
        checkoutHrefBase={`/en/checkout/${slug}`} venue="OKU" locale="en"
        labels={{ viewEvent: "View event", selectTickets: "Select Tickets", ticketsNotOnSale: enCommon.ticketsNotOnSale }}
      />);
      assertCardLinks(markup, "en", [sessionId, "sibling-session"], ["sibling-session"]);
      expect(markup).toContain(enCommon.ticketsNotOnSale);
    }
    const rows = sessions.map(session => ({
      ...session, series: { id: "series", slug, title: "Wine Down", venue: "OKU", heroImageUrl: null },
    }));
    for (const [day, hover, ids] of [
      [null, null, [sessionId, "sibling-session"]],
      [13, null, [sessionId]],
      [null, 13, [sessionId, "sibling-session", sessionId]],
    ] as const) {
      // The existing sale-filtered catalog no longer includes the closed session.
      seed([2027, 0, day, hover, rows, false, "calendar", { [slug]: { ...purchaseSeries, slug, sessions: [sessions[1]] } }]);
      const markup = renderToStaticMarkup(<EventsCalendarView locale="en" labels={{}} />);
      assertCardLinks(markup, "en", [...ids], ["sibling-session"]);
      expect(markup).toContain(enCommon.ticketsNotOnSale);
    }
  });

  it("disables a product-sales-closed session while its sibling's enabled product stays on sale", () => {
    const closedTicket = { ...ticketTypes[0], saleEndsAt: "2026-10-27T00:00:00Z" };
    const siblingTicket = { ...ticketTypes[0], id: "sibling-ticket" };
    const rows = [
      { ...sessions[0], fieldModes: { "ticket.sibling-ticket.enabled": { mode: "clear" } } },
      { ...sessions[1], fieldModes: { "ticket.ticket.enabled": { mode: "clear" } } },
    ];
    seed(["list", new Date(2027, 0, 1), ""]);
    const markup = renderToStaticMarkup(<ExperienceSessionsView
      sessions={rows} seriesSlug={slug} seriesStatus="PUBLISHED"
      seriesTitle="Wine Down" seriesDescription="" ticketTypes={[closedTicket, siblingTicket]}
      checkoutHrefBase={`/en/checkout/${slug}`} venue="OKU" locale="en"
      labels={{ viewEvent: "View event", selectTickets: "Select Tickets", ticketsNotOnSale: enCommon.ticketsNotOnSale }}
    />);
    assertCardLinks(markup, "en", [sessionId, "sibling-session"], ["sibling-session"]);
    seed([2027, 0, null, 13, rows.map(session => ({
      ...session, series: { id: "series", slug, title: "Wine Down", venue: "OKU", heroImageUrl: null },
    })), false, "calendar", { [slug]: { status: "PUBLISHED", slug, ticketTypes: [closedTicket, siblingTicket], sessions: rows } }]);
    assertCardLinks(renderToStaticMarkup(<EventsCalendarView locale="en" labels={{}} />), "en",
      [sessionId, "sibling-session", sessionId], ["sibling-session"]);
  });

  it("fails closed while calendar sale data is missing, without hiding View Event", () => {
    const rows = sessions.map(session => ({
      ...session, series: { id: "series", slug, title: "Wine Down", venue: "OKU", heroImageUrl: null },
    }));
    seed([2027, 0, null, null, rows, false, "list", {}]);
    assertCardLinks(renderToStaticMarkup(<EventsCalendarView locale="en" labels={{}} />), "en",
      [sessionId, "sibling-session"], []);
  });

  it("preserves the active Oct 28 Wine Down sale link on shared and month cards", () => {
    const active = { ...sessions[0], startsAt: "2026-10-28T23:00:00Z", endsAt: "2026-10-29T02:00:00Z" };
    seed(["list", new Date(2026, 9, 1), ""]);
    assertCardLinks(renderToStaticMarkup(<ExperienceSessionsView
      sessions={[active]} seriesSlug={slug} seriesStatus="PUBLISHED" seriesTitle="Wine Down"
      seriesDescription="" ticketTypes={ticketTypes} checkoutHrefBase={`/en/checkout/${slug}`}
      venue="OKU" locale="en" labels={{ selectTickets: "Select Tickets", viewEvent: "View event" }}
    />), "en", [sessionId]);
    seed([2026, 9, null, null, [{
      ...active, series: { id: "series", slug, title: "Wine Down", venue: "OKU", heroImageUrl: null },
    }], false, "list", { [slug]: { ...purchaseSeries, slug, sessions: [active] } }]);
    assertCardLinks(renderToStaticMarkup(<EventsCalendarView locale="en" labels={{}} />), "en", [sessionId]);
  });
});
