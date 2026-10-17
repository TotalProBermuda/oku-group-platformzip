import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EventArtwork from "@/components/ui/EventArtwork";
import ExperienceSessionsView from "@/components/experiences/ExperienceSessionsView";
import ResponsiveEventArtwork from "@/components/ui/ResponsiveEventArtwork";
import { seriesArtworkCandidates, sessionMobileArtworkCandidates } from "@/lib/eventArtwork";

describe("series/session artwork rendering", () => {
  it.each(["en", "es", "pt"])("renders %s series hero and session card using shared candidates", locale => {
    const series = { heroImageUrl: "/legacy.jpg", heroImageUrlEn: "/en.jpg", heroImageUrlEs: "/es.jpg", heroImageUrlPt: "/pt.jpg" };
    const hero = renderToStaticMarkup(<EventArtwork candidates={seriesArtworkCandidates(series, locale)} alt="Series hero" />);
    expect(hero).toContain(`src="/${locale}.jpg"`);
    const markup = renderToStaticMarkup(<ExperienceSessionsView
      sessions={[{ id: "session-1", title: "Session", startsAt: "2027-01-01T20:00:00Z", endsAt: "2027-01-01T22:00:00Z", capacity: 20, soldCount: 0, status: "SCHEDULED", flyerImageUrlEn: "/session-en.jpg", flyerImageUrlEs: "/session-es.jpg", flyerImageUrlPt: "/session-pt.jpg" }]}
      seriesTitle="Series" seriesDescription="Description" seriesArtwork={series} ticketTypes={[]}
      checkoutHrefBase={`/${locale}/checkout/series`} eventHrefBase={`/${locale}/experiences/series`} venue="OKU" locale={locale} labels={{}} />);
    expect(markup).toContain(`src="/session-${locale}.jpg"`);
    expect(markup).toContain(`/${locale}/checkout/series?sessionId=session-1`);
    expect(markup).toContain(`/${locale}/experiences/series?sessionId=session-1#session-session-1`);
    expect(markup).toContain("Series");
    expect(markup).toContain("Session");
  });
  it("server-renders the regular flyer and retains portrait mobile candidates for client selection", () => {
    const session = { flyerImageUrlEn: "/desktop-en.jpg", flyerImageUrlMobileEn: "/mobile-en.jpg" };
    const markup = renderToStaticMarkup(<ResponsiveEventArtwork
      desktopCandidates={["/desktop-en.jpg"]}
      mobileCandidates={sessionMobileArtworkCandidates(session, "en")}
      alt="Event artwork"
    />);
    expect(markup).toContain('src="/desktop-en.jpg"');
    expect(sessionMobileArtworkCandidates(session, "en")).toEqual(["/mobile-en.jpg", "/desktop-en.jpg"]);
  });
  it("renders nothing rather than an empty/broken img when no artwork exists", () => {
    expect(renderToStaticMarkup(<EventArtwork candidates={[]} alt="" />)).toBe("");
  });
  it("session missing artwork inherits localized series artwork", () => {
    const markup = renderToStaticMarkup(<ExperienceSessionsView
      sessions={[{ id: "s", title: null, startsAt: "2027-01-01T20:00:00Z", endsAt: "2027-01-01T22:00:00Z", capacity: 2, soldCount: 0, status: "SCHEDULED" }]}
      seriesTitle="Series" seriesDescription="" seriesArtwork={{ heroImageUrlEn: "/en.jpg", heroImageUrlEs: "/es.jpg" }}
      ticketTypes={[]} checkoutHrefBase="/es/checkout/series" eventHrefBase="/es/experiences/series" venue="CATCH" locale="es" labels={{}} />);
    expect(markup).toContain('src="/es.jpg"');
  });
  it("focused session page presents the series first and isolates the chosen date", () => {
    const sessions = [
      { id: "focus", title: "A Taste of Provence", startsAt: "2027-01-01T20:00:00Z", endsAt: "2027-01-01T22:00:00Z", capacity: 20, soldCount: 0, status: "SCHEDULED" },
      { id: "later", title: "Discover Bordeaux", startsAt: "2027-01-08T20:00:00Z", endsAt: "2027-01-08T22:00:00Z", capacity: 20, soldCount: 0, status: "SCHEDULED" },
    ];
    const markup = renderToStaticMarkup(<ExperienceSessionsView sessions={sessions} seriesTitle="Wine Down Wednesday"
      seriesDescription="Series description" focusSessionId="focus" ticketTypes={[]} checkoutHrefBase="/en/checkout/wine-down-wednesday"
      eventHrefBase="/en/experiences/wine-down-wednesday" venue="OKU" locale="en" labels={{ selectTickets: "Select tickets" }} />);
    expect(markup).toContain("Wine Down Wednesday");
    expect(markup).toContain("A Taste of Provence");
    expect(markup).not.toContain("Discover Bordeaux");
    expect(markup).not.toContain('role="group" aria-label="undefined"');
  });
});
