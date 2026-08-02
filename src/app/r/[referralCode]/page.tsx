"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, lazy, Suspense, useMemo } from "react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/types/i18n";
import { GuestBookingForm, type ConceptKey, type GuestBookingFormData } from "@/components/booking/GuestBookingForm";

const MenuView = lazy(() => import("@/components/menu/MenuView"));

const CONCEPT_KEYS = ["oku", "catch", "terrace"] as const;
type VenueSlug = (typeof CONCEPT_KEYS)[number];

const VENUE_LABEL: Record<VenueSlug, string> = { oku: "OKÜ", catch: "CATCH", terrace: "TERRACE" };

function venueSlugToConceptKey(slug: VenueSlug): ConceptKey {
  return slug.toUpperCase() as ConceptKey;
}

type ReferrerInfo = {
  fullName: string;
  referralCode: string;
  referrerType: string;
  organizationName: string | null;
  venueSlug: VenueSlug | null;
  isVenueScoped: boolean;
};

type TabKey = "welcome" | "reserve" | "about" | "menu";

export default function ReferralLandingPage() {
  const { referralCode } = useParams<{ referralCode: string }>();
  const t = useTranslation();
  const locale = useLocale() as Locale;

  const [referrer, setReferrer] = useState<ReferrerInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabKey>("welcome");
  const [concept, setConcept] = useState<VenueSlug>("terrace");
  const [bookedOk, setBookedOk] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/referrer/info?code=${referralCode}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) {
          setReferrer(d as ReferrerInfo);
          if (d.venueSlug && (CONCEPT_KEYS as readonly string[]).includes(d.venueSlug)) {
            setConcept(d.venueSlug);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [referralCode]);

  const isLocked = !!(referrer?.isVenueScoped && referrer?.venueSlug);
  const lockedVenue: VenueSlug | null = isLocked ? referrer!.venueSlug : null;

  const effectiveConcept: VenueSlug = useMemo(() => {
    return lockedVenue ?? concept;
  }, [lockedVenue, concept]);

  const menuVenue: VenueSlug = effectiveConcept;

  function tt(key: string, fallback: string, vars?: Record<string, string>) {
    const value = t("host", `referralLanding.${key}`, vars) as string;
    return value && !value.startsWith("referralLanding.") ? value : fallback;
  }

  async function handleBookingSubmit(data: GuestBookingFormData) {
    const conceptKey = data.conceptRequested || venueSlugToConceptKey(effectiveConcept);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptKey,
          partySize: data.partySize,
          contactName: data.guestName.trim(),
          contactEmail: data.guestEmail.trim(),
          contactPhone: data.guestWhatsapp.trim() || null,
          occasion: data.occasion || null,
          notes: data.notes || null,
          visitorType: data.visitorType || null,
          emailOptOut: data.emailOptOut,
          referralCode,
          source: "QR_SCAN",
          // Combine guest-selected date + time into one ISO datetime.
          // Falls back to "tomorrow noon" only if the picker was bypassed.
          reservationDate: (data.reservationDate && data.reservationTime)
            ? new Date(`${data.reservationDate}T${data.reservationTime}:00`).toISOString()
            : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          requestedSpaceId: data.requestedSpaceId || null,
        }),
      });
      if (res.ok) {
        setBookedOk(true);
        const body = await res.json().catch(() => ({}));
        return { ok: true, pendingApproval: body.pendingApproval ?? false };
      }
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err?.error || "Failed to submit reservation" };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Network error" };
    }
  }

  if (loading) {
    return (
      <div style={{ background: "#0e0c0b", minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>{tt("loading", "Loading…")}</div>
      </div>
    );
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: "welcome", label: tt("tabWelcome", "Welcome") },
    { key: "reserve", label: tt("tabReserve", "Reserve") },
    { key: "about",   label: tt("tabAbout",   "About") },
    { key: "menu",    label: tt("tabMenu",    "Menu") },
  ];

  const venueBlurb = (slug: VenueSlug) => tt(`venueBlurbs.${slug}`, "");
  const conceptSub = (slug: VenueSlug) => tt(`conceptSubs.${slug}`, "");

  return (
    <div style={{ background: "#0e0c0b", minHeight: "100svh", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ padding: "24px 24px 12px", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 38, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1 }}>OKÜ</div>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
          Gold House · Casco Viejo
        </div>
        {referrer && (
          <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            {tt("invitedBy", "Invited by")} <span style={{ color: "#fff", fontWeight: 700 }}>{referrer.fullName}</span>
            {referrer.organizationName && <span style={{ color: "rgba(255,255,255,0.35)" }}> · {referrer.organizationName}</span>}
          </div>
        )}
        {isLocked && lockedVenue && (
          <div style={{ marginTop: 8, display: "inline-block", padding: "4px 10px", borderRadius: 999, background: "rgba(196,30,58,0.14)", border: "1px solid rgba(196,30,58,0.35)", color: "#f1aab5", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {tt("venueScopedNotice", `Reserved for ${VENUE_LABEL[lockedVenue]}`, { venue: VENUE_LABEL[lockedVenue] })}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        background: "rgba(255,255,255,0.04)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)",
        margin: "16px 0 0",
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "14px 0",
              border: "none",
              background: activeTab === tab.key ? "rgba(255,255,255,0.1)" : "transparent",
              color: activeTab === tab.key ? "#fff" : "#6b7280",
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: 13,
              cursor: "pointer",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* WELCOME TAB */}
        {activeTab === "welcome" && (
          <div style={{ padding: "32px 24px 96px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 30, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 14 }}>
              {tt("headline", "You've been invited.")}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, maxWidth: 320, margin: "0 auto 28px" }}>
              {isLocked && lockedVenue ? venueBlurb(lockedVenue) : tt("defaultBlurb", "Three concepts under one roof. Pick the experience that fits your night.")}
            </div>

            {!isLocked && (
              <div style={{ marginBottom: 28, textAlign: "left" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{tt("chooseExperience", "Choose Experience")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {CONCEPT_KEYS.map(key => (
                    <button key={key} onClick={() => setConcept(key)} style={{
                      padding: "14px 18px", borderRadius: 12,
                      border: concept === key ? "2px solid #c41e3a" : "2px solid rgba(255,255,255,0.1)",
                      background: concept === key ? "rgba(180,35,47,0.12)" : "rgba(255,255,255,0.04)",
                      color: "#fff", cursor: "pointer", textAlign: "left",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{VENUE_LABEL[key]}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{conceptSub(key)}</div>
                      </div>
                      {concept === key && <span style={{ color: "#c41e3a", fontSize: 18 }}>●</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setActiveTab("reserve")} style={{
              background: "#c41e3a", color: "#fff", border: "none", borderRadius: 14,
              padding: "16px 36px", fontSize: 15, fontWeight: 800, cursor: "pointer", letterSpacing: "-0.01em",
              width: "100%", maxWidth: 280,
            }}>
              {tt("reserveCta", "Reserve a Table")} →
            </button>

            <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {tt("code", "Code")}: {referralCode}
            </div>
          </div>
        )}

        {/* RESERVE TAB */}
        {activeTab === "reserve" && (
          <div>
            {bookedOk ? (
              <div style={{ padding: "60px 24px", textAlign: "center" }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#1f8a55", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                  <span style={{ fontSize: 40, color: "#fff" }}>✓</span>
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, color: "#fff", letterSpacing: "-0.02em", marginBottom: 10 }}>{tt("successTitle", "You're on the list")}</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                  {tt("successBody", "We'll reach out to confirm your reservation at Gold House.")}
                </div>
                {referrer && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 14 }}>
                    {tt("referredBy", "Referred by")} {referrer.fullName}
                  </div>
                )}
                <button onClick={() => { setBookedOk(false); setActiveTab("menu"); }} style={{
                  marginTop: 26, background: "rgba(255,255,255,0.08)", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "12px 24px",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                  {tt("browseMenu", "Browse the Menu")} →
                </button>
              </div>
            ) : (
              <div style={{ padding: "20px 20px 96px" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "#fff", letterSpacing: "-0.02em", marginBottom: 4 }}>{tt("reserveTitle", "Reserve a Table")}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 18 }}>{tt("reserveSubtitle", "Gold House · Casco Viejo, Panama City")}</div>

                <GuestBookingForm
                  initialConcept={venueSlugToConceptKey(effectiveConcept)}
                  lockedConcept={isLocked && lockedVenue ? venueSlugToConceptKey(lockedVenue) : null}
                  allowAnyConcept={false}
                  onSubmit={handleBookingSubmit}
                  resetOnSuccess={false}
                  showDateTimePicker={true}
                  venueSlug="gold-house"
                />

                {referrer && (
                  <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 12 }}>
                    {tt("referredBy", "Referred by")} {referrer.fullName} · {tt("code", "Code")} {referralCode}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ABOUT TAB */}
        {activeTab === "about" && (
          <div style={{ padding: "24px 24px 96px" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "#fff", letterSpacing: "-0.02em", marginBottom: 4 }}>
              {VENUE_LABEL[menuVenue]}
            </div>
            <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 18 }}>
              Gold House · Casco Viejo
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, margin: 0 }}>
              {venueBlurb(menuVenue)}
            </p>

            <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: tt("address", "Address"),           value: "Gold House, Casco Viejo, Panama City" },
                { label: tt("reservations", "Reservations"), value: menuVenue === "oku" ? "+507 6000 0001" : menuVenue === "catch" ? "+507 6000 0002" : "+507 6000 0003" },
                { label: tt("email", "Email"),               value: menuVenue === "oku" ? "reservations@okugroup.com" : `${menuVenue}@okugroup.com` },
              ].map(item => (
                <div key={item.label} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 14, color: "#fff" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MENU TAB */}
        {activeTab === "menu" && (
          <div style={{ padding: "16px 16px 96px" }}>
            {!isLocked && (
              <div style={{ display: "flex", gap: 6, marginBottom: 12, justifyContent: "center" }}>
                {CONCEPT_KEYS.map(key => {
                  const isActive = menuVenue === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setConcept(key)}
                      style={{
                        padding: "8px 14px", borderRadius: 8,
                        border: isActive ? "1px solid rgba(196,30,58,0.5)" : "1px solid rgba(255,255,255,0.1)",
                        background: isActive ? "rgba(196,30,58,0.15)" : "rgba(255,255,255,0.04)",
                        color: isActive ? "#fff" : "rgba(255,255,255,0.55)",
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
                      }}
                    >
                      {VENUE_LABEL[key]}
                    </button>
                  );
                })}
              </div>
            )}
            <Suspense fallback={<div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{tt("loadingMenu", "Loading menu…")}</div>}>
              <MenuView venueSlug={menuVenue} locale={locale} variant="embedded" />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
