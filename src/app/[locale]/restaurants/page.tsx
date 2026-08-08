import Link from "next/link";
import { getTranslations } from "@/i18n/getTranslations";
import { isValidLocale } from "@/i18n/config";
import { localePath } from "@/i18n/utils";
import type { Locale } from "@/types/i18n";
import type { Metadata } from "next";
import { SUPPORTED_LOCALES } from "@/types/i18n";

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isValidLocale(locale) ? locale as Locale : "en";
  const t = await getTranslations(safeLocale, ["seo"]);
  const seo = t.seo as Record<string, string>;
  return {
    title: seo.restaurantsTitle,
    description: seo.restaurantsDescription,
  };
}

export default async function LocaleRestaurantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const safeLocale = isValidLocale(locale) ? locale as Locale : "en";
  const t = await getTranslations(safeLocale, ["venues", "common"]);
  const v = t.venues as Record<string, unknown>;
  const common = t.common as Record<string, string>;

  const RESTAURANTS = [
    {
      slug: "oku",
      name: "OKÜ",
      data: v.oku as Record<string, unknown>,
      covers: 27,
      hours: "Tue – Sun · 7 pm – 11 pm",
      accent: "#1a1614",
      lightAccent: "#f5f2ef",
      logo: "/images/logo-oku-white-mark.png",
      logoNeedsWhiteBox: false,
      slabBg: "linear-gradient(160deg, #1a1614 0%, #2d1f1b 50%, #1a1614 100%)",
      slabGlow: "radial-gradient(ellipse at 50% 0%, rgba(196,30,58,0.18) 0%, transparent 65%)",
    },
    {
      slug: "catch",
      name: "CATCH",
      data: v.catch as Record<string, unknown>,
      covers: 24,
      hours: "Thu – Sat · 8 pm – 2 am",
      accent: "#1e3a5f",
      lightAccent: "#f0f4f8",
      logo: "/images/logo-catch.webp",
      logoNeedsWhiteBox: false,
      slabBg: "#1e3a5f",
      slabGlow: null,
    },
    {
      slug: "terrace",
      name: "TERRACE",
      data: v.terrace as Record<string, unknown>,
      covers: 42,
      hours: "Wed – Sun · 6 pm – midnight",
      accent: "#2d4a1e",
      lightAccent: "#f2f5f0",
      logo: "/images/logo-terrace-cream.png",
      logoNeedsWhiteBox: false,
      slabBg: "#2d4a1e",
      slabGlow: null,
    },
  ];

  return (
    <div style={{ background: "#faf8f6", minHeight: "100vh", fontFamily: "var(--font-sans)" }}>
      <section className="hero">
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <div className="hero-eyebrow">{common.goldHouse} · {common.cascoViejo}</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(40px, 6vw, 68px)", fontWeight: 400, color: "#fff", letterSpacing: "-0.03em", margin: "0 0 20px", lineHeight: 1 }}>
            {v.ourRestaurants as string}
          </h1>
          <p className="hero-subtitle">{v.restaurantsSubtitle as string}</p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link href={localePath(safeLocale, "/reservations")} className="btn btn-primary btn-lg">
              {v.reserveArrow as string}
            </Link>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {RESTAURANTS.map((r, i) => {
            const rd = r.data || {};
            return (
              <div key={r.slug} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderRadius: 20, overflow: "hidden", border: "1px solid #e8e2dd" }}>
                <div style={{ background: r.slabBg, minHeight: 340, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "40px", order: i % 2 === 0 ? 0 : 1, position: "relative", overflow: "hidden" }}>
                  {r.slabGlow && <div style={{ position: "absolute", inset: 0, background: r.slabGlow, pointerEvents: "none" }} />}
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
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
                      {rd.tag as string || ""}
                    </div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, maxWidth: 280 }}>
                      {rd.tagline as string || ""}
                    </div>
                  </div>
                </div>

                <div style={{ padding: "40px 44px", display: "flex", flexDirection: "column", justifyContent: "space-between", order: i % 2 === 0 ? 1 : 0, background: "#fff" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "#1f1a17", letterSpacing: "-0.02em", marginBottom: 12 }}>
                      {rd.headline as string || ""}
                    </div>
                    <p style={{ fontSize: 14, color: "#7d7269", lineHeight: 1.7, marginBottom: 28, marginTop: 0 }}>
                      {rd.description as string || ""}
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px", marginBottom: 32 }}>
                      {[
                        { label: v.cuisine as string, value: rd.cuisine as string },
                        { label: v.covers as string,  value: `${r.covers} ${v.seats as string}` },
                        { label: v.setting as string, value: rd.setting as string },
                        { label: v.hours as string,   value: r.hours },
                      ].map(info => (
                        <div key={info.label}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7d7269", marginBottom: 3 }}>{info.label}</div>
                          <div style={{ fontSize: 13, color: "#1f1a17", fontWeight: 500 }}>{info.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Link href={localePath(safeLocale, `/restaurants/${r.slug}`)} style={{ flex: 1, textAlign: "center", padding: "12px", border: "1.5px solid #e8e2dd", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "#1f1a17", textDecoration: "none", background: "#faf8f6" }}>
                      {v.viewProfile as string}
                    </Link>
                    <Link href={localePath(safeLocale, `/reservations?concept=${r.slug}`)} style={{ flex: 2, textAlign: "center", padding: "12px", background: "#c41e3a", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#fff", textDecoration: "none" }}>
                      {v.reserveArrow as string}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#1a1614", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>
          {common.goldHouse}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>
          {common.cascoViejo} · {common.openTueSun}
        </div>
        <Link href={localePath(safeLocale, "/reservations")} style={{ display: "inline-block", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          {common.bookTable}
        </Link>
      </div>
    </div>
  );
}
