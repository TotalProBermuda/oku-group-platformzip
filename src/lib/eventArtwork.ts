/** Reusable across every series/host type. Legacy fields remain the final fallback. */
export type SeriesArtwork = {
  heroImageUrl?: string | null;
  heroImageUrlEn?: string | null;
  heroImageUrlEs?: string | null;
  heroImageUrlPt?: string | null;
};
export type SessionArtwork = {
  flyerImageUrl?: string | null;
  flyerImageUrlEn?: string | null;
  flyerImageUrlEs?: string | null;
  flyerImageUrlPt?: string | null;
};
export const seriesArtworkFields = ["heroImageUrlEn", "heroImageUrlEs", "heroImageUrlPt"] as const;
export const sessionArtworkFields = ["flyerImageUrlEn", "flyerImageUrlEs", "flyerImageUrlPt"] as const;

/** No script/data URLs, protocol-relative URLs, credentials or transient presigns.
 * Same-origin media/assets are allowed; this only renders images, never fetches URLs server-side.
 */
export function isSafeArtworkUrl(value: string): boolean {
  if (!value || value.length > 2048 || /[\\\u0000-\u0020]/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//") && !value.startsWith("/?");
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !Array.from(url.searchParams.keys()).some(key => /^(x-amz-|x-goog-|signature$|expires$)/i.test(key));
  } catch { return false; }
}

function uniqueSafe(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((url): url is string => typeof url === "string" && isSafeArtworkUrl(url)))];
}

export function seriesArtworkCandidates(series: SeriesArtwork, locale: string): string[] {
  const selected = locale === "es" ? series.heroImageUrlEs : locale === "pt" ? series.heroImageUrlPt : series.heroImageUrlEn;
  return uniqueSafe([selected, series.heroImageUrlEn, series.heroImageUrl]);
}

export function sessionArtworkCandidates(session: SessionArtwork, locale: string, series?: SeriesArtwork): string[] {
  const selected = locale === "es" ? session.flyerImageUrlEs : locale === "pt" ? session.flyerImageUrlPt : session.flyerImageUrlEn;
  return uniqueSafe([selected, session.flyerImageUrlEn, session.flyerImageUrl, ...(series ? seriesArtworkCandidates(series, locale) : [])]);
}
