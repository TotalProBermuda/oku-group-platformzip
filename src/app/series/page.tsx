import Link from "next/link";
import { seriesLocationLabel } from "@/lib/locations";

async function getSeries() {
  const base = process.env.APP_BASE_URL || "http://localhost:5000";
  const res = await fetch(`${base}/api/v1/series`, { cache: "no-store" });
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

export default async function SeriesPage() {
  const { data } = await getSeries();

  const okuSeries = (data || []).filter((s: any) => s.venue !== "CATCH");
  const catchSeries = (data || []).filter((s: any) => s.venue === "CATCH");

  return (
    <div>
      <div style={{
        background: "#f8f5f3",
        borderBottom: "1px solid var(--color-border)",
        padding: "40px 24px 32px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 12 }}>
            OKÜ Hospitality Group
          </div>
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--color-text)",
            marginBottom: 12,
            lineHeight: 1.1,
          }}>
            Upcoming Series
          </h1>
          <p style={{ fontSize: 16, color: "var(--color-text-secondary)", maxWidth: 520, lineHeight: 1.7 }}>
            Curated dining experiences, expert-led masterclasses, and exclusive events at our venues.
          </p>
        </div>
      </div>

      <div className="page-container" style={{ paddingTop: 40 }}>
        {(!data || data.length === 0) ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-title">No series available</div>
            <p className="text-secondary">Check back soon for upcoming events.</p>
          </div>
        ) : (
          <>
            {okuSeries.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                  <h2 className="section-title" style={{ margin: 0 }}>
                    OKÜ Venue
                  </h2>
                  <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                </div>
                <div className="card-grid">
                  {okuSeries.map((s: any) => (
                    <SeriesCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {catchSeries.length > 0 && (
              <section>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                  <h2 className="section-title" style={{ margin: 0 }}>
                    CATCH Venue
                  </h2>
                  <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                </div>
                <div className="card-grid">
                  {catchSeries.map((s: any) => (
                    <SeriesCard key={s.id} series={s} />
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

function PrivateShellCard({ series: s }: { series: any }) {
  const locationLabel = seriesLocationLabel(s);
  return (
    <div
      className="series-card"
      style={{
        cursor: "not-allowed",
        opacity: 0.85,
        filter: "grayscale(0.3)",
      }}
      title="This event is private. Contact the host for access."
    >
      <div
        className="series-card-image"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%)",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(2px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Private Event
          </span>
        </div>
        <div style={{ position: "absolute", top: 14, right: 14 }}>
          <span className="badge badge-neutral" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
            Private
          </span>
        </div>
      </div>
      <div className="series-card-body">
        <div className="series-card-title" style={{ color: "var(--color-text-secondary)" }}>
          Private Event
        </div>
        <div className="series-card-desc" style={{ color: "var(--color-text-muted)" }}>
          {s.startsAt ? new Date(s.startsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Date TBD"}
          {locationLabel && ` · ${locationLabel}`}
        </div>
        <div className="series-card-footer">
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>
            Invite only — contact host for access
          </span>
        </div>
      </div>
    </div>
  );
}

function SeriesCard({ series: s }: { series: any }) {
  if (s.seriesVisibilityMode === "PRIVATE_SHELL") {
    return <PrivateShellCard series={s} />;
  }

  const priceRange = getPriceRange(s.ticketTypes);
  const locationLabel = seriesLocationLabel(s);
  return (
    <Link href={`/series/${s.slug}`} className="series-card">
      <div className="series-card-image" style={{ background: venueGradients[s.venue || "OKU"] }}>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 52, color: "rgba(255,255,255,0.07)", fontWeight: 400, letterSpacing: "-0.02em", userSelect: "none", position: "absolute" }}>
          {locationLabel ?? "OKÜ"}
        </span>
        <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 6 }}>
          {locationLabel && (
            <span className={`badge ${s.venue === "CATCH" ? "venue-badge-catch" : "venue-badge-oku"}`}>
              {locationLabel}
            </span>
          )}
          {s.hostType === "INFLUENCER" && (
            <span className="badge badge-neutral">Creator</span>
          )}
          {s.hostType === "PARTNER" && (
            <span className="badge badge-neutral">Partner</span>
          )}
        </div>
      </div>
      <div className="series-card-body">
        <div className="series-card-title">{s.title}</div>
        {s.description && (
          <div className="series-card-desc">
            {s.description.length > 120 ? s.description.slice(0, 120) + "…" : s.description}
          </div>
        )}
        <div className="series-card-footer">
          <span className="session-count">
            {s.sessions?.length || 0} session{(s.sessions?.length || 0) !== 1 ? "s" : ""}
          </span>
          {priceRange && <span className="price-range">{priceRange}</span>}
        </div>
        <span className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start", marginTop: 4 }}>
          View Details →
        </span>
      </div>
    </Link>
  );
}
