import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((): never => { throw new Error("REDIRECT"); }),
  notFound: vi.fn((): never => { throw new Error("NOT_FOUND"); }),
  fetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/i18n/getTranslations", () => ({
  getTranslations: vi.fn(async () => ({ common: {
    selectTickets: "Select Tickets", sessionsHeading: "Sessions", aboutThisExperience: "About",
    bookYourPlace: "Book your place", left: "left", from: "From",
  } })),
}));
vi.mock("@/components/sponsors/EventPageSponsorBlock", () => ({ default: () => null }));
vi.mock("@/components/experiences/EventMenusSection", () => ({ default: () => null }));
vi.mock("@/components/ui/ShareButtons", () => ({ default: () => null }));

import sessionPage, { generateMetadata } from "@/app/[locale]/experiences/[slug]/sessions/[sessionId]/page";
import seriesPage from "@/app/[locale]/experiences/[slug]/page";

const slug = "wine-down-wednesday";
const sessionId = "cmv1ohwb40006w3f2woikjbnk";
function fixture(locale = "en") {
  return {
    id: "series-1", slug, title: "Wine Down Wednesday", description: "Series details",
    venue: "OKU", heroImageUrlEn: "/series-en.jpg", heroImageUrlEs: "/series-es.jpg",
    ticketTypes: [{ id: "ticket", name: "General Admission", priceCents: 3500 }],
    sessions: [
      { id: "other-session", title: "Another Wednesday", description: "Other details",
        startsAt: "2027-01-06T23:00:00Z", endsAt: "2027-01-07T02:00:00Z",
        capacity: 20, soldCount: 0, status: "SCHEDULED" },
      { id: sessionId, title: `${locale} requested Wine Down`, subtitle: `${locale} event subtitle`,
        description: `${locale} requested event details`, flyerImageUrlEn: "/session-en.jpg", flyerImageUrlEs: "/session-es.jpg",
        startsAt: "2027-01-14T00:00:00Z", endsAt: "2027-01-14T03:00:00Z",
        capacity: 20, soldCount: 0, status: "SCHEDULED",
        ticketPrices: [{ ticketTypeId: "ticket", priceCents: 4500 }] },
    ],
  };
}
let series: ReturnType<typeof fixture> | null;
beforeEach(() => {
  vi.clearAllMocks();
  series = fixture();
  mocks.fetch.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => url.includes("/availability") ? {} : { series: series ? [series] : [] },
  }));
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

async function renderSession(
  locale = "en",
  query: Record<string, string | string[] | undefined> = {},
  pathId = sessionId,
) {
  return renderToStaticMarkup(await sessionPage({
    params: Promise.resolve({ locale, slug, sessionId: pathId }),
    searchParams: Promise.resolve(query),
  }));
}
function ticketLinks(markup: string) {
  return [...markup.matchAll(/href="([^"]*\/checkout\/[^"]*)"/g)]
    .map(match => new URL(match[1].replaceAll("&amp;", "&"), "https://example.test"));
}

describe("public standalone session rendering (isolated data, no database)", () => {
  it("renders the exact nested session directly, not a redirect or the series list", async () => {
    const markup = await renderSession();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(markup).toContain("<h1");
    expect(markup).toContain("en requested Wine Down");
    expect(markup).toContain("en requested event details");
    expect(markup).toContain("en event subtitle");
    expect(markup).toContain("Wednesday, January 13, 2027");
    expect(markup).toContain("7:00 PM");
    expect(markup).toContain("10:00 PM");
    expect(markup).toContain("(Panama)");
    expect(markup).toContain('src="/session-en.jpg"');
    expect(markup).toContain("$45");
    expect(markup).toContain(`id="session-${sessionId}"`);
    expect(markup).not.toContain("Another Wednesday");
    expect(markup).not.toContain('role="group"');
    expect(ticketLinks(markup).length).toBe(3); // Hero, session card and booking sidebar.
    for (const link of ticketLinks(markup)) {
      expect(link.pathname + link.search).toBe(`/en/checkout/${slug}?sessionId=${sessionId}`);
    }
  });

  it.each(["en", "es", "pt"])("preserves %s query context with the path ID authoritative in every CTA", async locale => {
    series = fixture(locale);
    const markup = await renderSession(locale, {
      sessionId: ["other-session", "wrong"], ref: "a & b", utm_source: "newsletter",
      tag: ["one", "two"], empty: "", absent: undefined,
    });
    expect(markup).toContain(`${locale} requested Wine Down`);
    expect(mocks.fetch.mock.calls[0][0]).toContain(`locale=${locale}`);
    for (const link of ticketLinks(markup)) {
      expect(link.pathname).toBe(`/${locale}/checkout/${slug}`);
      expect(link.searchParams.getAll("sessionId")).toEqual([sessionId]);
      expect(link.searchParams.get("ref")).toBe("a & b");
      expect(link.searchParams.get("utm_source")).toBe("newsletter");
      expect(link.searchParams.getAll("tag")).toEqual(["one", "two"]);
      expect(link.searchParams.get("empty")).toBe("");
      expect(link.searchParams.has("absent")).toBe(false);
    }
  });

  it("uses existing series artwork and content fallbacks when session values are absent", async () => {
    Object.assign(series!.sessions[1], { title: null, description: null, flyerImageUrlEn: null, flyerImageUrlEs: null });
    const markup = await renderSession("es");
    expect(markup).toContain('src="/series-es.jpg"');
    expect(markup).toContain("Wine Down");
    expect(markup).not.toContain("en requested event details");
  });

  it.each(["missing-session", "session-from-another-series"])("returns not-found for %s even with a valid query ID", async id => {
    await expect(renderSession("en", { sessionId }, id)).rejects.toThrow("NOT_FOUND");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns not-found for a missing series", async () => {
    series = null;
    await expect(renderSession()).rejects.toThrow("NOT_FOUND");
  });

  it("keeps the original series route's entire list, controls and ticket links", async () => {
    const markup = renderToStaticMarkup(await seriesPage({ params: Promise.resolve({ locale: "en", slug }) }));
    expect(markup).toContain("Another Wednesday");
    expect(markup).toContain("en requested Wine Down");
    expect(markup).toContain('role="group"');
    expect(markup).toContain('href="#sessions"');
    expect(ticketLinks(markup).map(link => link.searchParams.get("sessionId"))).toEqual(["other-session", sessionId]);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps existing query-focused series behavior without removing its list", async () => {
    const markup = renderToStaticMarkup(await seriesPage({
      params: Promise.resolve({ locale: "en", slug }), searchParams: Promise.resolve({ sessionId }),
    }));
    expect(markup).toContain("Another Wednesday");
    expect(markup).toContain(`id="session-${sessionId}"`);
    expect(ticketLinks(markup).at(-1)?.searchParams.get("sessionId")).toBe(sessionId);
  });

  it("uses the session title, artwork and retained nested URL for metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en", slug, sessionId }) });
    expect(metadata.title).toBe("en requested Wine Down");
    expect(metadata.description).toBe("en requested event details");
    expect(metadata.openGraph).toMatchObject({
      url: expect.stringContaining(`/en/experiences/${slug}/sessions/${sessionId}`),
      images: [expect.objectContaining({ url: "/session-en.jpg" })],
    });
  });
});
