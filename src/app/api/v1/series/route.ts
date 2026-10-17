import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/types/i18n";
import { localizeSessions } from "@/server/series/localizeSessions";
import { localizeEventCatalog } from "@/server/i18n/eventTranslations";

const TRANSLATABLE_SERIES_FIELDS = ["title", "subtitle", "description"] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const venue = url.searchParams.get("venue") as any;
  const q = url.searchParams.get("q") || undefined;
  const locale = (url.searchParams.get("locale") || "en") as Locale;

  const rawSeries = await prisma.series.findMany({
    where: {
      status: "PUBLISHED",
      seriesVisibilityMode: { not: "PRIVATE_HIDDEN" },
      ...(venue ? { venue } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    },
    include: {
      sessions: true,
      ticketTypes: true,
      operationalVenue: { select: { id: true, name: true, slug: true } },
      eventSpace: { select: { id: true, name: true, conceptKey: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const series = await Promise.all(rawSeries.map(async s => ({ ...s, sessions: await localizeSessions(s, s.sessions ?? [], locale) })));
  return NextResponse.json({ ok: true, data: await localizeEventCatalog(series, locale) });
}
