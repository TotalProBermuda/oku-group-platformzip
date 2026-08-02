import { brand, info } from "@/data/catch";
import { GROUP_BASE, reserveUrl } from "@/lib/links";

export default function SiteFooter() {
  return (
    <footer style={{ background: brand.dark, color: "#fff", padding: "72px 48px 40px" }} className="catch-section">
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr",
          gap: "48px 64px",
        }}
        className="catch-about-grid"
      >
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/catch/logo-catch.webp"
            alt="CATCH Panamá"
            style={{ height: 48, width: "auto", objectFit: "contain", marginBottom: 20 }}
          />
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.55)", margin: 0, maxWidth: 320 }}>
            {info.taglineEn}. Casco Viejo, Panama City.
          </p>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: brand.gold, marginBottom: 16 }}>
            Visit
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.9 }}>
            <div>{info.address}</div>
            <div>
              <a href={`tel:${info.phone.replace(/[^+\d]/g, "")}`} style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>
                {info.phone}
              </a>
            </div>
            <div>
              <a href={`mailto:${info.email}`} style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>
                {info.email}
              </a>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            {info.hours.map((h) => (
              <div key={h.day} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.8 }}>
                <span style={{ color: "rgba(255,255,255,0.75)" }}>{h.day}</span> · {h.time}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: brand.gold, marginBottom: 16 }}>
            Reservations & Tickets
          </div>
          <a
            href={reserveUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              background: brand.crimson,
              color: "#fff",
              borderRadius: 10,
              padding: "12px 24px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.02em",
              textDecoration: "none",
              marginBottom: 16,
            }}
          >
            Reserve a Table →
          </a>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, margin: 0 }}>
            Bookings and event tickets are handled securely by OKÜ Hospitality Group.
          </p>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1000,
          margin: "48px auto 0",
          paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          © {new Date().getFullYear()} CATCH Panamá. All rights reserved.
        </span>
        <a
          href={GROUP_BASE}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em", textTransform: "uppercase", textDecoration: "none" }}
        >
          Part of OKÜ Hospitality Group ↗
        </a>
      </div>
    </footer>
  );
}
