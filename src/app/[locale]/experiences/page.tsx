import Link from "next/link";
import { getTranslations } from "@/i18n/getTranslations";
import { isValidLocale } from "@/i18n/config";
import { localePath } from "@/i18n/utils";
import { listPublicExperiences } from "@/server/experiences/publicSeries";
import type { Locale } from "@/types/i18n";

export const dynamic = "force-dynamic";

const venueGrad: Record<string, string> = {
  OKU:  "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)",
  CATCH:"linear-gradient(135deg, #0a1628 0%, #1a2d4a 100%)",
};

interface Props { params: Promise<{ locale: string }> }

export default async function ExperiencesPage({ params }: Props) {
  const { locale } = await params;
  const safeLocale = isValidLocale(locale) ? (locale as Locale) : "en";
  const [experiences, translations] = await Promise.all([
    listPublicExperiences(),
    getTranslations(safeLocale, ["common"]),
  ]);

  const c = translations.common as Record<string, string>;

  return (
    <div>
      <div style={{ background: "#f8f5f3", borderBottom: "1px solid var(--color-border)", padding: "40px 24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 }}>
            OKÜ Hospitality Group
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--color-text)", marginBottom: 12, lineHeight: 1.1 }}>
            {safeLocale === "es" ? "Experiencias" : safeLocale === "pt" ? "Experiências" : "Experiences"}
          </h1>
          <p style={{ fontSize: 16, color: "var(--color-text-secondary)", maxWidth: 520, lineHeight: 1.7, marginBottom: 20 }}>
            {c.upcomingSeriesSubtitle}
          </p>
          <Link href={localePath(safeLocale, "/calendar")} style={{ fontSize: 13, fontWeight: 500, color: "#c41e3a", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            📅 {c.calendarViewLink ?? "Calendar"}
          </Link>
        </div>
      </div>

      <div className="page-container" style={{ paddingTop: 40 }}>
        {experiences.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎪</div>
            <div className="empty-state-title">{c.noSeriesAvailable}</div>
            <p className="text-secondary">{c.checkBackSoon}</p>
          </div>
        ) : (
          <div className="card-grid">
            {experiences.map((s: any) => {
          const title = s.title;
          const description = s.description;
              const minPrice = s.ticketTypes?.length
                ? Math.min(...s.ticketTypes.map((t: any) => t.priceCents))
                : null;
              return (
                <Link key={s.id} href={localePath(safeLocale, `/experiences/${s.slug}`)} className="series-card" style={{ textDecoration: "none" }}>
                  <div className="series-card-image" style={{ background: venueGrad[s.venue] ?? venueGrad.OKU, position: "relative" }}>
                    <span style={{ fontFamily: "var(--font-heading)", fontSize: 52, color: "rgba(255,255,255,0.07)", fontWeight: 400, letterSpacing: "-0.02em", userSelect: "none" }}>
                      {s.venue === "CATCH" ? "CATCH" : "OKÜ"}
                    </span>
                    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {s.venue && <span className={`badge ${s.venue === "CATCH" ? "venue-badge-catch" : "venue-badge-oku"}`}>{s.venue}</span>}
                      {s.hostType === "INFLUENCER" && <span className="badge badge-neutral">{c.creatorSeries}</span>}
                      {s.hostType === "PARTNER" && <span className="badge badge-neutral">{c.partnerSeries}</span>}
                    </div>
                  </div>
                  <div className="series-card-content">
                    <div className="series-card-title">{title}</div>
                    {description && (
                      <div className="series-card-desc">{description.slice(0, 120)}{description.length > 120 ? "…" : ""}</div>
                    )}
                    <div className="series-card-meta">
                      {minPrice && <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>${(minPrice / 100).toFixed(0)}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
