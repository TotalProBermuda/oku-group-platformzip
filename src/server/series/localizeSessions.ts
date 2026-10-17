import { prisma } from "@/lib/prisma";
import { resolveField } from "./sessionFields";
import { sessionTranslation } from "@/server/i18n/sessionTranslation";

type Content = { id: string; title?: string | null; subtitle?: string | null; description?: string | null; fieldModes?: unknown };
type SeriesContent = Content & { sessionDefaults?: unknown };

/** Resolve English inheritance first; never use a different or stale source. */
export async function localizeSessions<T extends Content>(series: SeriesContent, sessions: T[], requestedLocale: string): Promise<T[]> {
  const locale = requestedLocale === "es" || requestedLocale === "pt" ? requestedLocale : "en";
  const rows = locale === "en" ? [] : await prisma.contentTranslation.findMany({
    where: { OR: [{ entityType: "Series", entityId: series.id }, { entityType: "SeriesSessionDefaults", entityId: series.id },
      { entityType: "EventSession", entityId: { in: sessions.map(s => s.id) } }], targetLocale: locale, status: "COMPLETED" },
  });
  return sessions.map(session => {
    const result = { ...session };
    for (const field of ["title", "subtitle", "description"] as const) {
      const key = `content.${field}.en`;
      const english = resolveField(key, session.fieldModes, series.sessionDefaults, session[field], session[field] == null, series[field] ?? null);
      const source = String(english.value ?? "");
      result[field] = locale === "en" ? source : sessionTranslation(rows, series, session, english, field, locale) ?? source;
    }
    return result;
  });
}
