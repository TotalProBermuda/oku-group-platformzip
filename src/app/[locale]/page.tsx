import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTranslations } from "@/i18n/getTranslations";
import { isValidLocale } from "@/i18n/config";
import { localePath } from "@/i18n/utils";
import type { Locale } from "@/types/i18n";
import type { Metadata } from "next";
import { SUPPORTED_LOCALES } from "@/types/i18n";

interface SeriesItem {
  id: string; slug: string; title: string; description: string | null;
  venue: string | null; hostType: string;
  ticketTypes: { priceCents: number }[];
  sessions: { id: string }[];
}

async function getFeaturedSeries(locale: string): Promise<SeriesItem[]> {
  try {
    const base = process.env.APP_BASE_URL || "http://localhost:5000";
    const res = await fetch(`${base}/api/v1/series?locale=${locale}`, { cache: "no-store" });
    const json = await res.json();
    return json.ok ? (json.data || []).slice(0, 3) : [];
  } catch { return []; }
}

async function getJobCount(): Promise<number> {
  try {
    const base = process.env.APP_BASE_URL || "http://localhost:5000";
    const res = await fetch(`${base}/api/v1/public/jobs`, { cache: "no-store" });
    const json = await res.json();
    return json.ok ? (json.data || []).length : 0;
  } catch { return 0; }
}

function getPriceRange(ticketTypes: { priceCents: number }[]) {
  if (!ticketTypes?.length) return null;
  const prices = ticketTypes.map((t) => t.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const fmt = (c: number) => `$${(c / 100).toFixed(0)}`;
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
}


const venueGradients: Record<string, string> = {
  OKU: "linear-gradient(135deg, #2d1f1b 0%, #1a1614 100%)",
  CATCH: "linear-gradient(135deg, #0f1f2d 0%, #0a1520 100%)",
  TERRACE: "linear-gradient(135deg, #1a2d14 0%, #0f1f0a 100%)",
};

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isValidLocale(locale) ? locale as Locale : "en";
  const t = await getTranslations(safeLocale, ["seo"]);
  const seo = t.seo as Record<string, string>;
  return {
    title: seo.homeTitle,
    description: seo.homeDescription,
  };
}

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const safeLocale = isValidLocale(locale) ? locale as Locale : "en";
  const [session, series, jobCount, t] = await Promise.all([
    getServerSession(authOptions),
    getFeaturedSeries(safeLocale),
    getJobCount(),
    getTranslations(safeLocale, ["home", "common", "navigation"]),
  ]);

  const home   = t.home   as Record<string, string>;
  const common = t.common as Record<string, string>;

  const roles: string[] = (session?.user as Record<string, unknown>)?.roles as string[] || [];
  const isAdmin      = roles.some((r) => ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"].includes(r));
  const isHost       = roles.some((r) => ["RESTAURANT_HOST", "STREETSIDE_HOST", "RESTAURANT_SUPERVISOR"].includes(r));
  const isStreetsideHost = roles.includes("STREETSIDE_HOST") && !roles.includes("RESTAURANT_HOST");
  const isInfluencer = roles.includes("INFLUENCER");
  const isReferrer   = roles.includes("REFERRER");
  const isPartner    = roles.includes("PARTNER");
  const isInvestor   = roles.includes("INVESTOR");
  const isStaff      = roles.some((r) => r.startsWith("STAFF_"));
  const showPortal   = isAdmin || isInfluencer || isReferrer || isPartner || isInvestor || isStaff || isHost;

  const portalDefs = [
    { role: "admin",      href: "/admin",                icon: "⚙", title: common.portalAdminTitle || "Admin Console",        desc: common.portalAdminDesc || "Manage series, orders, users, IR and HR" },
    { role: "host",       href: isStreetsideHost ? "/host/streetside" : "/host/dashboard", icon: "🍽", title: isStreetsideHost ? (common.portalStreetsideTitle || "Streetside") : (common.portalHostTitle || "Host Dashboard"), desc: isStreetsideHost ? (common.portalStreetsideDesc || "Live referrals, walk-ins & QR tools") : (common.portalHostDesc || "Live reservations, commissions, streetside") },
    { role: "influencer", href: "/influencer/dashboard", icon: "↗", title: common.portalInfluencerTitle || "Influencer Dashboard", desc: common.portalInfluencerDesc || "Track referrals, earnings and commissions" },
    { role: "referrer",   href: "/referrer/dashboard",   icon: "◎", title: common.portalReferrerTitle || "Referrer Portal",    desc: common.portalReferrerDesc || "Your referral link, guest pipeline & earnings" },
    { role: "partner",    href: "/partner/dashboard",    icon: "◈", title: common.portalPartnerTitle || "Partner Portal",      desc: common.portalPartnerDesc || "View your series and partnership metrics" },
    { role: "investor",   href: "/investor",             icon: "◉", title: common.portalInvestorTitle || "Investor Relations", desc: common.portalInvestorDesc || "Access financial reports and IR documents" },
    { role: "staff",      href: "/staff",                icon: "≡", title: common.portalStaffTitle || "SOPs & Training",       desc: common.portalStaffDesc || "Standard operating procedures for your venue" },
  ];

  const visiblePortals = portalDefs.filter((p) => {
    if (p.role === "admin")      return isAdmin;
    if (p.role === "host")       return isHost;
    if (p.role === "influencer") return isInfluencer;
    if (p.role === "referrer")   return isReferrer;
    if (p.role === "partner")    return isPartner;
    if (p.role === "investor")   return isInvestor;
    if (p.role === "staff")      return isStaff;
    return false;
  });

  const jobsLabel = jobCount > 0
    ? `${jobCount} ${jobCount !== 1 ? common.openPositions : common.openPosition}`
    : common.noOpenPositions;

  return (
    <div>
      {/* ── PUBLIC MARKETING HERO — always visible regardless of session ── */}
      <section className="hero">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="hero-eyebrow">{home.eyebrow}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(48px, 7vw, 80px)", fontWeight: 400, letterSpacing: "-0.03em", color: "white", marginBottom: 20, lineHeight: 1 }}>
            {home.headline}
          </div>
          <p className="hero-subtitle">{home.subtitle}</p>
          <div className="hero-actions">
            <Link href={localePath(safeLocale, "/login")} className="btn btn-primary btn-lg">
              {home.signInCta}
            </Link>
            <Link href={localePath(safeLocale, "/series")} className="btn btn-lg" style={{ background: "rgba(255,255,255,0.1)", color: "white", border: "1.5px solid rgba(255,255,255,0.2)" }}>
              {home.browseSeries}
            </Link>
          </div>
        </div>
      </section>

      <div className="page-container">
        {/* ── PORTAL CARDS — elevated roles only ─────────────────────── */}
        {showPortal && visiblePortals.length > 0 && (
          <section style={{ marginBottom: 56 }}>
            <h2 className="section-title">{common.yourPortal || "Your Portal"}</h2>
            <div className="card-grid">
              {visiblePortals.map((p) => (
                <Link key={p.href} href={p.href} className="portal-card">
                  <div className="portal-card-icon">{p.icon}</div>
                  <div>
                    <div className="portal-card-title">{p.title}</div>
                    <div className="portal-card-desc">{p.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── FEATURED SERIES ────────────────────────────────────────── */}
        {series.length > 0 && (
          <section style={{ marginBottom: 56 }}>
            <div className="section-header">
              <h2 className="section-title" style={{ margin: 0 }}>{common.featuredSeries}</h2>
              <Link href={localePath(safeLocale, "/series")} className="btn btn-secondary btn-sm">
                {common.viewAll} →
              </Link>
            </div>
            <div className="card-grid">
              {series.map((s) => (
                <Link key={s.id} href={localePath(safeLocale, `/series/${s.slug}`)} className="series-card">
                  <div className="series-card-image" style={{ background: venueGradients[s.venue || "OKU"] }}>
                    <span style={{ fontFamily: "var(--font-heading)", fontSize: 52, color: "rgba(255,255,255,0.07)", fontWeight: 400, letterSpacing: "-0.02em", userSelect: "none", position: "absolute" }}>
                      {s.venue === "CATCH" ? "CATCH" : s.venue === "TERRACE" ? "TERRACE" : "OKÜ"}
                    </span>
                    <div style={{ position: "absolute", top: 12, right: 12 }}>
                      <span className={`badge ${s.venue === "CATCH" ? "venue-badge-catch" : s.venue === "TERRACE" ? "venue-badge-terrace" : "venue-badge-oku"}`}>
                        {s.venue === "TERRACE" ? "TERRACE" : s.venue || "OKÜ"}
                      </span>
                    </div>
                  </div>
                  <div className="series-card-body">
                    <div className="series-card-title">{s.title}</div>
                    {s.description && (
                      <div className="series-card-desc">
                        {s.description.length > 110 ? s.description.slice(0, 110) + "…" : s.description}
                      </div>
                    )}
                    <div className="series-card-footer">
                      <span className="session-count">
                        {s.sessions?.length || 0} {(s.sessions?.length || 0) !== 1 ? common.sessions : common.session}
                      </span>
                      {getPriceRange(s.ticketTypes) && (
                        <span className="price-range">{getPriceRange(s.ticketTypes)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── INFO CARDS ─────────────────────────────────────────────── */}
        <section>
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            <div className="card" style={{ borderLeft: "4px solid var(--color-primary)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", marginBottom: 12 }}>{common.careers}</div>
              <div className="font-heading" style={{ fontSize: 28, color: "var(--color-primary)", marginBottom: 4 }}>{jobCount}</div>
              <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 20 }}>{jobsLabel}</div>
              <Link href={localePath(safeLocale, "/jobs")} className="btn btn-outline-primary btn-sm">{common.viewPositions}</Link>
            </div>

            <div className="card" style={{ borderLeft: "4px solid #1a1614" }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", marginBottom: 12 }}>{common.ourVenues}</div>
              <div className="font-heading" style={{ fontSize: 22, marginBottom: 8 }}>OKÜ, CATCH & TERRACE</div>
              <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 20 }}>{common.venuesDesc}</div>
              <Link href={localePath(safeLocale, "/restaurants")} className="btn btn-secondary btn-sm">{common.exploreVenues}</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
