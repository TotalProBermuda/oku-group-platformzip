import Link from "next/link";
import { getTranslations } from "@/i18n/getTranslations";
import { isValidLocale } from "@/i18n/config";
import { localePath } from "@/i18n/utils";
import { getSeriesContent, getSessionTitle, getTicketTypeName } from "@/data/seriesTranslations";
import type { Locale } from "@/types/i18n";
import { seriesLocationLabel } from "@/lib/locations";

const BASE = process.env.APP_BASE_URL || "http://localhost:5000";

interface PublicSeries {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  heroImageUrl?: string | null;
  heroImageUrlEn?: string | null;
  heroImageUrlEs?: string | null;
  heroImageUrlPt?: string | null;
  venue: string | null;
  hostType: string | null;
  ticketTypes: Array<{ id: string; name: string; description: string | null; priceCents: number; maxPerOrder: number }>;
  sessions: Array<{ id: string; title: string | null; startsAt: string; endsAt: string; capacity: number; soldCount: number; flyerImageUrl?: string | null; flyerImageUrlEn?: string | null; flyerImageUrlEs?: string | null; flyerImageUrlPt?: string | null; flyerImageUrlMobileEn?: string | null; flyerImageUrlMobileEs?: string | null; flyerImageUrlMobilePt?: string | null }>;
  operationalVenue?: { name: string; slug: string } | null;
  eventSpace?: { name: string; conceptKey: string | null } | null;
}

async function getSeries(slug: string) {
  const res = await fetch(`${BASE}/api/v1/series`, { cache: "no-store" });
  const json: { data?: PublicSeries[] } = await res.json();
  return (json.data ?? []).find((series) => series.slug === slug);
}

const venueGradients: Record<string, string> = {
  OKU: "linear-gradient(160deg, #2d1f1b 0%, #1a1614 100%)",
  CATCH: "linear-gradient(160deg, #0f1f2d 0%, #0a1520 100%)",
};

interface Props { params: Promise<{ locale: string; slug: string }> }

export default async function SeriesDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  const safeLocale = isValidLocale(locale) ? (locale as Locale) : "en";
  const [series, translations] = await Promise.all([
    getSeries(slug),
    getTranslations(safeLocale, ["common"]),
  ]);

  const c = translations.common as Record<string, string>;

  const dateFmt = new Intl.DateTimeFormat(
    safeLocale === "es" ? "es-PA" : safeLocale === "pt" ? "pt-BR" : "en-US",
    { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" }
  );

  if (!series) {
    return (
      <div className="page-container" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 12 }}>{c.seriesNotFound}</div>
        <Link href={localePath(safeLocale, "/series")} className="btn btn-primary">{c.browseAllSeries}</Link>
      </div>
    );
  }

  const content = getSeriesContent(series.slug, safeLocale);
  const title = content?.title ?? series.title;
  const description = content?.description ?? series.description;
  const heroImage = safeLocale === "es"
    ? series.heroImageUrlEs || series.heroImageUrlEn || series.heroImageUrl
    : safeLocale === "pt"
      ? series.heroImageUrlPt || series.heroImageUrlEn || series.heroImageUrl
      : series.heroImageUrlEn || series.heroImageUrl;

  const minPrice = series.ticketTypes?.length
    ? Math.min(...series.ticketTypes.map((ticketType) => ticketType.priceCents))
    : null;
  const locationLabel = seriesLocationLabel(series);

  return (
    <div>
      {/* ── HERO ── */}
      <div style={{
        background: heroImage
          ? `linear-gradient(90deg, rgba(26,22,20,.88), rgba(26,22,20,.38)), url("${heroImage}") center/cover`
          : venueGradients[series.venue || "OKU"],
        minHeight: 360,
        padding: "72px 24px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 50%, rgba(196,30,58,0.12) 0%, transparent 60%)" }} />
        <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            {locationLabel && (
              <span className={`badge ${series.venue === "CATCH" ? "venue-badge-catch" : "venue-badge-oku"}`}>
                {locationLabel}
              </span>
            )}
            {series.hostType === "INFLUENCER" && (
              <span className="badge" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)" }}>
                {c.creatorSeries}
              </span>
            )}
            {series.hostType === "PARTNER" && (
              <span className="badge" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)" }}>
                {c.partnerSeries}
              </span>
            )}
          </div>
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 600,
            color: "white",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            marginBottom: 16,
          }}>
            {title}
          </h1>
          {description && (
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.65)", maxWidth: 600, lineHeight: 1.7, marginBottom: 28 }}>
              {description}
            </p>
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <Link
              href={localePath(safeLocale, `/series/${series.slug}/checkout`)}
              className="btn btn-primary btn-lg"
              style={{ background: "var(--color-primary)", border: "none" }}
            >
              {minPrice
                ? `${c.buyTicketsFrom} $${(minPrice / 100).toFixed(0)}`
                : c.buyTickets}
            </Link>
            <Link
              href={localePath(safeLocale, "/series")}
              className="btn btn-lg"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              {c.allSeries}
            </Link>
          </div>
        </div>
      </div>

      {/* ── SESSIONS + TICKET TYPES ── */}
      <div className="page-container">
        <div style={{ display: "grid", gap: 48 }}>
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <h2 className="section-title" style={{ margin: 0 }}>{c.sessionsHeading}</h2>
              {series.sessions?.length > 0 && (
                <span className="badge badge-neutral">{series.sessions.length} {c.scheduled}</span>
              )}
            </div>
            {(!series.sessions || series.sessions.length === 0) ? (
              <div className="empty-state">
                <div className="empty-state-icon">📅</div>
                <div className="empty-state-title">{c.noSessionsYet}</div>
              </div>
            ) : (
              <div className="card-grid">
                {series.sessions.map((sess, idx) => {
                  const remaining = sess.capacity - sess.soldCount;
                  const pctFull = Math.round((sess.soldCount / sess.capacity) * 100);
                  const sessionTitle = getSessionTitle(sess.title || `${c.sessionLabel} ${idx + 1}`, safeLocale);
                  const sessionArtwork = safeLocale === "es"
                    ? sess.flyerImageUrlEs || sess.flyerImageUrl
                    : safeLocale === "pt"
                      ? sess.flyerImageUrlPt || sess.flyerImageUrl
                      : sess.flyerImageUrlEn || sess.flyerImageUrl;
                  const sessionPageUrl = localePath(safeLocale, `/experiences/${series.slug}/sessions/${sess.id}`);
                  const sessionCheckoutUrl = localePath(safeLocale, `/checkout/${series.slug}?sessionId=${encodeURIComponent(sess.id)}`);
                  return (
                    <article key={sess.id} className="card" style={{ position: "relative", overflow: "hidden" }}>
                      <div style={{
                        position: "absolute", top: 0, left: 0, right: 0, height: 3,
                        background: "var(--color-border)", borderRadius: "var(--radius-lg) var(--radius-lg) 0 0", overflow: "hidden",
                      }}>
                        <div style={{ height: "100%", width: `${pctFull}%`, background: remaining === 0 ? "var(--color-danger)" : "var(--color-success)", transition: "width 0.3s" }} />
                      </div>
                      <Link href={sessionPageUrl} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
                        {sessionArtwork && (
                          <div role="img" aria-label={sessionTitle} style={{ width: "100%", aspectRatio: "16 / 9", marginBottom: 16, borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-secondary)", backgroundImage: `url("${sessionArtwork}")`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />
                        )}
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, marginBottom: 12, paddingTop: 4 }}>
                        {sessionTitle}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                        <div className="text-sm text-secondary">🗓 {dateFmt.format(new Date(sess.startsAt))}</div>
                        <div className="text-sm text-muted">{c.until} {dateFmt.format(new Date(sess.endsAt))}</div>
                      </div>
                      <div style={{ display: "flex", gap: 16, paddingTop: 12, borderTop: "1px solid var(--color-border-light)" }}>
                        <div>
                          <div className="text-xs text-muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{c.capacity}</div>
                          <div style={{ fontWeight: 600 }}>{sess.capacity}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{c.sold}</div>
                          <div style={{ fontWeight: 600 }}>{sess.soldCount}</div>
                        </div>
                        <div style={{ marginLeft: "auto" }}>
                          {remaining > 0 ? (
                            <span className="badge badge-success">{remaining} {c.left}</span>
                          ) : (
                            <span className="badge badge-danger">{c.soldOut}</span>
                          )}
                        </div>
                      </div>
                      </Link>
                      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                        <Link href={sessionPageUrl} className="btn btn-secondary" style={{ flex: 1, textAlign: "center" }}>{c.viewEventLink}</Link>
                        <Link href={sessionCheckoutUrl} className="btn btn-primary" style={{ flex: 1, textAlign: "center" }}>{c.buyTickets}</Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {series.ticketTypes?.length > 0 && (
            <section>
              <h2 className="section-title">{c.ticketTypes}</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{c.ticketName}</th>
                      <th>{c.ticketDescription}</th>
                      <th>{c.ticketPrice}</th>
                      <th>{c.maxPerOrder}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.ticketTypes.map((tt) => (
                      <tr key={tt.id}>
                        <td><span style={{ fontWeight: 600, fontFamily: "var(--font-heading)", fontSize: 16 }}>{getTicketTypeName(tt.name, safeLocale)}</span></td>
                        <td className="text-secondary text-sm">{tt.description || "—"}</td>
                        <td>
                          <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, color: "var(--color-primary)" }}>
                            ${(tt.priceCents / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="text-secondary">{tt.maxPerOrder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 24 }}>
                <Link href={localePath(safeLocale, `/series/${series.slug}/checkout`)} className="btn btn-primary btn-lg">
                  {c.purchaseTickets}
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
