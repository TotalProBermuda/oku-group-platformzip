import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTranslations } from "@/i18n/getTranslations";
import { isValidLocale } from "@/i18n/config";
import { localePath } from "@/i18n/utils";
import { getPublicExperienceBySlug } from "@/server/experiences/publicSeries";
import type { Locale } from "@/types/i18n";
import EventPageSponsorBlock from "@/components/sponsors/EventPageSponsorBlock";
import EventMenusSection from "@/components/experiences/EventMenusSection";
import AddToCalendar from "@/components/ui/AddToCalendar";
import ShareButtons from "@/components/ui/ShareButtons";
import type { Metadata } from "next";

const BASE = process.env.APP_BASE_URL || "http://localhost:5000";
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://okugroup.com";

export const dynamic = "force-dynamic";

async function getSeries(slug: string) {
  return getPublicExperienceBySlug(slug);
}

async function getAvailability(slug: string) {
  const res = await fetch(`${BASE}/api/v1/experiences/${slug}/availability`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

function fmt(cents: number) { return `$${(cents / 100).toFixed(0)}`; }

const venueGrad: Record<string, string> = {
  OKU:  "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)",
  CATCH:"linear-gradient(135deg, #0a1628 0%, #1a2d4a 100%)",
};

interface Props { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const safeLocale = isValidLocale(locale) ? (locale as Locale) : "en";
  const series = await getSeries(slug);
  if (!series) return {};

  const title = series.title;
  const description = series.description ?? "";
  const imageUrl = series.heroImageUrl ?? undefined;
  const canonicalUrl = `${PUBLIC_BASE}/${safeLocale}/experiences/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: imageUrl ? [{ url: imageUrl, width: 1200, height: 630, alt: title }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

export default async function ExperienceDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  const safeLocale = isValidLocale(locale) ? (locale as Locale) : "en";

  const [series, availability, session, translations] = await Promise.all([
    getSeries(slug),
    getAvailability(slug),
    getServerSession(authOptions),
    getTranslations(safeLocale, ["common"]),
  ]);

  if (!series) notFound();

  const c = translations.common as Record<string, string>;

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString(
      safeLocale === "es" ? "es-PA" : safeLocale === "pt" ? "pt-BR" : "en-US",
      { weekday: "long", month: "long", day: "numeric", year: "numeric" }
    );
  const fmtTime = (d: string | Date) =>
    new Date(d).toLocaleTimeString(
      safeLocale === "es" ? "es-PA" : safeLocale === "pt" ? "pt-BR" : "en-US",
      { hour: "numeric", minute: "2-digit" }
    );

  const influencers = series.experienceInfluencer ?? [];
  const addons      = series.addons ?? [];
  const sessions    = series.sessions ?? [];
  const ticketTypes = series.ticketTypes ?? [];
  const firstSession = sessions[0];
  const isCountdownActive = series.showCountdown && series.earlyReleaseAt && new Date() < new Date(series.earlyReleaseAt);

  const title = series.title;
  const description = series.description;

  const pageUrl = `${PUBLIC_BASE}/${safeLocale}/experiences/${slug}`;
  const locationStr = [series.venue, series.venueAddress, series.city].filter(Boolean).join(", ");

  return (
    <div>
      {/* Hero */}
      <div style={{ background: venueGrad[series.venue] ?? venueGrad.OKU, padding: "72px 0 56px", position: "relative", overflow: "hidden", minHeight: series.heroImageUrl ? 360 : undefined }}>
        {series.heroImageUrl && (
          <img src={series.heroImageUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: series.heroImageUrl ? "linear-gradient(to bottom, rgba(26,22,20,0.55) 0%, rgba(26,22,20,0.72) 100%)" : "radial-gradient(ellipse at 60% 50%, rgba(196,30,58,0.08) 0%, transparent 70%)" }} />
        <div className="page-container" style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {series.venue && <span className={`badge ${series.venue === "CATCH" ? "venue-badge-catch" : "venue-badge-oku"}`}>{series.venue}</span>}
            {series.category && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#f9a8d4", textTransform: "uppercase" }}>{series.category}</span>}
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 5vw, 60px)", fontWeight: 400, color: "white", letterSpacing: "-0.02em", margin: "0 0 12px", lineHeight: 1.1 }}>{title}</h1>
          {series.subtitle && <p style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", margin: "0 0 24px", maxWidth: 560 }}>{series.subtitle}</p>}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
            {series.city && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>📍 {series.city}{series.venueAddress ? ` — ${series.venueAddress}` : ""}</span>}
            {firstSession && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>📅 {fmtDate(firstSession.startsAt)}</span>}
          </div>
          {/* Social sharing in hero */}
          <ShareButtons
            url={pageUrl}
            title={title}
            imageUrl={series.heroImageUrl ?? undefined}
            labels={{
              shareHeading: c.shareHeading,
              copyLink: c.shareCopyLink,
              copied: c.shareCopied,
              whatsApp: c.shareWhatsApp,
              instagram: c.shareInstagram,
            }}
          />
        </div>
      </div>

      {/* Countdown banner */}
      {isCountdownActive && (
        <div style={{ background: "#c41e3a", padding: "14px 24px", textAlign: "center" }}>
          <span style={{ color: "white", fontSize: 14, fontWeight: 600, letterSpacing: "0.02em" }}>
            {series.countdownLabel ?? c.earlyAccessOnly} — {c.earlyAccessBannerDesc}
          </span>
        </div>
      )}

      <div className="page-container" style={{ padding: "48px 24px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 48, alignItems: "start" }}>
        {/* Left column */}
        <div>
          {/* Description */}
          <section style={{ marginBottom: 48 }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>
              {c.aboutThisExperience}
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.8, color: "#4b5563", whiteSpace: "pre-line" }}>{description}</p>
          </section>

          {/* Sessions */}
          {sessions.length > 0 && (
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>
                {c.sessionsHeading}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sessions.map((s: any) => (
                  <div key={s.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "#1a1614", marginBottom: 4 }}>
                          {s.title ?? c.sessionLabel}
                        </div>
                        <div style={{ fontSize: 13, color: "#6b7280" }}>{fmtDate(s.startsAt)} · {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>{s.capacity - s.soldCount} {c.left}</div>
                        <span className={`badge ${s.status === "SOLD_OUT" ? "badge-error" : s.status === "CANCELLED" ? "badge-neutral" : "badge-success"}`}>
                          {s.status === "SOLD_OUT" ? c.sessionStatusSoldOut
                            : s.status === "CANCELLED" ? c.sessionStatusCancelled
                            : s.status === "COMPLETED" ? c.sessionStatusCompleted
                            : c.sessionStatusScheduled}
                        </span>
                      </div>
                    </div>
                    {s.status === "SCHEDULED" && (
                      <AddToCalendar
                        sessionId={s.id}
                        title={s.title ?? series.title}
                        startsAt={s.startsAt}
                        endsAt={s.endsAt}
                        location={locationStr}
                        description={series.description ?? ""}
                        labels={{
                          addToCalendar: c.addToCalendar,
                          google: c.calGoogleCalendar,
                          apple: c.calAppleIcal,
                          outlook: c.calOutlook,
                          yahoo: c.calYahoo,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Influencer / Host cards */}
          {influencers.length > 0 && (
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>
                {c.yourHosts}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {influencers.map((ei: any) => {
                  const inf = ei.influencer;
                  return (
                    <div key={ei.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "20px 24px", display: "flex", gap: 20, alignItems: "center" }}>
                      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #c41e3a 0%, #7c0d1f 100%)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 20, fontFamily: "var(--font-heading)" }}>
                        {(inf.displayName ?? "?")[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, color: "#1a1614" }}>{inf.displayName ?? inf.handle}</span>
                          {inf.isVerified && <span style={{ fontSize: 10, background: "#c41e3a", color: "white", padding: "1px 6px", borderRadius: 10, fontWeight: 600 }}>{c.verifiedLabel}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>{ei.roleLabel.replace(/_/g, " ")}</div>
                      </div>
                      <Link href={`/influencers/${encodeURIComponent(inf.handle ?? "")}`} style={{ fontSize: 13, color: "#c41e3a", textDecoration: "none" }}>
                        {c.viewProfileArrow}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Add-ons */}
          {addons.length > 0 && (
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>
                {c.addOns}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {addons.map((a: any) => (
                  <div key={a.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "#1a1614" }}>{a.name}</div>
                      {a.description && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{a.description}</div>}
                      {a.requiresMembership && <div style={{ fontSize: 11, color: "#c41e3a", marginTop: 4, fontWeight: 600 }}>
                        {c.membersOnly}
                      </div>}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1614", flexShrink: 0, marginLeft: 16 }}>
                      {a.priceCents === 0 ? c.freeLabel : fmt(a.priceCents)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Event-specific menus (Task #69) */}
          <EventMenusSection seriesId={series.id} locale={safeLocale} />

          {/* Waitlist form */}
          {(series.newsletterCaptureEnabled || series.waitlistEnabled) && (
            <section style={{ background: "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)", borderRadius: 16, padding: "32px", marginBottom: 48 }}>
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 22, color: "white", fontWeight: 400, marginBottom: 8 }}>
                {c.stayInTheKnow}
              </h3>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 20 }}>
                {c.waitlistNotifyDesc}
              </p>
              <form action={`/api/v1/experiences/${slug}/waitlist`} method="POST" style={{ display: "flex", gap: 12 }}>
                <input type="text" name="_company" tabIndex={-1} autoComplete="off" defaultValue="" aria-hidden="true"
                  style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }} />
                <input type="email" name="email" placeholder="your@email.com" defaultValue={session?.user?.email ?? ""} required
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14 }} />
                <button type="submit" className="btn btn-primary">
                  {c.notifyMeBtn}
                </button>
              </form>
            </section>
          )}
        </div>

        {/* Right column — ticket selector */}
        <div style={{ position: "sticky", top: 80 }}>
          <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "28px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 4 }}>
              {c.bookYourPlace}
            </h3>
            {availability?.label && (
              <div style={{ fontSize: 12, fontWeight: 600, color: availability.remaining > 0 ? "#16a34a" : "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20 }}>
                {availability.label}
              </div>
            )}
            {ticketTypes.length === 0 ? (
              <p style={{ fontSize: 14, color: "#9ca3af" }}>
                {c.noTicketsAvailable}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                {ticketTypes.map((t: any) => (
                  <div key={t.id} style={{ border: "1px solid #e5e0d8", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, color: "#1a1614", fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontWeight: 700, color: "#c41e3a" }}>{fmt(t.priceCents)}</div>
                    </div>
                    {t.description && <div style={{ fontSize: 12, color: "#9ca3af" }}>{t.description}</div>}
                    {t.requiresMembership && <div style={{ fontSize: 11, color: "#c41e3a", fontWeight: 600, marginTop: 4 }}>
                      {c.membersOnly}
                    </div>}
                    {t.earlyAccessOnly && <div style={{ fontSize: 11, color: "#d97706", fontWeight: 600, marginTop: 4 }}>
                      {c.earlyAccessOnly}
                    </div>}
                  </div>
                ))}
              </div>
            )}
            {session ? (
              <Link href={localePath(safeLocale, `/checkout/${slug}`)} className="btn btn-primary" style={{ display: "block", textAlign: "center", width: "100%", padding: "14px" }}>
                {c.selectTickets}
              </Link>
            ) : (
              <div>
                <Link href={localePath(safeLocale, `/login?callbackUrl=/checkout/${slug}`)} className="btn btn-primary" style={{ display: "block", textAlign: "center", width: "100%", padding: "14px", marginBottom: 8 }}>
                  {c.signInToBook}
                </Link>
                <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
                  {c.signInToBookDesc}
                </p>
              </div>
            )}
          </div>

          {series.venueAddress && (
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#c41e3a", textTransform: "uppercase", marginBottom: 6 }}>
                {c.locationLabel}
              </div>
              <div style={{ fontSize: 14, color: "#1a1614" }}>{series.venueAddress}</div>
            </div>
          )}
        </div>
      </div>

      {/* Sponsor placement block */}
      {series?.id && (
        <EventPageSponsorBlock scopeType="SERIES" scopeId={series.id} />
      )}
    </div>
  );
}
