/** Stable operational keys for physical spaces.  They are data, not UI labels. */
export function normalizeSpaceConceptKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

/** Prefer a named physical space, then its operational venue, then legacy data. */
export function seriesLocationLabel(series: {
  eventSpace?: { name?: string | null } | null;
  operationalVenue?: { name?: string | null } | null;
  venue?: string | null;
}): string | null {
  return series.eventSpace?.name ?? series.operationalVenue?.name ?? series.venue ?? null;
}
