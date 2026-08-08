import Link from "next/link";

const RESTAURANTS = [
  {
    slug: "oku",
    name: "OKÜ",
    headline: "Intimate Fine Dining",
    tagline: "White linen. Candlelight. Structured service for 27.",
    description: "OKÜ is our flagship dining room — an intimate, chef-driven experience rooted in modern Mediterranean cuisine. The room seats 27 and every table feels like a private affair.",
    cuisine: "Modern Mediterranean",
    covers: 27,
    setting: "Indoor · Air-conditioned",
    hours: "Tue – Sun · 7 pm – 11 pm",
    accent: "#1a1614",
    lightAccent: "#f5f2ef",
    tag: "Fine Dining",
    logo: "/images/logo-oku-white-mark.png",
    logoNeedsWhiteBox: false,
    slabBg: "linear-gradient(160deg, #1a1614 0%, #2d1f1b 50%, #1a1614 100%)",
    slabGlow: "radial-gradient(ellipse at 50% 0%, rgba(196,30,58,0.18) 0%, transparent 65%)",
  },
  {
    slug: "catch",
    name: "CATCH",
    headline: "Boho-Caribbean Nightlife",
    tagline: "Sharing plates, live DJs, and Caribbean energy.",
    description: "CATCH is where dining meets the night. Caribbean-inspired sharing plates, a curated cocktail programme, and a rotating DJ booth make every evening an event in itself.",
    cuisine: "Caribbean-inspired sharing plates",
    covers: 24,
    setting: "Indoor / Outdoor hybrid",
    hours: "Thu – Sat · 8 pm – 2 am",
    accent: "#1e3a5f",
    lightAccent: "#f0f4f8",
    tag: "Nightlife Dining",
    logo: "/images/logo-catch.webp",
    logoNeedsWhiteBox: false,
    slabBg: "#1e3a5f",
    slabGlow: null,
  },
  {
    slug: "terrace",
    name: "TERRACE",
    headline: "Open-Air Rooftop Dining",
    tagline: "Patterned tile. Evening breeze. The city below.",
    description: "The Terrace is Gold House's open-air crown — 42 covers beneath the Panama sky, surrounded by hand-painted tile and lantern light. Pan-American sharing plates, crafted cocktails, and uninterrupted sunset views.",
    cuisine: "Pan-American sharing plates",
    covers: 42,
    setting: "Open-air rooftop",
    hours: "Wed – Sun · 6 pm – midnight",
    accent: "#2d4a1e",
    lightAccent: "#f2f5f0",
    tag: "Rooftop",
    logo: "/images/logo-terrace-cream.png",
    logoNeedsWhiteBox: false,
    slabBg: "#2d4a1e",
    slabGlow: null,
  },
];

export default function RestaurantsPage() {
  return (
    <div style={{ background: "#faf8f6", minHeight: "100vh", fontFamily: "var(--font-sans)" }}>

      {/* Hero */}
      <section className="hero">
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <div className="hero-eyebrow">Gold House · Casco Viejo, Panama City</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(40px, 6vw, 68px)", fontWeight: 400, color: "#fff", letterSpacing: "-0.03em", margin: "0 0 20px", lineHeight: 1 }}>
            Our Restaurants
          </h1>
          <p className="hero-subtitle">
            Three distinct dining experiences under one roof — each with its own identity, cuisine, and atmosphere.
          </p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link href="/reservations" className="btn btn-primary btn-lg">
              Reserve a Table →
            </Link>
          </div>
        </div>
      </section>

      {/* Restaurant Cards */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {RESTAURANTS.map((r, i) => (
            <div key={r.slug} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderRadius: 20, overflow: "hidden", border: "1px solid #e8e2dd" }}>

              {/* Logo Slab */}
              <div style={{
                background: r.slabBg,
                minHeight: 340,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "40px",
                order: i % 2 === 0 ? 0 : 1,
                position: "relative",
                overflow: "hidden",
              }}>
                {r.slabGlow && <div style={{ position: "absolute", inset: 0, background: r.slabGlow, pointerEvents: "none" }} />}
                {/* Logo centred */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {r.logoNeedsWhiteBox ? (
                    <div style={{ background: "rgba(255,255,255,0.95)", borderRadius: 14, padding: "16px 24px" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.logo} alt={r.name} style={{ height: 56, width: "auto", objectFit: "contain", display: "block" }} />
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.logo} alt={r.name} style={{ height: 100, width: "auto", objectFit: "contain", filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.4))" }} />
                  )}
                </div>
                {/* Caption strip */}
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
                    {r.tag}
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, maxWidth: 280 }}>
                    {r.tagline}
                  </div>
                </div>
              </div>

              {/* Info Panel — white */}
              <div style={{ padding: "40px 44px", display: "flex", flexDirection: "column", justifyContent: "space-between", order: i % 2 === 0 ? 1 : 0, background: "#fff" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "#1f1a17", letterSpacing: "-0.02em", marginBottom: 12 }}>
                    {r.headline}
                  </div>
                  <p style={{ fontSize: 14, color: "#7d7269", lineHeight: 1.7, marginBottom: 28, marginTop: 0 }}>
                    {r.description}
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px", marginBottom: 32 }}>
                    {[
                      { label: "Cuisine", value: r.cuisine },
                      { label: "Covers", value: `${r.covers} seats` },
                      { label: "Setting", value: r.setting },
                      { label: "Hours", value: r.hours },
                    ].map(info => (
                      <div key={info.label}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7d7269", marginBottom: 3 }}>{info.label}</div>
                        <div style={{ fontSize: 13, color: "#1f1a17", fontWeight: 500 }}>{info.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <Link
                    href={`/restaurants/${r.slug}`}
                    style={{ flex: 1, textAlign: "center", padding: "12px", border: "1.5px solid #e8e2dd", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "#1f1a17", textDecoration: "none", background: "#faf8f6" }}
                  >
                    View Profile
                  </Link>
                  <Link
                    href={`/reservations?concept=${r.slug}`}
                    style={{ flex: 2, textAlign: "center", padding: "12px", background: "#c41e3a", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#fff", textDecoration: "none" }}
                  >
                    Reserve a Table →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Strip */}
      <div style={{ background: "#1a1614", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>
          Gold House
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>
          Casco Viejo, Panama City · Open Tue – Sun
        </div>
        <Link href="/reservations" style={{ display: "inline-block", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          Book a Table
        </Link>
      </div>
    </div>
  );
}
