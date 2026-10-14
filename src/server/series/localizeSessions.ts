import { prisma } from "@/lib/prisma";
import { modes, resolveField } from "./sessionFields";
import { textHash } from "./sessionState";

type Content = { id: string; title?: string | null; subtitle?: string | null; description?: string | null; fieldModes?: unknown };
type SeriesContent = Content & { sessionDefaults?: unknown };
/** Shared public/session localization. Stale machine translations are never served.
 * Empty strings encode intentional clear to legacy clients that use ?? fallbacks. */
export async function localizeSessions<T extends Content>(series: SeriesContent, sessions: T[], requestedLocale: string): Promise<T[]> {
  const locale = requestedLocale === "es" || requestedLocale === "pt" ? requestedLocale : "en";
  const rows = locale === "en" ? [] : await prisma.contentTranslation.findMany({
    where: { OR: [{ entityType: "Series", entityId: series.id }, { entityType: "EventSession", entityId: { in: sessions.map(s => s.id) } }], targetLocale: locale, status: "COMPLETED" },
  });
  const translated = (entityType: string, item: Content, field: "title" | "subtitle" | "description") => {
    const source = item[field] ?? "";
    return rows.find(r => r.entityType === entityType && r.entityId === item.id && r.fieldName === field && r.sourceTextHash === textHash(source))?.translatedText;
  };
  return sessions.map(session => {
    const result = { ...session };
    for (const field of ["title", "subtitle", "description"] as const) {
      const key = `content.${field}.${locale}`;
      const legacy = locale === "en" ? session[field] : translated("EventSession", session, field);
      const seriesLegacy = (locale === "en" ? series[field] : translated("Series", series, field)) ?? series[field] ?? null;
      const resolved = resolveField(key, session.fieldModes, series.sessionDefaults, legacy, legacy == null, seriesLegacy);
      result[field] = resolved.mode === "clear" ? "" : typeof resolved.value === "string" ? resolved.value : null;
      // Materialized inherited English values are not interpreted as independent overrides.
      if (modes(session.fieldModes)[key]?.mode === "inherit") result[field] = resolved.value == null ? "" : String(resolved.value);
    }
    return result;
  });
}
