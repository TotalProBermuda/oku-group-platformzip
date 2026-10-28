import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EventArtwork from "@/components/ui/EventArtwork";
import ExperienceSessionsView from "@/components/experiences/ExperienceSessionsView";
import { seriesArtworkCandidates } from "@/lib/eventArtwork";

describe("series/session artwork rendering", () => {
  it("keeps the reported focused session highlighted with its session-bound ticket link", () => {
    const sessionId = "cmv1ohwb40006w3f2woikjbnk";
    const markup = renderToStaticMarkup(<ExperienceSessionsView
      sessions={[{ id: sessionId, title: "Wine Down Wednesday", startsAt: "2027-01-01T20:00:00Z", endsAt: "2027-01-01T22:00:00Z", capacity: 20, soldCount: 0, status: "SCHEDULED" }]}
      focusSessionId={sessionId} seriesSlug="wine-down-wednesday" seriesTitle="Wine Down Wednesday" seriesDescription=""
      seriesStatus="PUBLISHED" ticketTypes={[{ id: "ticket", ticketStatus: "ACTIVE", priceCents: 3500 }]} checkoutHrefBase="/en/checkout/wine-down-wednesday"
      venue="OKU" locale="en" labels={{ selectTickets: "Select Tickets" }} />);
    expect(markup).toContain(`id="session-${sessionId}"`);
    expect(markup).toContain("border-color:#c41e3a;border-width:2px");
    expect(markup).toContain(`href="/en/checkout/wine-down-wednesday?sessionId=${sessionId}"`);
    expect(markup).toContain("Select Tickets");
  });

  it.each(["en", "es", "pt"])("renders %s series hero and session card using shared candidates", locale => {
    const series = { heroImageUrl: "/legacy.jpg", heroImageUrlEn: "/en.jpg", heroImageUrlEs: "/es.jpg", heroImageUrlPt: "/pt.jpg" };
    const hero = renderToStaticMarkup(<EventArtwork candidates={seriesArtworkCandidates(series, locale)} alt="Series hero" />);
    expect(hero).toContain(`src="/${locale}.jpg"`);
    const markup = renderToStaticMarkup(<ExperienceSessionsView
      sessions={[{ id: "session-1", title: "Session", startsAt: "2027-01-01T20:00:00Z", endsAt: "2027-01-01T22:00:00Z", capacity: 20, soldCount: 0, status: "SCHEDULED", flyerImageUrlEn: "/session-en.jpg", flyerImageUrlEs: "/session-es.jpg", flyerImageUrlPt: "/session-pt.jpg" }]}
      seriesSlug="series" seriesStatus="PUBLISHED" seriesTitle="Series" seriesDescription="Description" seriesArtwork={series} ticketTypes={[{ id: "ticket", ticketStatus: "ACTIVE", priceCents: 3500 }]}
      checkoutHrefBase={`/${locale}/checkout/series`} venue="OKU" locale={locale} labels={{}} />);
    expect(markup).toContain(`src="/session-${locale}.jpg"`);
    expect(markup).toContain(`/${locale}/checkout/series?sessionId=session-1`);
  });
  it("renders nothing rather than an empty/broken img when no artwork exists", () => {
    expect(renderToStaticMarkup(<EventArtwork candidates={[]} alt="" />)).toBe("");
  });
  it("session missing artwork inherits localized series artwork", () => {
    const markup = renderToStaticMarkup(<ExperienceSessionsView
      sessions={[{ id: "s", title: null, startsAt: "2027-01-01T20:00:00Z", endsAt: "2027-01-01T22:00:00Z", capacity: 2, soldCount: 0, status: "SCHEDULED" }]}
      seriesSlug="series" seriesTitle="Series" seriesDescription="" seriesArtwork={{ heroImageUrlEn: "/en.jpg", heroImageUrlEs: "/es.jpg" }}
      seriesStatus="PUBLISHED" ticketTypes={[]} checkoutHrefBase="/es/checkout/series" venue="CATCH" locale="es" labels={{}} />);
    expect(markup).toContain('src="/es.jpg"');
  });
});
