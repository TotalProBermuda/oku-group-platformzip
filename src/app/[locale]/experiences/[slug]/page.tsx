import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTranslations } from "@/i18n/getTranslations";
import { isValidLocale } from "@/i18n/config";
import { localePath } from "@/i18n/utils";
import { getSeriesContent } from "@/data/seriesTranslations";
import type { Locale } from "@/types/i18n";
import EventPageSponsorBlock from "@/components/sponsors/EventPageSponsorBlock";
import EventMenusSection from "@/components/experiences/EventMenusSection";
import ShareButtons from "@/components/ui/ShareButtons";
import ExperienceSessionsView from "@/components/experiences/ExperienceSessionsView";
import { SERIES_SOCIAL_LINK_LABELS } from "@/lib/socialLinks";
import type { Metadata } from "next";
import EventArtwork from "@/components/ui/EventArtwork";
import ExpandableText from "@/components/ui/ExpandableText";
import { seriesArtworkCandidates, sessionArtworkCandidates, type SessionArtwork, type SeriesArtwork } from "@/lib/eventArtwork";
import { sessionProductEnabled } from "@/server/commerce/sessionProducts";

const BASE = process.env.APP_BASE_URL || "http://localhost:5000";
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://okugroup.com";

type EventPageTicketPrice = { ticketTypeId: string; priceCents: number };
type EventPageSession = SessionArtwork & {
  id: string;
  title: string | null;
  subtitle?: string | null;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  soldCount: number;
  status: string;
  ticketPrices?: EventPageTicketPrice[];
  eventHosts?: Array<{ role: string; entity: { displayName: string } }>;
};
type EventPageTicketType = {
  id: string;
  name: string;
  priceCents: number;
  description?: string | null;
  requiresMembership?: boolean;
  earlyAccessOnly?: boolean;
};
type EventPageInfluencer = {
  id: string;
  roleLabel: string;
  influencer: { displayName?: string | null; handle?: string | null; isVerified: boolean };
};
type EventPageAddon = {
  id: string;
  name: string;
  description?: string | null;
  requiresMembership?: boolean;
  priceCents: number;
};
type EventPageSeries = SeriesArtwork & {
  id: string;
  slug: string;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  category?: string | null;
  socialLinksJson?: Record<string, string> | null;
  countdownLabel?: string | null;
  heroImageUrl?: string | null;
  sessionDefaults?: unknown;
  seriesHosts?: Array<{ role: string; entity: { displayName: string } }>;
  sessions?: EventPageSession[];
  ticketTypes?: EventPageTicketType[];
  experienceInfluencer?: EventPageInfluencer[];
  addons?: EventPageAddon[];
  showCountdown?: boolean;
  earlyReleaseAt?: string | null;
  venue?: string | null;
  venueAddress?: string | null;
  city?: string | null;
  newsletterCaptureEnabled?: boolean;
  waitlistEnabled?: boolean;
};

async function getSeries(slug: string, locale = "en"): Promise<EventPageSeries | null> {
  const res = await fetch(`${BASE}/api/v1/experiences?slug=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.series?.[0] ?? null;
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

interface Props { params: Promise<{ locale: string; slug: string }>; searchParams?: Promise<{ sessionId?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams ?? Promise.resolve({ sessionId: undefined })]);
  const safeLocale = isValidLocale(locale) ? (locale as Locale) : "en";
  const series = await getSeries(slug, safeLocale);
  if (!series) return {};

  const content = getSeriesContent(series.slug, safeLocale);
  const focusedSession = series.sessions?.find((session) => session.id === query.sessionId);
  const seriesTitle = series.title ?? content?.title ?? slug;
  const title = focusedSession?.title ? `${seriesTitle} — ${focusedSession.title}` : seriesTitle;
  const description = focusedSession?.subtitle || focusedSession?.description || series.description || content?.description || "";
  const imageUrl = (focusedSession ? sessionArtworkCandidates(focusedSession, safeLocale, series) : seriesArtworkCandidates(series, safeLocale))[0];
  const canonicalUrl = focusedSession
    ? `${PUBLIC_BASE}/${safeLocale}/experiences/${slug}/sessions/${encodeURIComponent(focusedSession.id)}`
    : `${PUBLIC_BASE}/${safeLocale}/experiences/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: imageUrl ? [{ url: imageUrl, width: focusedSession ? 1080 : 1200, height: focusedSession ? 1350 : 630, alt: title }] : [],
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

export default async function ExperienceDetailPage({ params, searchParams }: Props) {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams ?? Promise.resolve({ sessionId: undefined })]);
  const safeLocale = isValidLocale(locale) ? (locale as Locale) : "en";

  const [series, availability, session, translations] = await Promise.all([
    getSeries(slug, safeLocale),
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
      { hour: "numeric", minute: "2-digit", timeZone: "America/Panama" }
    );

  const influencers = series.experienceInfluencer ?? [];
  const addons      = series.addons ?? [];
  const sessions    = series.sessions ?? [];
  const ticketTypes = series.ticketTypes ?? [];
  const firstSession = sessions[0];
  const focusSessionId = sessions.some((event) => event.id === query.sessionId) ? query.sessionId ?? null : null;
  const focusSession = focusSessionId ? sessions.find((event: any) => event.id === focusSessionId) : null;
  if (query.sessionId && !focusSession) notFound();
  const heroArtwork = focusSession ? sessionArtworkCandidates(focusSession, safeLocale, series) : seriesArtworkCandidates(series, safeLocale);
  const displayedTicketTypes = focusSession
    ? ticketTypes.filter((ticket) => sessionProductEnabled(focusSession, series, ticket.id))
    : ticketTypes;
  const pricingSessions = focusSession ? [focusSession] : sessions;
  const isCountdownActive = series.showCountdown && series.earlyReleaseAt && new Date() < new Date(series.earlyReleaseAt);

  const content = getSeriesContent(series.slug, safeLocale);
  const title = series.title ?? content?.title ?? slug;
  const description = series.description ?? content?.description;
  const displayDescription = focusSession?.description || description;

  const pageUrl = focusSession
    ? `${PUBLIC_BASE}/${safeLocale}/experiences/${slug}/sessions/${encodeURIComponent(focusSession.id)}`
    : `${PUBLIC_BASE}/${safeLocale}/experiences/${slug}`;
  const locationStr = [series.venue, series.venueAddress, series.city].filter(Boolean).join(", ");

  return (
    <div>
      <style>{`
        @media (max-width: 767px) {
          .experience-focus-poster { position: relative !important; inset: auto !important; width: min(240px, 66vw) !important; height: 300px !important; margin: 0 auto 20px; }
          .experience-focus-copy { max-width: 100% !important; }
          .experience-hero { padding-top: 32px !important; padding-bottom: 36px !important; }
        }
      `}</style>
      {/* Hero */}
      <div className="experience-hero" style={{ background: venueGrad[series.venue] ?? venueGrad.OKU, padding: "72px 0 56px", position: "relative", overflow: "hidden", minHeight: heroArtwork.length ? 420 : undefined }}>
        {heroArtwork.length > 0 && !focusSession && (
          <EventArtwork candidates={heroArtwork} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: heroArtwork.length ? "linear-gradient(to bottom, rgba(26,22,20,0.55) 0%, rgba(26,22,20,0.78) 100%)" : "radial-gradient(ellipse at 60% 50%, rgba(196,30,58,0.08) 0%, transparent 70%)" }} />
        <div className="page-container" style={{ position: "relative", zIndex: 1 }}>
          {focusSession && heroArtwork.length > 0 ? <div className="experience-focus-poster" style={{ position: "absolute", right: 24, top: 0, bottom: 0, width: "min(300px, 28vw)", display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 16px 28px rgba(0,0,0,.35))" }}><EventArtwork candidates={heroArtwork} alt={`${title} — ${focusSession.title ?? "event"}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div> : null}
          <div className="experience-focus-copy" style={{ maxWidth: focusSession && heroArtwork.length ? "calc(100% - min(340px, 30vw))" : undefined }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {series.venue && <span className={`badge ${series.venue === "CATCH" ? "venue-badge-catch" : "venue-badge-oku"}`}>{series.venue}</span>}
            {series.category && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#f9a8d4", textTransform: "uppercase" }}>{series.category}</span>}
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 5vw, 60px)", fontWeight: 400, color: "white", letterSpacing: "-0.02em", margin: "0 0 12px", lineHeight: 1.1 }}>{title}</h1>
          {focusSession?.title ? <p style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(23px, 3vw, 34px)", color: "white", margin: "0 0 10px", lineHeight: 1.2 }}>{safeLocale === "es" ? "Presenta" : safeLocale === "pt" ? "Apresenta" : "Presents"} {focusSession.title}</p> : null}
          {(focusSession?.subtitle || series.subtitle || content?.subtitle) && <p style={{ fontSize: 18, color: "rgba(255,255,255,0.78)", margin: "0 0 24px", maxWidth: 720 }}>{focusSession?.subtitle || series.subtitle || content?.subtitle}</p>}
          <div className="experience-hero-meta" style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
            {series.city && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>📍 {series.city}{series.venueAddress ? ` — ${series.venueAddress}` : ""}</span>}
            {(focusSession ?? firstSession) && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.78)" }}>📅 {fmtDate((focusSession ?? firstSession).startsAt)}{focusSession ? ` · ${fmtTime(focusSession.startsAt)}–${fmtTime(focusSession.endsAt)}` : ""}</span>}
          </div>
          {/* Social sharing in hero */}
          <ShareButtons
            url={pageUrl}
            title={title}
            imageUrl={heroArtwork[0]}
            labels={{
              shareHeading: c.shareHeading,
              copyLink: c.shareCopyLink,
              copied: c.shareCopied,
              whatsApp: c.shareWhatsApp,
              instagram: c.shareInstagram,
            }}
          />
          {series.socialLinksJson && typeof series.socialLinksJson === "object" && Object.keys(series.socialLinksJson).length > 0 ? (
            <nav aria-label="Series social links" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
              {Object.entries(series.socialLinksJson as Record<string, unknown>).map(([key, value]) => {
                if (typeof value !== "string" || !/^https:\/\//i.test(value)) return null;
                const label = SERIES_SOCIAL_LINK_LABELS[key as keyof typeof SERIES_SOCIAL_LINK_LABELS];
                if (!label) return null;
                return <a key={key} href={value} target="_blank" rel="noopener noreferrer" style={{ border: "1px solid rgba(255,255,255,.35)", borderRadius: 999, color: "white", fontSize: 12, padding: "7px 11px", textDecoration: "none" }}>{label}</a>;
              })}
            </nav>
          ) : null}
          </div>
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

      <div className="page-container experience-layout" style={{ padding: "48px 24px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 48, alignItems: "start" }}>
        {/* Left column */}
        <div className="experience-main">
          {/* Keep the series overview on the series page; the selected event has its
              own description in the event detail card below. */}
          {!focusSession && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 400, color: "#1a1614", marginBottom: 10 }}>
                {c.aboutThisExperience}
              </h2>
              {displayDescription ? <ExpandableText text={displayDescription} locale={safeLocale} maxLines={3} /> : null}
            </section>
          )}

          {/* Sessions */}
          {sessions.length > 0 && (
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 400, color: "#1a1614", marginBottom: 16 }}>
                {focusSession ? (safeLocale === "es" ? "Detalles del evento" : safeLocale === "pt" ? "Detalhes do evento" : "Event details") : c.sessionsHeading}
              </h2>
              <div id="sessions">
              <ExperienceSessionsView
                sessions={focusSession ? [focusSession] : sessions}
                ticketTypes={displayedTicketTypes}
                seriesTitle={title}
                seriesDescription={description ?? ""}
                seriesImage={series.heroImageUrl}
                seriesArtwork={series}
                seriesSessionDefaults={series.sessionDefaults}
                seriesHosts={series.seriesHosts ?? []}
                focusSessionId={focusSessionId}
                checkoutHrefBase={localePath(safeLocale, `/checkout/${slug}`)}
                eventHrefBase={localePath(safeLocale, `/experiences/${slug}`)}
                venue={locationStr}
                locale={safeLocale}
                labels={{
                  left: c.left, addToCalendar: c.addToCalendar, calGoogleCalendar: c.calGoogleCalendar,
                  calAppleIcal: c.calAppleIcal, calOutlook: c.calOutlook, calYahoo: c.calYahoo,
                  selectTickets: c.selectTickets, sessionView: c.sessionViewOptions, listView: c.sessionListView, calendarView: c.sessionCalendarView,
                  from: c.sessionFromPrice,
                  viewEvent: c.viewEventLink ?? (safeLocale === "es" ? "Ver evento" : safeLocale === "pt" ? "Ver evento" : "View event"),
                  coHostedBy: c.sessionCoHostedBy,
                  previousMonth: c.calendarPrev, nextMonth: c.calendarNext, event: c.sessionEvent, events: c.sessionEventCount,
                  chooseDate: c.calendarSelectDay, noSessions: c.noSessionsYet,
                }}
              />
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
                {influencers.map((ei) => {
                  const inf = ei.influencer;
                  return (
                    <div key={ei.id} className="experience-host" style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "20px 24px", display: "flex", gap: 20, alignItems: "center" }}>
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
                {addons.map((a) => (
                  <div key={a.id} className="experience-addon" style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            <section className="experience-waitlist" style={{ background: "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)", borderRadius: 16, padding: "32px", marginBottom: 48 }}>
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 22, color: "white", fontWeight: 400, marginBottom: 8 }}>
                {c.stayInTheKnow}
              </h3>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 20 }}>
                {c.waitlistNotifyDesc}
              </p>
              <form className="experience-waitlist-form" action={`/api/v1/experiences/${slug}/waitlist`} method="POST" style={{ display: "flex", gap: 12 }}>
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
        <div className="experience-booking-sidebar" style={{ position: "sticky", top: 80 }}>
          <div className="experience-booking-card" style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "28px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 4 }}>
              {c.bookYourPlace}
            </h3>
            {focusSession ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: focusSession.capacity - focusSession.soldCount > 0 ? "#16a34a" : "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20 }}>
                {Math.max(0, focusSession.capacity - focusSession.soldCount)} {c.left}
              </div>
            ) : availability?.label ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: availability.remaining > 0 ? "#16a34a" : "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20 }}>
                {availability.label}
              </div>
            ) : null}
            {displayedTicketTypes.length === 0 ? (
              <p style={{ fontSize: 14, color: "#9ca3af" }}>
                {c.noTicketsAvailable}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                {displayedTicketTypes.map((t) => (
                  <div key={t.id} className="experience-ticket-type" style={{ border: "1px solid #e5e0d8", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, color: "#1a1614", fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontWeight: 700, color: "#c41e3a" }}>{pricingSessions.some((eventSession) => eventSession.ticketPrices?.some((price) => price.ticketTypeId === t.id && price.priceCents !== t.priceCents)) ? `${c.from ?? "From"} ` : ""}{fmt(pricingSessions.reduce((lowest: number, eventSession) => {
                        const override = eventSession.ticketPrices?.find((price: { ticketTypeId: string; priceCents: number }) => price.ticketTypeId === t.id)?.priceCents;
                        return Math.min(lowest, override ?? t.priceCents);
                      }, t.priceCents))}</div>
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
            <div>
              {sessions.length > 0 ? (
                <Link href={focusSessionId ? `${localePath(safeLocale, `/checkout/${slug}`)}?sessionId=${encodeURIComponent(focusSessionId)}` : "#sessions"} className="btn btn-primary" style={{ display: "block", textAlign: "center", width: "100%", padding: "14px" }}>{c.selectTickets}</Link>
              ) : (
                <span className="btn btn-ghost" aria-disabled="true" style={{ display: "block", textAlign: "center", width: "100%", padding: "14px" }}>{c.noSessions ?? "No upcoming sessions"}</span>
              )}
              <p style={{ fontSize: 12, color: "#6b7280", textAlign: "center", marginTop: 8 }}>Continue as a guest. We’ll email your booking confirmation after payment.</p>
            </div>
          </div>

          {series.venueAddress && (
            <div className="experience-location-card" style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#c41e3a", textTransform: "uppercase", marginBottom: 6 }}>
                {c.locationLabel}
              </div>
              <div style={{ fontSize: 14, color: "#1a1614" }}>{series.venueAddress}</div>
            </div>
          )}
        </div>
      </div>

      {/* Resolve the correct sponsor scope: a selected date may have its own
          sponsors (and may inherit series sponsors) independently. */}
      {series?.id && (
        <EventPageSponsorBlock
          scopeType={focusSession ? "EVENT" : "SERIES"}
          scopeId={focusSession?.id ?? series.id}
        />
      )}
    </div>
  );
}
