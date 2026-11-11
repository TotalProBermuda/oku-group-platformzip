import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCommerceSettings } from "@/server/commerce/commerceSettings";
import { getWebsiteContent, operatingHoursRows } from "@/server/content/websiteContent";

/** Public, PII-free snapshot of currently published events and venue facts. */
export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const requestedLocale = new URL(req.url).searchParams.get("locale");
    const locale = requestedLocale === "es" || requestedLocale === "pt" ? requestedLocale : "en";
    const [sessions, venues, settings, websiteContent] = await Promise.all([
      prisma.session.findMany({
        where: { status: "SCHEDULED", startsAt: { gte: now }, series: { status: "PUBLISHED" } },
        orderBy: { startsAt: "asc" }, take: 12,
        select: { id: true, title: true, startsAt: true, series: { select: { slug: true, title: true, operationalVenue: { select: { name: true } } } } },
      }),
      prisma.venue.findMany({ select: { name: true, addressLine: true, city: true, country: true, description: true }, orderBy: { name: "asc" } }),
      getCommerceSettings(),
      getWebsiteContent(),
    ]);
    const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    return NextResponse.json({ ok: true, data: {
      events: sessions.map((session) => ({
        title: session.title || session.series.title, startsAt: session.startsAt.toISOString(),
        venue: session.series.operationalVenue?.name || "OKÜ Hospitality Group",
        url: `/en/experiences/${encodeURIComponent(session.series.slug)}/sessions/${encodeURIComponent(session.id)}`,
      })),
      venues: venues.map((venue) => ({ name: venue.name, address: [venue.addressLine, venue.city, venue.country].filter(Boolean).join(", "), description: venue.description })),
      reservationServiceWindow: { start: toClock(settings.reservationServiceStartMinutes), end: toClock(settings.reservationServiceEndMinutes), timezone: settings.timezone },
      // Booking hours are not equivalent to venue opening hours.
      openingHours: operatingHoursRows(websiteContent, locale).map((row) => `${row.days}: ${row.time}`).join("; "),
      updatedAt: now.toISOString(),
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[public-chat-knowledge] failed to load website facts", error);
    return NextResponse.json({ ok: false, error: "Current website information is temporarily unavailable." }, { status: 503 });
  }
}
