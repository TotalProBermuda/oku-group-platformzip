import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  series: { findMany: vi.fn() },
  session: { findMany: vi.fn() },
  contentTranslation: { findMany: vi.fn(async () => []) },
}));
const navigation = vi.hoisted(() => ({
  notFound: vi.fn((): never => { throw new Error("NOT_FOUND"); }),
  redirect: vi.fn((): never => { throw new Error("REDIRECT"); }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/navigation", () => navigation);
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/components/sponsors/EventPageSponsorBlock", () => ({ default: () => null }));
vi.mock("@/components/experiences/EventMenusSection", () => ({ default: () => null }));
vi.mock("@/components/ui/ShareButtons", () => ({ default: () => null }));

import { GET as calendarGET } from "@/app/api/v1/sessions/route";
import { GET as experiencesGET } from "@/app/api/v1/experiences/route";
import sessionPage, { generateMetadata } from "@/app/[locale]/experiences/[slug]/sessions/[sessionId]/page";
import seriesPage from "@/app/[locale]/experiences/[slug]/page";

const slug = "wine-down-wednesday";
const ongoingId = "cmv1ohwb40006w3f2woikjbnk";
const records = [
  { id: ongoingId, title: "Ongoing Wednesday", startsAt: "2027-01-14T00:00:00Z", endsAt: "2027-01-14T03:00:00Z" },
  { id: "past-session", title: "December Wednesday", startsAt: "2026-12-17T00:00:00Z", endsAt: "2026-12-17T03:00:00Z" },
  { id: "future-sibling", title: "Next Wednesday", startsAt: "2027-01-21T00:00:00Z", endsAt: "2027-01-21T03:00:00Z" },
  { id: "cancelled-session", title: "Cancelled Wednesday", startsAt: "2027-01-21T00:00:00Z", endsAt: "2027-01-21T03:00:00Z" },
].map(record => ({
  ...record, description: `${record.title} details`, capacity: 20, soldCount: 0,
  status: record.id === "cancelled-session" ? "CANCELLED" : "SCHEDULED", allowLateSales: false,
}));
let seriesStatus: string;
const series = () => ({
  id: "series-1", slug, status: seriesStatus, title: "Wine Down Wednesday", description: "Series details",
  venue: "OKU", ticketTypes: [{ id: "ticket", ticketStatus: "ACTIVE", name: "General Admission", priceCents: 3500 }],
});

type SessionFilter = {
  id?: string; status: string;
  startsAt?: { gte?: Date; lte?: Date };
  endsAt?: { gt: Date };
  OR?: Array<{ startsAt?: { gt: Date }; allowLateSales?: boolean }>;
};
function matches(record: typeof records[number], where: SessionFilter) {
  return record.status === where.status && (!where.id || record.id === where.id)
    && (!where.startsAt?.gte || new Date(record.startsAt) >= where.startsAt.gte)
    && (!where.startsAt?.lte || new Date(record.startsAt) <= where.startsAt.lte)
    && (!where.endsAt || new Date(record.endsAt) > where.endsAt.gt)
    && (!where.OR || where.OR.some(option =>
      option.startsAt ? new Date(record.startsAt) > option.startsAt.gt : record.allowLateSales === option.allowLateSales));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-14T01:00:00Z"));
  seriesStatus = "PUBLISHED";
  // Evaluate the actual handlers' query predicates against in-memory records.
  // Expose reads only: any unexpected database write fails instead of touching data.
  db.series.findMany.mockImplementation(async ({ where, include }: {
    where: { slug?: string; status: { in: string[] } };
    include: { sessions: { where: SessionFilter; take?: number } };
  }) => {
    if (!where.status.in.includes(seriesStatus) || (where.slug && where.slug !== slug)) return [];
    let sessions = records.filter(record => matches(record, include.sessions.where));
    if (include.sessions.take) sessions = sessions.slice(0, include.sessions.take);
    return [{ ...series(), sessions }];
  });
  db.session.findMany.mockImplementation(async ({ where }: {
    where: SessionFilter & { series: { status: { in: string[] } } };
  }) => where.series.status.in.includes(seriesStatus)
    ? records.filter(record => matches(record, where)).map(record => ({ ...record, series: series() }))
    : []);
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/availability")) return Response.json({});
    if (url.pathname === "/api/v1/experiences") return experiencesGET(new NextRequest(url));
    throw new Error(`Unexpected fetch: ${url.pathname}`);
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function renderEvent(id: string, locale = "en", query = { sessionId: "future-sibling", ref: "calendar" }) {
  return renderToStaticMarkup(await sessionPage({
    params: Promise.resolve({ locale, slug, sessionId: id }), searchParams: Promise.resolve(query),
  }));
}

describe("calendar-to-detail read contract (actual API handlers, no database)", () => {
  it.each([
    [ongoingId, "2027-01", "2027-02", "Ongoing Wednesday"],
    ["past-session", "2026-12", "2027-01", "December Wednesday"],
  ])("renders calendar-visible %s even when its sales-time filter would exclude it", async (id, month, nextMonth, title) => {
    for (const locale of ["en", "es", "pt"]) {
      const calendarResponse = await calendarGET(new NextRequest(
        `https://example.test/api/v1/sessions?after=${month}-01T05:00:00Z&before=${nextMonth}-01T04:59:59Z&locale=${locale}`,
      ));
      expect((await calendarResponse.json()).sessions.map((record: { id: string }) => record.id)).toContain(id);
      const markup = await renderEvent(id, locale);
      expect(markup).toContain(title);
      expect(markup).toContain(`id="session-${id}"`);
      expect(markup).not.toContain('id="session-future-sibling"');
      expect(markup).toContain(`href="/${locale}/experiences/${slug}?sessionId=${id}#session-${id}"`);
      const checkoutLinks = [...markup.matchAll(/href="([^"]*\/checkout\/[^"]*)"/g)];
      expect(checkoutLinks).toHaveLength(0);
      expect(markup.match(/aria-disabled="true"/g)).toHaveLength(3); // Hero, session card, sticky sidebar.
      expect(db.series.findMany.mock.calls.at(-1)?.[0]).toMatchObject({
        where: { slug, status: { in: ["PUBLISHED", "SOLD_OUT"] } },
        include: { sessions: { where: { id, status: "SCHEDULED" } } },
      });
      const metadata = await generateMetadata({ params: Promise.resolve({ locale, slug, sessionId: id }) });
      expect(metadata.title).toBe(title);
      expect(metadata.openGraph).toMatchObject({ url: expect.stringContaining(`/${locale}/experiences/${slug}/sessions/${id}`) });
    }
    expect(navigation.redirect).not.toHaveBeenCalled();
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it("leaves the series list and temporal eligibility unchanged, even with a query session ID", async () => {
    const markup = renderToStaticMarkup(await seriesPage({
      params: Promise.resolve({ locale: "en", slug }),
      searchParams: Promise.resolve({ sessionId: ongoingId }),
    }));
    expect(markup).toContain('id="session-future-sibling"');
    expect(markup).not.toContain(`id="session-${ongoingId}"`);
    expect(markup).not.toContain('id="session-past-session"');
    expect(markup).toContain('href="#sessions"');
    expect(db.series.findMany.mock.calls.at(-1)?.[0].include.sessions.where).toEqual({
      status: "SCHEDULED", OR: [{ startsAt: { gt: new Date() } }, { allowLateSales: true }], endsAt: { gt: new Date() },
    });
  });

  it("requires a slug before enabling the specific-session lookup exception", async () => {
    const response = await experiencesGET(new NextRequest(`https://example.test/api/v1/experiences?sessionId=${ongoingId}`));
    expect((await response.json()).series[0].sessions.map((record: { id: string }) => record.id)).toEqual(["future-sibling"]);
    expect(db.series.findMany.mock.calls.at(-1)?.[0].include.sessions.take).toBe(3);
  });

  it.each(["DRAFT", "ARCHIVED"])("does not reveal sessions in a %s series", async status => {
    seriesStatus = status;
    await expect(renderEvent(ongoingId)).rejects.toThrow("NOT_FOUND");
  });

  it.each(["missing-session", "cancelled-session"])("does not reveal %s", async id => {
    await expect(renderEvent(id)).rejects.toThrow("NOT_FOUND");
  });

  it("cannot resolve a valid session through a different series slug", async () => {
    const response = await experiencesGET(new NextRequest(
      `https://example.test/api/v1/experiences?slug=another-series&sessionId=${ongoingId}`,
    ));
    expect((await response.json()).series).toEqual([]);
  });

  it("still renders sessions in a public sold-out series", async () => {
    seriesStatus = "SOLD_OUT";
    const markup = await renderEvent(ongoingId);
    expect(markup).toContain(`id="session-${ongoingId}"`);
    expect(markup).not.toContain("/checkout/");
  });
});
