import { modes, type EffectiveField } from "@/server/series/sessionFields";
import { matchesSource } from "./sourceHash";

type Row = { entityType: string; entityId: string; fieldName: string; targetLocale: string; sourceTextHash: string; status: string; translatedText: string; provider?: string | null };
/** Old reviewed locale overrides remain valid only against today's English source. */
export function sessionTranslation(rows: Row[], series: { id: string; sessionDefaults?: unknown }, session: { id: string; fieldModes?: unknown },
  english: EffectiveField, field: string, locale: string): string | undefined {
  if (english.mode === "clear") return "";
  const source = String(english.value ?? "");
  const enKey = `content.${field}.en`, key = `content.${field}.${locale}`;
  const defaults = modes(series.sessionDefaults)[enKey];
  const owner = english.source === "series" ? (defaults?.mode === "override" || defaults?.mode === "clear" ? "SeriesSessionDefaults" : "Series") : "EventSession";
  const current = rows.filter(row => row.fieldName === field && row.targetLocale === locale && row.status === "COMPLETED" && matchesSource(row.sourceTextHash, source));
  for (const [entityType, entityId, mode] of [
    ["EventSession", session.id, modes(session.fieldModes)[key]?.mode],
    ...(english.source === "series" ? [["SeriesSessionDefaults", series.id, modes(series.sessionDefaults)[key]?.mode]] : []),
  ]) {
    if (mode !== "override" && mode !== "clear") continue;
    const reviewed = current.find(row => row.entityType === entityType && row.entityId === entityId && row.provider === "manual-session-management");
    if (reviewed && (reviewed.translatedText.trim() || mode === "clear")) return reviewed.translatedText;
  }
  return current.find(row => row.entityType === owner && row.entityId === (owner === "EventSession" ? session.id : series.id) &&
    (!source.trim() || row.translatedText.trim()))?.translatedText;
}
