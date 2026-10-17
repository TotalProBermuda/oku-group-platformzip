/** Reusable across every series/host type. Legacy fields remain the final fallback. */
export type SeriesArtwork = {
  sessionDefaults?: unknown;
  heroImageUrl?: string | null;
  heroImageUrlEn?: string | null;
  heroImageUrlEs?: string | null;
  heroImageUrlPt?: string | null;
};
export type SessionArtwork = {
  fieldModes?: unknown;
  flyerImageUrl?: string | null;
  flyerImageUrlEn?: string | null;
  flyerImageUrlEs?: string | null;
  flyerImageUrlPt?: string | null;
  flyerImageUrlMobileEn?: string | null;
  flyerImageUrlMobileEs?: string | null;
  flyerImageUrlMobilePt?: string | null;
};
export const seriesArtworkFields = ["heroImageUrlEn", "heroImageUrlEs", "heroImageUrlPt"] as const;
export const sessionArtworkFields = ["flyerImageUrlEn", "flyerImageUrlEs", "flyerImageUrlPt"] as const;
export const sessionMobileArtworkFields = ["flyerImageUrlMobileEn", "flyerImageUrlMobileEs", "flyerImageUrlMobilePt"] as const;

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
  const key = `artwork.${locale === "es" || locale === "pt" ? locale : "en"}`;
  const fields = session.fieldModes as Record<string, { mode?: string; value?: unknown }> | undefined;
  const defaults = series?.sessionDefaults as Record<string, { mode?: string; value?: unknown }> | undefined;
  const mode = fields?.[key];
  if (mode?.mode === "clear" || ((!mode || mode.mode === "inherit") && defaults?.[key]?.mode === "clear")) return [];
  if (mode?.mode === "override" && typeof mode.value === "string") return uniqueSafe([mode.value]);
  if (mode?.mode === "inherit" && defaults?.[key]?.mode === "override" && typeof defaults[key].value === "string") return uniqueSafe([defaults[key].value as string]);
  const selected = locale === "es" ? session.flyerImageUrlEs : locale === "pt" ? session.flyerImageUrlPt : session.flyerImageUrlEn;
  return uniqueSafe([selected, session.flyerImageUrlEn, session.flyerImageUrl, ...(series ? seriesArtworkCandidates(series, locale) : [])]);
}



/** Checkout must retain series branding even when this session has no localized flyer. */
export function checkoutArtworkCandidates(session: SessionArtwork | null | undefined, locale: string, series: SeriesArtwork): string[] {
  const sessionCandidates = session ? sessionArtworkCandidates(session, locale, series) : [];
  return sessionCandidates.length > 0 ? sessionCandidates : seriesArtworkCandidates(series, locale);
}

/** Mobile override first, then the same locale's standard flyer, then English fallbacks.
 * A translated standard flyer always wins over a different language's mobile override.
 */
export function sessionMobileArtworkCandidates(session: SessionArtwork, locale: string, series?: SeriesArtwork): string[] {
  const normalizedLocale = locale === "es" || locale === "pt" ? locale : "en";
  const mobileKey = `artworkMobile.${normalizedLocale}`;
  const fields = session.fieldModes as Record<string, { mode?: string; value?: unknown }> | undefined;
  const mobileMode = fields?.[mobileKey];
  const legacyMobile = normalizedLocale === "es" ? session.flyerImageUrlMobileEs : normalizedLocale === "pt" ? session.flyerImageUrlMobilePt : session.flyerImageUrlMobileEn;
  const selectedMobile = mobileMode?.mode === "clear"
    ? null
    : mobileMode?.mode === "inherit"
      ? null
    : mobileMode?.mode === "override" && typeof mobileMode.value === "string"
      ? mobileMode.value
      : legacyMobile;
  const selected = locale === "es" ? session.flyerImageUrlEs : locale === "pt" ? session.flyerImageUrlPt : session.flyerImageUrlEn;
  return uniqueSafe([
    selectedMobile, selected, session.flyerImageUrlMobileEn, session.flyerImageUrlEn,
    session.flyerImageUrl, ...(series ? seriesArtworkCandidates(series, locale) : []),
  ]);
}
