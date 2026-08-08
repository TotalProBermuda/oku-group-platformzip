import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/types/i18n";

const TRANSLATABLE_SERIES_FIELDS = ["title", "subtitle", "description"] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const venue = url.searchParams.get("venue") as any;
  const q = url.searchParams.get("q") || undefined;
  const locale = (url.searchParams.get("locale") || "en") as Locale;

  const series = await prisma.series.findMany({
    where: {
      status: "PUBLISHED",
      seriesVisibilityMode: { not: "PRIVATE_HIDDEN" },
      ...(venue ? { venue } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    },
    include: {
      sessions: true,
      ticketTypes: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (locale === "en" || !series.length) {
    return NextResponse.json({ ok: true, data: series });
  }

  const seriesIds = series.map((s) => s.id);

  const translations = await prisma.contentTranslation.findMany({
    where: {
      entityType: "Series",
      entityId: { in: seriesIds },
      fieldName: { in: [...TRANSLATABLE_SERIES_FIELDS] },
      targetLocale: locale,
      status: "COMPLETED",
    },
    select: { entityId: true, fieldName: true, translatedText: true },
  });

  const translationMap = new Map<string, string>();
  for (const t of translations) {
    translationMap.set(`${t.entityId}:${t.fieldName}`, t.translatedText);
  }

  const translated = series.map((s) => {
    const overrides: Record<string, string | null> = {};
    for (const field of TRANSLATABLE_SERIES_FIELDS) {
      const key = `${s.id}:${field}`;
      if (translationMap.has(key)) {
        overrides[field] = translationMap.get(key)!;
      }
    }
    return { ...s, ...overrides };
  });

  return NextResponse.json({ ok: true, data: translated });
}
