import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const BASE = process.env.APP_BASE_URL || "http://localhost:5000";

async function getExperiences(params?: string) {
  const res = await fetch(`${BASE}/api/v1/experiences${params ? `?${params}` : ""}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.series ?? [];
}

const venueGrad: Record<string, string> = {
  OKU:  "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)",
  CATCH:"linear-gradient(135deg, #0a1628 0%, #1a2d4a 100%)",
};

const categories = ["All", "Food & Drink", "Wellness", "Design & Art"];

function AvailabilityBadge({ series }: { series: any }) {
  const sold   = series.capacitySold   ?? 0;
  const total  = series.capacityTotal  ?? 0;
  const remaining = Math.max(0, total - sold);
  const pct    = total > 0 ? remaining / total : 1;
  const mode   = series.availableSeatsMode;

  if (mode === "HIDDEN") return null;
  let label = "", color = "#6b7280";
  if (mode === "EXACT") {
    label = remaining > 0 ? `${remaining} seats` : "Sold out";
    color = remaining > 0 ? "#16a34a" : "#dc2626";
  } else {
    if (remaining === 0)    { label = "Sold out";             color = "#dc2626"; }
    else if (pct < 0.10)   { label = "Almost sold out";       color = "#dc2626"; }
    else if (pct < 0.30)   { label = "Limited seats left";    color = "#d97706"; }
    else                   { label = "Seats available";       color = "#16a34a"; }
  }

  return <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color, textTransform: "uppercase" }}>{label}</span>;
}

function ExperienceCard({ s }: { s: any }) {
  const minPrice = s.ticketTypes?.length ? Math.min(...s.ticketTypes.map((t: any) => t.priceCents)) : null;
  const inf = s.experienceInfluencer?.[0]?.influencer;
  return (
    <Link href={`/experiences/${s.slug}`} className="series-card" style={{ textDecoration: "none" }}>
      <div className="series-card-image" style={{ background: venueGrad[s.venue] ?? venueGrad.OKU, position: "relative" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 52, color: "rgba(255,255,255,0.07)", fontWeight: 400, letterSpacing: "-0.02em", userSelect: "none", position: "absolute" }}>
          {s.venue === "CATCH" ? "CATCH" : "OKÜ"}
        </span>
        {s.showCountdown && (
          <div style={{ position: "absolute", bottom: 12, left: 12 }}>
            <span style={{ background: "#c41e3a", color: "white", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 4, textTransform: "uppercase" }}>Early Access</span>
          </div>
        )}
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {s.venue && <span className={`badge ${s.venue === "CATCH" ? "venue-badge-catch" : "venue-badge-oku"}`}>{s.venue}</span>}
          {s.hostType === "INFLUENCER" && <span className="badge badge-neutral">Creator</span>}
          {s.hostType === "PARTNER"    && <span className="badge badge-neutral">Partner</span>}
        </div>
      </div>
      <div className="series-card-body">
        {s.category && <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#c41e3a", textTransform: "uppercase", marginBottom: 4 }}>{s.category}</div>}
        <div className="series-card-title">{s.title}</div>
        {inf && <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>Hosted by {inf.displayName ?? inf.handle}</div>}
        {s.description && <div className="series-card-desc">{s.description.length > 100 ? s.description.slice(0, 100) + "…" : s.description}</div>}
        <div className="series-card-footer">
          <span style={{ fontSize: 13, color: "#6b7280" }}>{s.city ?? "New York"}</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            {minPrice != null && <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1614" }}>From ${(minPrice / 100).toFixed(0)}</span>}
            <AvailabilityBadge series={s} />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function ExperiencesPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp  = await searchParams;
  const cat = sp.category ?? "All";
  const ven = sp.venue ?? "";

  const qp  = new URLSearchParams();
  if (cat && cat !== "All") qp.set("category", cat);
  if (ven) qp.set("venue", ven);
  const series = await getExperiences(qp.toString());
  const featured = series.filter((s: any) => s.isFeatured);
  const rest     = series.filter((s: any) => !s.isFeatured);

  return (
    <div>
      {/* Page header */}
      <div style={{ background: "#fafaf9", borderBottom: "1px solid #e5e0d8", padding: "48px 0 40px" }}>
        <div className="page-container">
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c41e3a", fontWeight: 600, marginBottom: 12 }}>OKÜ Hospitality Group</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 400, color: "#1a1614", letterSpacing: "-0.02em", margin: "0 0 12px" }}>Experiences</h1>
          <p style={{ fontSize: 16, color: "#6b7280", maxWidth: 520 }}>Curated dining, wellness, and creative series — crafted for those who seek more than ordinary.</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e0d8", padding: "0" }}>
        <div className="page-container" style={{ display: "flex", gap: 0, overflowX: "auto" }}>
          {categories.map((c) => (
            <Link key={c} href={`/experiences${c === "All" ? "" : `?category=${encodeURIComponent(c)}`}`}
              style={{ padding: "14px 20px", fontSize: 13, fontWeight: 500, color: cat === c ? "#c41e3a" : "#6b7280", borderBottom: cat === c ? "2px solid #c41e3a" : "2px solid transparent", textDecoration: "none", whiteSpace: "nowrap", transition: "color 0.15s" }}>
              {c}
            </Link>
          ))}
          <Link href="/experiences?venue=OKU" style={{ padding: "14px 20px", fontSize: 13, fontWeight: 500, color: ven === "OKU" ? "#c41e3a" : "#6b7280", borderBottom: ven === "OKU" ? "2px solid #c41e3a" : "2px solid transparent", textDecoration: "none", whiteSpace: "nowrap" }}>OKÜ Venue</Link>
          <Link href="/experiences?venue=CATCH" style={{ padding: "14px 20px", fontSize: 13, fontWeight: 500, color: ven === "CATCH" ? "#c41e3a" : "#6b7280", borderBottom: ven === "CATCH" ? "2px solid #c41e3a" : "2px solid transparent", textDecoration: "none", whiteSpace: "nowrap" }}>CATCH Venue</Link>
        </div>
      </div>

      <div className="page-container" style={{ padding: "48px 24px" }}>
        {/* Featured */}
        {featured.length > 0 && cat === "All" && !ven && (
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 400, color: "#1a1614", letterSpacing: "-0.01em", marginBottom: 24 }}>Featured</h2>
            <div className="card-grid">
              {featured.map((s: any) => <ExperienceCard key={s.id} s={s} />)}
            </div>
          </section>
        )}

        {/* All (or filtered) */}
        {rest.length > 0 && (
          <section>
            {featured.length > 0 && cat === "All" && !ven && (
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 400, color: "#1a1614", letterSpacing: "-0.01em", marginBottom: 24 }}>All Experiences</h2>
            )}
            <div className="card-grid">
              {rest.map((s: any) => <ExperienceCard key={s.id} s={s} />)}
            </div>
          </section>
        )}

        {series.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✦</div>
            <div style={{ fontSize: 16 }}>No experiences found for this filter.</div>
            <Link href="/experiences" style={{ color: "#c41e3a", fontSize: 14, marginTop: 12, display: "inline-block" }}>Clear filters</Link>
          </div>
        )}
      </div>
    </div>
  );
}
