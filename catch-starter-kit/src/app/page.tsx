import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import { about, brand, events, gallery, heroPhoto, info, menu } from "@/data/catch";
import { reserveUrl, ticketUrl } from "@/lib/links";

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: brand.gold,
  marginBottom: 24,
  display: "block",
};

export default function CatchHomePage() {
  return (
    <div id="top" style={{ background: brand.pageBg, minHeight: "100vh", fontFamily: "var(--font-sans)" }}>
      <SiteNav />

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          height: "100svh",
          minHeight: 600,
          background: brand.dark,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroPhoto.src}
          alt={heroPhoto.alt}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: heroPhoto.pos ?? "center", zIndex: 0 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(10,8,6,0.55) 0%, rgba(10,8,6,0.3) 40%, rgba(10,8,6,0.78) 100%)",
            zIndex: 1,
          }}
        />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "40px 48px 80px", position: "relative", zIndex: 10 }} className="catch-section">
          <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: brand.gold, marginBottom: 20 }}>
            {info.tagline}
          </div>
          <div style={{ fontFamily: "var(--font-heading)", color: "#fff", lineHeight: 0.92, letterSpacing: "-0.04em" }}>
            <div style={{ fontSize: "clamp(48px, 8vw, 104px)" }}>{info.heroLine1}</div>
            <div style={{ fontSize: "clamp(48px, 8vw, 104px)" }}>{info.heroLine2}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 36 }}>
            <a href={reserveUrl} target="_blank" rel="noopener noreferrer" style={{ background: brand.crimson, color: "#fff", borderRadius: 10, padding: "14px 28px", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", textDecoration: "none" }}>
              Reserve a Table →
            </a>
            <a href="#menu" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 10, padding: "14px 28px", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", textDecoration: "none" }}>
              The Menu
            </a>
          </div>
        </div>
      </section>

      {/* ── ABOUT ───────────────────────────────────────────────────────────── */}
      <section id="about" style={{ background: "#fff", padding: "96px 48px", scrollMarginTop: 64 }} className="catch-section">
        <div
          style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "200px 1fr", gap: "0 80px", alignItems: "start" }}
          className="catch-about-grid"
        >
          <div>
            <span style={eyebrow}>About</span>
            <div style={{ background: brand.dark, borderRadius: 12, padding: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/catch/logo-catch.webp" alt="CATCH" style={{ height: 56, width: "auto", objectFit: "contain" }} />
            </div>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Cuisine", value: info.cuisine },
                { label: "Covers", value: `${info.covers} seats` },
                { label: "Hours", value: info.hours[0].time },
                { label: "Dress", value: info.dresscode },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: brand.inkSoft, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: brand.ink, fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            {about.map((para, i) => (
              <p key={i} style={{ fontSize: i === 0 ? 20 : 15, lineHeight: i === 0 ? 1.65 : 1.8, color: i === 0 ? brand.ink : "#4a3f39", marginTop: 0, marginBottom: 24, fontWeight: i === 0 ? 400 : 300 }}>
                {para}
              </p>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, alignItems: "center" }}>
              <a href={reserveUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: brand.crimson, color: "#fff", borderRadius: 10, padding: "13px 24px", fontSize: 13, fontWeight: 700, textDecoration: "none", letterSpacing: "0.02em" }}>
                Reserve a Table →
              </a>
              <a href="#events" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: brand.ink, color: "#fff", borderRadius: 10, padding: "13px 24px", fontSize: 13, fontWeight: 700, textDecoration: "none", letterSpacing: "0.02em" }}>
                What&apos;s On
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── GALLERY ─────────────────────────────────────────────────────────── */}
      <section id="gallery" style={{ background: brand.light, scrollMarginTop: 64 }}>
        <div
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gridTemplateRows: "300px 300px", gap: 3 }}
          className="catch-gallery-grid"
        >
          {(() => {
            const cells = [
              { row: "1 / 3", col: "1 / 2" },
              { row: "1 / 2", col: "2 / 3" },
              { row: "1 / 2", col: "3 / 4" },
              { row: "2 / 3", col: "2 / 3" },
              { row: "2 / 3", col: "3 / 4" },
            ];
            return cells.map((cell, i) => {
              const photo = gallery[i];
              return (
                <div key={i} style={{ gridRow: cell.row, gridColumn: cell.col, background: brand.dark, position: "relative", overflow: "hidden" }}>
                  {photo && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={photo.src} alt={photo.alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: photo.pos ?? "center" }} />
                  )}
                </div>
              );
            });
          })()}
        </div>
        <div style={{ padding: "28px 48px", background: brand.dark }} className="catch-section">
          <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              CATCH · Gold House · Casco Viejo
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
              Photography © CATCH Panamá
            </span>
          </div>
        </div>
      </section>

      {/* ── MENU ────────────────────────────────────────────────────────────── */}
      <section id="menu" style={{ background: brand.pageBg, padding: "96px 48px", scrollMarginTop: 64 }} className="catch-section">
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <span style={eyebrow}>The Menu</span>
          <div style={{ display: "grid", gap: 40 }}>
            {menu.map((cat) => (
              <div key={cat.category}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: brand.ink, letterSpacing: "-0.02em", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${brand.light}` }}>
                  {cat.category}
                </div>
                <div style={{ display: "grid", gap: 16 }}>
                  {cat.items.map((item) => (
                    <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: brand.ink, marginBottom: 3 }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: brand.inkSoft, lineHeight: 1.6 }}>{item.desc}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: brand.crimson, flexShrink: 0 }}>{item.price}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── EVENTS ──────────────────────────────────────────────────────────── */}
      <section id="events" style={{ background: "#fff", padding: "96px 48px", scrollMarginTop: 64 }} className="catch-section">
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <span style={eyebrow}>What&apos;s On</span>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)", color: brand.ink, letterSpacing: "-0.03em", marginBottom: 12 }}>
            Events at CATCH
          </div>
          <p style={{ fontSize: 15, color: brand.inkSoft, lineHeight: 1.8, maxWidth: 560, marginTop: 0, marginBottom: 48 }}>
            From weekly DJ nights to ticketed supper series. Tickets are handled securely by OKÜ Hospitality Group.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }} className="catch-events-grid">
            {events.map((ev) => (
              <div key={ev.slug} style={{ border: "1.5px solid #e8e2dd", borderRadius: 16, overflow: "hidden", background: brand.pageBg, display: "flex", flexDirection: "column" }}>
                <div style={{ position: "relative", height: 180, overflow: "hidden", background: brand.dark }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ev.image} alt={ev.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: brand.crimson, marginBottom: 8 }}>
                    {ev.date} · {ev.time}
                  </div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, color: brand.ink, letterSpacing: "-0.02em", marginBottom: 10 }}>
                    {ev.title}
                  </div>
                  <p style={{ fontSize: 13, color: brand.inkSoft, lineHeight: 1.7, marginTop: 0, marginBottom: 20, flex: 1 }}>
                    {ev.blurb}
                  </p>
                  <a
                    href={ticketUrl(ev.seriesSlug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start", background: brand.ink, color: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", textDecoration: "none" }}
                  >
                    Get Tickets →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RESERVE ─────────────────────────────────────────────────────────── */}
      <section style={{ background: brand.dark, padding: "96px 48px", textAlign: "center" }} className="catch-section">
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 5vw, 52px)", color: "#fff", letterSpacing: "-0.03em", marginBottom: 20 }}>
            Reserve your table
          </div>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, marginBottom: 40 }}>
            {info.taglineEn}. Join us Thursday through Saturday in Casco Viejo.
          </p>
          <a href={reserveUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", background: brand.crimson, color: "#fff", borderRadius: 12, padding: "16px 40px", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em", textDecoration: "none" }}>
            Reserve a Table →
          </a>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
