"use client";

import { useState, useEffect } from "react";
import { HoneypotField } from "@/components/HoneypotField";

type Zone = { id: string; name: string; conceptKey: string; zoneType: string; description?: string | null; capacityCovers: number };
type Step = "concept" | "details" | "addons" | "contact" | "review" | "confirmed";

export type WizardT = Record<string, string>;

const ZONE_VISUALS: Record<string, { logo: string; logoNeedsCard: boolean; accent: string }> = {
  oku:     { logo: "/images/logo-oku-white-mark.png", logoNeedsCard: false, accent: "#1a1614" },
  catch:   { logo: "/images/logo-catch.webp",         logoNeedsCard: false, accent: "#1e3a5f" },
  terrace: { logo: "/images/logo-terrace-cream.png",  logoNeedsCard: false, accent: "#2d4a1e" },
  vip:     { logo: "/images/logo-vip-door.svg",       logoNeedsCard: false, accent: "#4a1e1e" },
};

function ZoneCard({ zone, selected, onSelect, t }: { zone: Zone; selected: boolean; onSelect: () => void; t: WizardT }) {
  const vis = ZONE_VISUALS[zone.conceptKey] ?? { logo: "", logoNeedsCard: false, accent: "#222" };
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: "100%", textAlign: "left",
        background: selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
        border: `2px solid ${selected ? "#fff" : "rgba(255,255,255,0.12)"}`,
        borderRadius: 16, padding: "20px 22px", cursor: "pointer",
        transition: "all 0.2s", color: "#fff", display: "flex", gap: 16, alignItems: "center",
      }}
    >
      <div style={{ flexShrink: 0, width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {vis.logo ? (
          vis.logoNeedsCard ? (
            <div style={{ background: "rgba(255,255,255,0.95)", borderRadius: 10, padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={vis.logo} alt={zone.name} style={{ height: 36, width: "auto", objectFit: "contain", display: "block" }} />
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={vis.logo} alt={zone.name} style={{ height: 52, width: "auto", objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }} />
          )
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "rgba(255,255,255,0.7)" }}>✦</div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 3 }}>{zone.name}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>{t[`zone${capitalize(zone.conceptKey)}Tagline`]}</div>
        <div style={{ fontSize: 11, marginTop: 8, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {t.upTo} {zone.capacityCovers} {t.covers}
        </div>
      </div>
      {selected && <div style={{ marginLeft: "auto", color: "#fff", fontSize: 20, flexShrink: 0 }}>✓</div>}
    </button>
  );
}

function WizardInput({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 7 }}>
        {label}{required && " *"}
      </label>
      {children}
      {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.15)",
  borderRadius: 10, padding: "13px 16px", fontSize: 15, color: "#fff", outline: "none", boxSizing: "border-box",
};

const STEPS: Step[] = ["concept", "details", "addons", "contact", "review", "confirmed"];

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

interface Props { t: WizardT; locale?: string }

export default function ReservationWizard({ t, locale = "en" }: Props) {
  const [step, setStep]                       = useState<Step>("concept");
  const [selectedConcept, setSelectedConcept] = useState("");
  const [date, setDate]                       = useState("");
  const [time, setTime]                       = useState("19:00");
  const [partySize, setPartySize]             = useState(2);
  const [occasion, setOccasion]               = useState("");
  const [seatingPref, setSeatingPref]         = useState("");
  const [notes, setNotes]                     = useState("");
  const [addons, setAddons]                   = useState<string[]>([]);
  const [company, setCompany]                 = useState("");
  const [contactName, setContactName]         = useState("");
  const [contactEmail, setContactEmail]       = useState("");
  const [contactPhone, setContactPhone]       = useState("");
  const [referralCode, setReferralCode]       = useState("");
  // Referrer captured from the URL (?ref=CARLOS01). When present we replace
  // the manual entry with a read-only "Referred by" pill — diners shouldn't
  // have to copy or remember a code that originated from the link they
  // already clicked, and any manual typo silently breaks commission
  // attribution downstream.
  const [referrerInfo, setReferrerInfo] = useState<{
    fullName: string;
    referralCode: string;
    referrerType: string;
    organizationName: string | null;
  } | null>(null);
  const [referrerLoading, setReferrerLoading] = useState(false);
  const [errors, setErrors]                   = useState<Record<string, string>>({});
  const [submitting, setSubmitting]           = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");

  const stepIdx = STEPS.indexOf(step);

  // Auto-capture referrer from URL query string. Supports both ?ref= and
  // ?referrer= for compatibility with older shared links. We intentionally
  // read window.location directly (instead of useSearchParams) to avoid
  // forcing every host page to wrap us in a Suspense boundary.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    // Pre-fill date from ?date= param (set by streetside host QR panel).
    const dateParam = params.get("date") ?? "";
    if (dateParam) {
      // Strict YYYY-MM-DD validation:
      //   1. Must match the regex exactly (no partial strings or ISO timestamps).
      //   2. Must round-trip through Date — catches month=13, day=32, etc. that
      //      some engines silently normalise into an adjacent valid date.
      //   3. Must not be in the past — stale QR links (e.g. printed yesterday)
      //      should not lock the guest into a past date.
      const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      if (ISO_DATE_RE.test(dateParam)) {
        const [y, m, d] = dateParam.split("-").map(Number);
        const parsed = new Date(y, m - 1, d); // local time, no UTC shift
        const roundTrips =
          parsed.getFullYear() === y &&
          parsed.getMonth() === m - 1 &&
          parsed.getDate() === d;
        if (roundTrips) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (parsed >= today) {
            setDate(dateParam);
          }
        }
      }
    }

    const codeRaw = params.get("ref") ?? params.get("referrer") ?? "";
    const code = codeRaw.trim().toUpperCase();
    if (!code) return;
    if (code === "STREETSIDE") {
      // Legacy sentinel from before streetside hosts had personal codes.
      // We can't resolve it to a real actor, but we MUST surface it —
      // silently dropping it means the booking commits with no
      // attribution and the host sees an empty Active tab. Best the
      // wizard can do client-side is leave a console breadcrumb so any
      // diagnostic capture (Sentry/etc.) catches the stale link.
      // eslint-disable-next-line no-console
      console.warn(
        "[ReservationWizard] Ignoring legacy ?ref=streetside sentinel — " +
          "this URL was generated before streetside hosts had personal " +
          "codes; the booking will submit without referrer attribution. " +
          "Re-share the QR from the host's streetside dashboard."
      );
      return;
    }
    setReferralCode(code);
    setReferrerLoading(true);
    fetch(`/api/v1/referrer/info?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (info && info.fullName) {
          setReferrerInfo({
            fullName: info.fullName,
            referralCode: info.referralCode,
            referrerType: info.referrerType,
            organizationName: info.organizationName ?? null,
          });
        }
      })
      .catch(() => {/* fall through — code still submits with the booking */})
      .finally(() => setReferrerLoading(false));
  }, []);

  const STEP_LABELS = [t.stepExperience, t.stepDetails, t.stepExtras, t.stepContact, t.stepReview, t.stepDone];

  const zones: Zone[] = [
    { id: "oku",     name: t.zoneOkuName,     conceptKey: "oku",     zoneType: "FINE_DINING", description: null, capacityCovers: 27 },
    { id: "catch",   name: t.zoneCatchName,   conceptKey: "catch",   zoneType: "NIGHTLIFE",   description: null, capacityCovers: 24 },
    { id: "terrace", name: t.zoneTerraceName, conceptKey: "terrace", zoneType: "TERRACE",     description: null, capacityCovers: 42 },
    { id: "vip",     name: t.zoneVipName,     conceptKey: "vip",     zoneType: "PRIVATE",     description: null, capacityCovers: 10 },
  ];

  const OCCASIONS = [
    t.occasionAnniversary, t.occasionBirthday, t.occasionCorporate,
    t.occasionProposal, t.occasionDateNight, t.occasionFriends, t.occasionOther,
  ];
  const SEATING_PREFS = [
    t.seatingTerrace, t.seatingWindow, t.seatingBooth,
    t.seatingBarSide, t.seatingPrivate, t.seatingNoPreference,
  ];
  const ADDON_OPTIONS = [
    { key: "CORKAGE",              label: t.addonBottle,       sub: t.addonBottleSub,       icon: "🍾" },
    { key: "CELEBRATION_DESSERT", label: t.addonDessert,      sub: t.addonDessertSub,      icon: "🎂" },
    { key: "ROMANTIC_SETUP",      label: t.addonRomantic,     sub: t.addonRomanticSub,     icon: "🌹" },
    { key: "ACCESSIBILITY",       label: t.addonAccessibility, sub: t.addonAccessibilitySub, icon: "♿" },
  ];

  // Kitchen seats from 11:00 AM to 10:30 PM. Late-night sushi take-out and
  // bar tables are handled off-form (see helper hint under the time field).
  const times = [
    "11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30",
    "15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30",
    "19:00","19:30","20:00","20:30","21:00","21:30","22:00","22:30",
  ];

  function toggleAddon(key: string) {
    setAddons(prev => prev.includes(key) ? prev.filter(a => a !== key) : [...prev, key]);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (step === "concept" && !selectedConcept) e.concept = t.errorSelectExperience;
    if (step === "details") {
      if (!date) e.date = t.errorSelectDate;
      if (partySize < 1 || partySize > 50) e.partySize = t.errorPartySize;
    }
    if (step === "contact") {
      if (!contactName.trim()) e.contactName = t.errorNameRequired;
      if (!contactEmail.trim() || !contactEmail.includes("@")) e.contactEmail = t.errorEmailRequired;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() { if (!validate()) return; const idx = STEPS.indexOf(step); if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]); }
  function back() { const idx = STEPS.indexOf(step); if (idx > 0) setStep(STEPS[idx - 1]); }

  async function submit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const dateTime = new Date(`${date}T${time}:00`);
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptKey: selectedConcept, reservationDate: dateTime.toISOString(), partySize, occasion, seatingPreference: seatingPref, notes, addons, contactName, contactEmail, contactPhone, referralCode, _company: company }),
      });
      const data = await res.json();
      if (data.confirmationCode) { setConfirmationCode(data.confirmationCode); setStep("confirmed"); }
      else setErrors({ submit: data.error || t.errorSomethingWrong });
    } catch { setErrors({ submit: t.errorNetwork }); }
    finally { setSubmitting(false); }
  }

  const fmtDate = (d: string, tm: string) =>
    new Date(`${d}T${tm}`).toLocaleDateString(
      locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US",
      { weekday: "long", month: "long", day: "numeric" }
    );

  const panelStyle: React.CSSProperties = { maxWidth: 560, margin: "0 auto", padding: "0 20px 40px" };

  if (step === "confirmed") {
    return (
      <div style={panelStyle}>
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>✓</div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 300, marginBottom: 12, color: "#fff" }}>
            {t.onTheBooks}
          </h2>
          <p style={{ color: "rgba(255,255,255,0.55)", marginBottom: 24 }}>
            {t.confirmationSent} {contactEmail}.
          </p>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "20px 28px", display: "inline-block", marginBottom: 32 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{t.confirmationCode}</div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "0.12em" }}>{confirmationCode}</div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14 }}>{t.presentOnArrival}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <HoneypotField value={company} onChange={setCompany} />
      {/* Progress */}
      <div style={{ display: "flex", gap: 4, marginBottom: 36, justifyContent: "center" }}>
        {STEPS.slice(0, -1).map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: i < stepIdx ? "rgba(255,255,255,0.9)" : i === stepIdx ? "#c41e3a" : "rgba(255,255,255,0.12)",
              color: i < stepIdx ? "#0c0a08" : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, transition: "all 0.2s",
            }}>
              {i < stepIdx ? "✓" : i + 1}
            </div>
            {i < STEPS.length - 2 && (
              <div style={{ width: 24, height: 1, background: i < stepIdx ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.12)" }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 28 }}>
        {t.stepLabel} {stepIdx + 1} — {STEP_LABELS[stepIdx]}
      </div>

      {/* Step: Concept */}
      {step === "concept" && (
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 300, marginBottom: 20, textAlign: "center", color: "#fff" }}>
            {t.chooseExperience}
          </h2>
          {errors.concept && <div style={{ color: "#f87171", textAlign: "center", marginBottom: 12, fontSize: 13 }}>{errors.concept}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {zones.map(z => (
              <ZoneCard key={z.id} zone={z} selected={selectedConcept === z.conceptKey} onSelect={() => setSelectedConcept(z.conceptKey)} t={t} />
            ))}
          </div>
          <button type="button" onClick={next} style={{ width: "100%", marginTop: 24, padding: "16px", background: "#c41e3a", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
            {t.continue}
          </button>
        </div>
      )}

      {/* Step: Details */}
      {step === "details" && (
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 300, marginBottom: 20, textAlign: "center", color: "#fff" }}>
            {t.reservationDetails}
          </h2>
          <WizardInput label={t.date} required error={errors.date}>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              style={{
                ...inputStyle,
                // iOS Safari renders <input type="date"> with native chrome that
                // ignores text-align and can grow wider than its container —
                // these resets keep the field flush inside the form on mobile.
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                minWidth: 0,
                maxWidth: "100%",
                textAlign: "left",
                display: "block",
              }}
            />
          </WizardInput>
          <WizardInput label={t.time} required>
            <select value={time} onChange={e => setTime(e.target.value)} style={inputStyle}>
              {times.map(tm => <option key={tm} value={tm}>{tm}</option>)}
            </select>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8, lineHeight: 1.5 }}>
              {t.timeSlotsHint}
            </p>
          </WizardInput>
          <WizardInput label={t.partySize} required error={errors.partySize}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button type="button" onClick={() => setPartySize(p => Math.max(1, p - 1))} style={{ width: 40, height: 40, borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", fontSize: 20, cursor: "pointer" }}>−</button>
              <span style={{ fontSize: 24, fontWeight: 700, minWidth: 32, textAlign: "center" }}>{partySize}</span>
              <button type="button" onClick={() => setPartySize(p => Math.min(50, p + 1))} style={{ width: 40, height: 40, borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", fontSize: 20, cursor: "pointer" }}>+</button>
            </div>
          </WizardInput>
          <WizardInput label={t.occasion}>
            <select value={occasion} onChange={e => setOccasion(e.target.value)} style={inputStyle}>
              <option value="">{t.noSpecialOccasion}</option>
              {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </WizardInput>
          <WizardInput label={t.seatingPreference}>
            <select value={seatingPref} onChange={e => setSeatingPref(e.target.value)} style={inputStyle}>
              <option value="">{t.noPreference}</option>
              {SEATING_PREFS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </WizardInput>
          <WizardInput label={t.specialNotes}>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t.notesPlaceholder} rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
          </WizardInput>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" onClick={back} style={{ flex: 1, padding: "14px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 15, cursor: "pointer" }}>{t.back}</button>
            <button type="button" onClick={next} style={{ flex: 2, padding: "14px", background: "#c41e3a", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{t.continue}</button>
          </div>
        </div>
      )}

      {/* Step: Addons */}
      {step === "addons" && (
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 300, marginBottom: 8, textAlign: "center", color: "#fff" }}>{t.addExtras}</h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 24 }}>{t.extrasSubtitle}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ADDON_OPTIONS.map(a => (
              <button key={a.key} type="button" onClick={() => toggleAddon(a.key)} style={{
                textAlign: "left", padding: "16px 20px", borderRadius: 12,
                background: addons.includes(a.key) ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                border: `2px solid ${addons.includes(a.key) ? "#fff" : "rgba(255,255,255,0.1)"}`,
                cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 14, transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 24 }}>{a.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.label}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{a.sub}</div>
                </div>
                {addons.includes(a.key) && <span style={{ marginLeft: "auto", fontSize: 18 }}>✓</span>}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button type="button" onClick={back} style={{ flex: 1, padding: "14px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 15, cursor: "pointer" }}>{t.back}</button>
            <button type="button" onClick={next} style={{ flex: 2, padding: "14px", background: "#c41e3a", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{t.continue}</button>
          </div>
        </div>
      )}

      {/* Step: Contact */}
      {step === "contact" && (
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 300, marginBottom: 20, textAlign: "center", color: "#fff" }}>{t.yourDetails}</h2>
          <WizardInput label={t.fullName} required error={errors.contactName}>
            <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jane Doe" style={inputStyle} />
          </WizardInput>
          <WizardInput label={t.email} required error={errors.contactEmail}>
            <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="you@email.com" style={inputStyle} />
          </WizardInput>
          <WizardInput label={t.phoneWhatsApp}>
            <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+507 6000-0000" style={inputStyle} />
          </WizardInput>
          {/* Referrer attribution — auto-captured from ?ref= in the URL.
              No manual code entry: if the diner arrived via a referrer link,
              we display a read-only confirmation pill; if they arrived
              directly, we don't show this section at all. */}
          {referrerInfo && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 7 }}>
                {t.referredBy}
              </label>
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: "rgba(200,169,110,0.08)",
                  border: "1.5px solid rgba(200,169,110,0.35)",
                  borderRadius: 10, padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "rgba(200,169,110,0.18)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 16, color: "#c8a96e", fontWeight: 700,
                  }}
                  aria-hidden="true"
                >
                  {referrerInfo.fullName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
                    {referrerInfo.fullName}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                    {referrerInfo.organizationName ? `${referrerInfo.organizationName} · ` : ""}
                    {t.referralCodeLabel}: {referrerInfo.referralCode}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "rgba(200,169,110,0.85)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {t.autoApplied}
                </span>
              </div>
            </div>
          )}
          {referrerLoading && (
            <div style={{ marginBottom: 20, fontSize: 12, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
              {t.referredByLoading}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" onClick={back} style={{ flex: 1, padding: "14px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 15, cursor: "pointer" }}>{t.back}</button>
            <button type="button" onClick={next} style={{ flex: 2, padding: "14px", background: "#c41e3a", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{t.review}</button>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 300, marginBottom: 24, textAlign: "center", color: "#fff" }}>{t.reviewConfirm}</h2>
          {[
            { label: t.labelExperience,  value: zones.find(z => z.conceptKey === selectedConcept)?.name ?? selectedConcept },
            { label: t.labelDateAndTime, value: date && time ? `${fmtDate(date, time)} ${time}` : "—" },
            { label: t.labelPartySize,   value: `${partySize} ${partySize === 1 ? t.guest : t.guestsPlural}` },
            { label: t.labelOccasion,    value: occasion || t.none },
            { label: t.labelName,        value: contactName },
            { label: t.labelEmail,       value: contactEmail },
            { label: t.labelPhone,       value: contactPhone || "—" },
            { label: t.labelExtras,      value: addons.length ? addons.map(a => ADDON_OPTIONS.find(o => o.key === a)?.label ?? a).join(", ") : t.none },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{row.label}</span>
              <span style={{ fontSize: 14, fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>{row.value}</span>
            </div>
          ))}
          {errors.submit && <div style={{ color: "#f87171", textAlign: "center", marginTop: 16, fontSize: 13 }}>{errors.submit}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button type="button" onClick={back} style={{ flex: 1, padding: "14px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 15, cursor: "pointer" }}>{t.back}</button>
            <button type="button" onClick={submit} disabled={submitting} style={{ flex: 2, padding: "14px", background: submitting ? "rgba(180,35,47,0.5)" : "#c41e3a", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: submitting ? "wait" : "pointer", letterSpacing: "0.05em" }}>
              {submitting ? t.submittingLabel : t.confirmReservation}
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 16 }}>
            {t.noShowPolicy}
          </p>
        </div>
      )}
    </div>
  );
}
