import Link from "next/link";
import { getTranslations } from "@/i18n/getTranslations";
import { isValidLocale } from "@/i18n/config";
import { localePath } from "@/i18n/utils";
import { getSeriesContent } from "@/data/seriesTranslations";
import type { Locale } from "@/types/i18n";
import { seriesLocationLabel } from "@/lib/locations";

const BASE = process.env.APP_BASE_URL || "http://localhost:5000";

async function getSeries() {
  const res = await fetch(`${BASE}/api/v1/series`, { cache: "no-store" });
  return res.json();
}

function getPriceRange(ticketTypes: any[]) {
  if (!ticketTypes?.length) return null;
  const prices = ticketTypes.map((t: any) => t.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const fmt = (c: number) => `$${(c / 100).toFixed(0)}`;
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
}

const venueGradients: Record<string, string> = {
  OKU: "linear-gradient(135deg, #2d1f1b 0%, #1a1614 100%)",
  CATCH: "linear-gradient(135deg, #0f1f2d 0%, #0a1520 100%)",
};

interface Props { params: Promise<{ locale: string }> }

export default async function SeriesPage({ params }: Props) {
  const { locale } = await params;
  const safeLocale = isValidLocale(locale) ? (locale as Locale) : "en";
  const [{ data }, translations] = await Promise.all([
    getSeries(),
    getTranslations(safeLocale, ["common"]),
  ]);

  const c = translations.common as Record<string, string>;
  const okuSeries  = (data || []).filter((s: any) => s.venue !== "CATCH");
  const catchSeries = (data || []).filter((s: any) => s.venue === "CATCH");

  return (
    <div>
      <div style={{ background: "#f8f5f3", borderBottom: "1px solid var(--color-border)", padding: "40px 24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 }}>
            OKÜ Hospitality Group
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--color-text)", marginBottom: 12, lineHeight: 1.1 }}>
            {c.upcomingSeries}
          </h1>
          <p style={{ fontSize: 16, color: "var(--color-text-secondary)", maxWidth: 520, lineHeight: 1.7 }}>
            {c.upcomingSeriesSubtitle}
          </p>
        </div>
      </div>

      <div className="page-container" style={{ paddingTop: 40 }}>
        {(!data || data.length === 0) ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-title">{c.noSeriesAvailable}</div>
            <p className="text-secondary">{c.checkBackSoon}</p>
          </div>
        ) : (
          <>
            {okuSeries.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                  <h2 className="section-title" style={{ margin: 0 }}>{c.okuVenue}</h2>
                  <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                </div>
                <div className="card-grid">
                  {okuSeries.map((s: any) => (
                    <SeriesCard key={s.id} series={s} locale={safeLocale} c={c} />
                  ))}
                </div>
              </section>
            )}
            {catchSeries.length > 0 && (
              <section>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                  <h2 className="section-title" style={{ margin: 0 }}>{c.catchVenue}</h2>
                  <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                </div>
                <div className="card-grid">
                  {catchSeries.map((s: any) => (
                    <SeriesCard key={s.id} series={s} locale={safeLocale} c={c} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SeriesCard({ series, locale, c }: { series: any; locale: Locale; c: Record<string, string> }) {
  const priceRange = getPriceRange(series.ticketTypes);
  const sessionCount = series.sessions?.length ?? 0;
  const content = getSeriesContent(series.slug, locale);
  const title = content?.title ?? series.title;
  const description = content?.description ?? series.description;
  const locationLabel = seriesLocationLabel(series);

  return (
    <Link href={localePath(locale, `/series/${series.slug}`)} className="series-card" style={{ textDecoration: "none" }}>
      <div className="series-card-image" style={{ background: venueGradients[series.venue] ?? venueGradients.OKU, position: "relative" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 52, color: "rgba(255,255,255,0.07)", fontWeight: 400, letterSpacing: "-0.02em", userSelect: "none" }}>
          {locationLabel ?? "OKÜ"}
        </span>
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          {locationLabel && (
            <span className={`badge ${series.venue === "CATCH" ? "venue-badge-catch" : "venue-badge-oku"}`}>{locationLabel}</span>
          )}
        </div>
      </div>
      <div className="series-card-content">
        <div className="series-card-title">{title}</div>
        {description && (
          <div className="series-card-desc">{description.slice(0, 120)}{description.length > 120 ? "…" : ""}</div>
        )}
        <div className="series-card-meta">
          <span>{sessionCount} {sessionCount === 1 ? c.session : c.sessions}</span>
          {priceRange && <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>{priceRange}</span>}
        </div>
      </div>
    </Link>
  );
}
