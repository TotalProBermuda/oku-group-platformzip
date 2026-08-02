import Link from "next/link";
import { notFound } from "next/navigation";

const BASE = process.env.APP_BASE_URL || "http://localhost:5000";

async function getProfile(slug: string) {
  const res = await fetch(`${BASE}/api/v1/influencers/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()).profile ?? null;
}

const venueGrad: Record<string, string> = {
  OKU:  "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)",
  CATCH:"linear-gradient(135deg, #0a1628 0%, #1a2d4a 100%)",
};

export default async function InfluencerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile  = await getProfile(slug);
  if (!profile) notFound();

  const initials = (profile.displayName ?? profile.handle ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div>
      {/* Cover + hero */}
      <div style={{ background: "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)", padding: "64px 0 0", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 80%, rgba(196,30,58,0.1) 0%, transparent 60%)" }} />
        <div className="page-container" style={{ position: "relative", zIndex: 1, paddingBottom: 0 }}>
          <div style={{ display: "flex", gap: 32, alignItems: "flex-end", paddingBottom: 40, flexWrap: "wrap" }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: "linear-gradient(135deg, #c41e3a 0%, #7c0d1f 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 32, fontFamily: "var(--font-heading)", fontWeight: 400, flexShrink: 0, border: "3px solid rgba(255,255,255,0.1)" }}>
              {initials}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 400, color: "white", margin: 0, letterSpacing: "-0.02em" }}>{profile.displayName ?? profile.handle}</h1>
                {profile.isVerified && <span style={{ fontSize: 11, background: "#c41e3a", color: "white", padding: "3px 8px", borderRadius: 10, fontWeight: 700, letterSpacing: "0.04em" }}>Verified</span>}
              </div>
              {profile.headline && <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", margin: "0 0 12px" }}>{profile.headline}</p>}
              {profile.location && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>📍 {profile.location}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="page-container" style={{ padding: "40px 24px", display: "grid", gridTemplateColumns: "1fr 300px", gap: 48, alignItems: "start" }}>
        {/* Left */}
        <div>
          {profile.shortBio && (
            <section style={{ marginBottom: 40 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 400, color: "#1a1614", marginBottom: 12 }}>About</h2>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: "#4b5563" }}>{profile.longBio ?? profile.shortBio}</p>
            </section>
          )}

          {profile.series?.length > 0 && (
            <section>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>Experiences by {profile.displayName?.split(" ")[0]}</h2>
              <div className="card-grid">
                {profile.series.map((s: any) => {
                  const minPrice = s.ticketTypes?.length ? Math.min(...s.ticketTypes.map((t: any) => t.priceCents)) : null;
                  return (
                    <Link key={s.id} href={`/experiences/${s.slug}`} className="series-card" style={{ textDecoration: "none" }}>
                      <div className="series-card-image" style={{ background: venueGrad[s.venue] ?? venueGrad.OKU }}>
                        <span style={{ fontFamily: "var(--font-heading)", fontSize: 52, color: "rgba(255,255,255,0.07)", fontWeight: 400, position: "absolute" }}>{s.venue === "CATCH" ? "CATCH" : "OKÜ"}</span>
                        <div style={{ position: "absolute", top: 12, right: 12 }}>
                          {s.venue && <span className={`badge ${s.venue === "CATCH" ? "venue-badge-catch" : "venue-badge-oku"}`}>{s.venue}</span>}
                        </div>
                      </div>
                      <div className="series-card-body">
                        <div className="series-card-title">{s.title}</div>
                        {s.description && <div className="series-card-desc">{s.description.slice(0, 100)}…</div>}
                        <div className="series-card-footer">
                          <span style={{ fontSize: 13, color: "#9ca3af" }}>{s.city ?? ""}</span>
                          {minPrice != null && <span style={{ fontWeight: 600, color: "#1a1614" }}>From ${(minPrice / 100).toFixed(0)}</span>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "20px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#c41e3a", textTransform: "uppercase", marginBottom: 14 }}>Connect</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {profile.instagramUrl && <a href={profile.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#1a1614", display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>Instagram ↗</a>}
              {profile.tiktokUrl    && <a href={profile.tiktokUrl}    target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#1a1614", display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>TikTok ↗</a>}
              {profile.youtubeUrl   && <a href={profile.youtubeUrl}   target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#1a1614", display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>YouTube ↗</a>}
              {profile.websiteUrl   && <a href={profile.websiteUrl}   target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#1a1614", display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>Website ↗</a>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
