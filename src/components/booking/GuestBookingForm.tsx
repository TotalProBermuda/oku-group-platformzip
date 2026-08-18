"use client";

import { useState, useEffect } from "react";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

export type ConceptKey = "OKU" | "CATCH" | "TERRACE" | "";
export type VisitorType = "Resident" | "Frequent Panama Visitor" | "Visitor" | "";

export type GuestBookingFormData = {
  guestName: string;
  guestEmail: string;
  guestWhatsapp: string;
  visitorType: VisitorType;
  emailOptOut: boolean;
  partySize: number;
  conceptRequested: ConceptKey;
  occasion: string;
  notes: string;
  /** YYYY-MM-DD — populated when showDateTimePicker=true, "" otherwise. */
  reservationDate: string;
  /** HH:MM (24-hour) — populated when showDateTimePicker=true, "" otherwise. */
  reservationTime: string;
  /** RestaurantSpace.id — "" means no preference. */
  requestedSpaceId: string;
};

type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  available: number;
  isAvailable: boolean;
  requiresApproval: boolean;
  weatherSensitive: boolean;
  conceptKey: string;
  eventConflict: null | { kind: "PUBLIC_EVENT" | "PRIVATE_BLOCK"; title?: string; imageUrl?: string | null; href?: string; message: string };
};

type Props = {
  initialConcept?: ConceptKey;
  lockedConcept?: ConceptKey | null;
  allowAnyConcept?: boolean;
  onSubmit: (data: GuestBookingFormData) => Promise<{ ok: boolean; error?: string; pendingApproval?: boolean } | void>;
  submitButtonLabel?: string;
  sendingButtonLabel?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  /** When true, renders date/time/space picker above the guest info fields. */
  showDateTimePicker?: boolean;
  /** Venue slug passed to the availability API. Default: "gold-house". */
  venueSlug?: string;
};

/** Dinner service slots — 6 pm to 10 pm, every 30 minutes. */
const SERVICE_SLOTS = [
  "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00",
] as const;

/** Convert "HH:MM" to a human-readable 12-hour label like "7:30pm". */
function fmtSlot(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}${m === 0 ? "" : `:${String(m).padStart(2, "0")}`}${ampm}`;
}

const CONCEPTS: { key: ConceptKey; label: string; color: string }[] = [
  { key: "OKU",     label: "OKÜ",     color: "#c8a96e" },
  { key: "CATCH",   label: "CATCH",   color: "#38bdf8" },
  { key: "TERRACE", label: "TERRACE", color: "#4ade80" },
  { key: "",        label: "Any",     color: "#6b7280" },
];

const PERSONAL_OCCASIONS: { key: string; tKey: string }[] = [
  { key: "Birthday",    tKey: "streetForm.occasions.birthday" },
  { key: "Anniversary", tKey: "streetForm.occasions.anniversary" },
  { key: "Business",    tKey: "streetForm.occasions.business" },
  { key: "Date night",  tKey: "streetForm.occasions.dateNight" },
  { key: "Celebration", tKey: "streetForm.occasions.celebration" },
];

const PANAMA_HOLIDAYS: { key: string; tKey: string }[] = [
  { key: "New Year's Day",             tKey: "streetForm.holidays.newYearsDay" },
  { key: "Martyrs' Day",               tKey: "streetForm.holidays.martyrsDay" },
  { key: "Carnival Tuesday",           tKey: "streetForm.holidays.carnivalTuesday" },
  { key: "Good Friday",                tKey: "streetForm.holidays.goodFriday" },
  { key: "Labor Day",                  tKey: "streetForm.holidays.laborDay" },
  { key: "All Souls' Day",             tKey: "streetForm.holidays.allSoulsDay" },
  { key: "Separation from Colombia",   tKey: "streetForm.holidays.separationFromColombia" },
  { key: "Flag Day",                   tKey: "streetForm.holidays.flagDay" },
  { key: "First Call of Independence", tKey: "streetForm.holidays.firstCallOfIndependence" },
  { key: "First Cry of Independence",  tKey: "streetForm.holidays.firstCryOfIndependence" },
  { key: "Independence from Spain",    tKey: "streetForm.holidays.independenceFromSpain" },
  { key: "Immaculate Conception",      tKey: "streetForm.holidays.immaculateConception" },
  { key: "Christmas Day",              tKey: "streetForm.holidays.christmasDay" },
];

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: 18,
      ...style,
    }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  fontSize: 14,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

function makeEmptyForm(initialConcept: ConceptKey, lockedConcept: ConceptKey | null) {
  return {
    guestName: "",
    guestEmail: "",
    guestWhatsapp: "",
    visitorType: "" as VisitorType,
    emailOptOut: false,
    partySize: 2,
    customPartySize: "",
    conceptRequested: (lockedConcept ?? initialConcept) as ConceptKey,
    occasion: "",
    notes: "",
    reservationDate: "",
    reservationTime: "",
    requestedSpaceId: "",
  };
}

export function GuestBookingForm({
  initialConcept = "",
  lockedConcept = null,
  allowAnyConcept = true,
  onSubmit,
  submitButtonLabel,
  sendingButtonLabel,
  successMessage,
  resetOnSuccess = true,
  showDateTimePicker = false,
  venueSlug = "gold-house",
}: Props) {
  const t = useTranslation();
  const locale = useLocale();

  const [form, setForm] = useState<GuestBookingFormData & { customPartySize: string }>(
    makeEmptyForm(initialConcept, lockedConcept)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Space availability — only active when showDateTimePicker=true
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spacesError, setSpacesError] = useState("");
  const [eventDetails, setEventDetails] = useState<SpaceOption["eventConflict"]>(null);

  // Today's ISO date string for the date picker min attribute
  const minDate = typeof window !== "undefined"
    ? new Date().toISOString().split("T")[0]
    : "";

  // Re-fetch available spaces whenever date, time, or partySize changes
  useEffect(() => {
    if (!showDateTimePicker || !form.reservationDate || !form.reservationTime) {
      setSpaces([]);
      setSpacesError("");
      return;
    }
    let cancelled = false;
    setSpacesLoading(true);
    setSpacesError("");

    const qs = new URLSearchParams({
      venueSlug,
      date: form.reservationDate,
      time: form.reservationTime,
      partySize: String(form.partySize),
      locale,
    });
    fetch(`/api/v1/spaces/available?${qs}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        if (!cancelled) {
          setSpaces(d.spaces ?? []);
          setSpacesLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSpacesError(
            (t("host", "streetForm.availabilityError") as string) || "Could not load availability"
          );
          setSpacesLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [showDateTimePicker, form.reservationDate, form.reservationTime, form.partySize, venueSlug, locale, t]);

  const conceptIsLocked = lockedConcept !== null && lockedConcept !== undefined;
  const visibleConcepts = conceptIsLocked
    ? CONCEPTS.filter((c) => c.key === lockedConcept)
    : allowAnyConcept
      ? CONCEPTS
      : CONCEPTS.filter((c) => c.key !== "");

  // submitForm contains all submission logic with no dependency on the DOM
  // event object. It is called from both the form's onSubmit handler (keyboard
  // Enter / implicit submit) and the button's onClick handler.
  //
  // Why two paths? On iOS Safari, the form "submit" event is silently dropped
  // when the submit button is inside an overflow:auto scroll container and the
  // user taps near the container edge — the touch-end is consumed by the scroll
  // layer. The button onClick fires reliably in all browsers, so we call
  // submitForm() from there as well. Having both paths is idempotent because
  // setSubmitting(true) gates re-entrant calls.
  async function submitForm() {
    if (submitting) return; // guard against double-fire (onSubmit + onClick)
    if (!form.guestName || !form.guestEmail) {
      setError(
        (t("host", "streetForm.errorNameEmailRequired") as string) ||
        "Guest name and email are required."
      );
      return;
    }
    // Explicit email-format check rendered near the Submit button, so a bad
    // email address surfaces as a visible JS error rather than a browser
    // native-validation tooltip that may appear off-screen on mobile.
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(form.guestEmail.trim())) {
      setError(
        (t("host", "streetForm.errorEmailInvalid") as string) ||
        "Please enter a valid email address."
      );
      return;
    }
    if (showDateTimePicker && (!form.reservationDate || !form.reservationTime)) {
      setError(
        (t("host", "streetForm.errorDateTimeRequired") as string) ||
        "Please select a date and time."
      );
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");

    const finalPartySize =
      form.partySize === 6 ? (parseInt(form.customPartySize, 10) || 6) : form.partySize;

    const payload: GuestBookingFormData = {
      guestName: form.guestName,
      guestEmail: form.guestEmail,
      guestWhatsapp: form.guestWhatsapp,
      visitorType: form.visitorType,
      emailOptOut: form.emailOptOut,
      partySize: finalPartySize,
      conceptRequested: conceptIsLocked ? (lockedConcept as ConceptKey) : form.conceptRequested,
      occasion: form.occasion,
      notes: form.notes,
      reservationDate: form.reservationDate,
      reservationTime: form.reservationTime,
      requestedSpaceId: form.requestedSpaceId,
    };

    try {
      const result = await onSubmit(payload);
      if (result && result.ok === false) {
        setError(result.error || "Submission failed");
      } else {
        // Use the API's pendingApproval flag as the source of truth — avoids
        // a stale-client-state mismatch where local requiresApproval was true
        // but the server created CONFIRMED for some other reason (or vice versa).
        const needsApproval = (result as any)?.pendingApproval === true;
        const defaultMsg = needsApproval
          ? (t("host", "streetForm.pendingApprovalMessage") as string) ||
            "Request received — your booking is pending host confirmation."
          : successMessage ?? `Booking submitted for ${form.guestName}`;
        setSuccess(defaultMsg);
        if (resetOnSuccess) {
          setForm(makeEmptyForm(initialConcept, lockedConcept));
          setSpaces([]);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Submission failed");
    }
    setSubmitting(false);
  }

  const labelHeader: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "#6b7280", marginBottom: 14,
  };
  const subLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "#6b7280", marginBottom: 5,
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submitForm(); }} noValidate>

      {/* ── Party Size (QR mode — shown BEFORE date/time/space picker) ── */}
      {showDateTimePicker && (
        <GlassCard style={{ marginBottom: 12 }}>
          <div style={labelHeader}>{t("host", "streetForm.sections.partySize")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, partySize: n, customPartySize: "", requestedSpaceId: "" }))
                }
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 10,
                  background: form.partySize === n ? "rgba(200,169,110,0.2)" : "rgba(255,255,255,0.05)",
                  border: form.partySize === n
                    ? "1px solid rgba(200,169,110,0.5)"
                    : "1px solid rgba(255,255,255,0.08)",
                  color: form.partySize === n ? "#c8a96e" : "#9ca3af",
                  fontWeight: 700, fontSize: 15, cursor: "pointer",
                }}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({ ...f, partySize: 6, customPartySize: f.customPartySize || "", requestedSpaceId: "" }))
              }
              style={{
                flex: 1, padding: "12px 0", borderRadius: 10,
                background: form.partySize === 6 ? "rgba(200,169,110,0.2)" : "rgba(255,255,255,0.05)",
                border: form.partySize === 6
                  ? "1px solid rgba(200,169,110,0.5)"
                  : "1px solid rgba(255,255,255,0.08)",
                color: form.partySize === 6 ? "#c8a96e" : "#9ca3af",
                fontWeight: 700, fontSize: 15, cursor: "pointer",
              }}
            >
              6+
            </button>
          </div>
          {form.partySize === 6 && (
            <div style={{ marginTop: 10 }}>
              <input
                type="number"
                min={6}
                value={form.customPartySize}
                onChange={(e) => setForm((f) => ({ ...f, customPartySize: e.target.value }))}
                placeholder={t("host", "streetForm.placeholders.customPartySize") as string}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>
          )}
        </GlassCard>
      )}

      {/* ── When & Where ─────────────────────────────────────────────── */}
      {showDateTimePicker && (
        <GlassCard style={{ marginBottom: 12 }}>
          <div style={labelHeader}>
            {t("host", "streetForm.sections.reservationDetails")}
          </div>

          {/* Date picker */}
          <div style={subLabel}>{t("host", "streetForm.dateLabel")}</div>
          <input
            type="date"
            min={minDate}
            value={form.reservationDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, reservationDate: e.target.value, requestedSpaceId: "" }))
            }
            style={{ ...inputStyle, colorScheme: "dark", marginBottom: 14 }}
          />

          {/* Time slot buttons */}
          <div style={subLabel}>{t("host", "streetForm.timeLabel")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
            {SERVICE_SLOTS.map((slot) => {
              const active = form.reservationTime === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, reservationTime: slot, requestedSpaceId: "" }))
                  }
                  style={{
                    padding: "9px 13px", borderRadius: 9,
                    border: active
                      ? "1px solid rgba(200,169,110,0.6)"
                      : "1px solid rgba(255,255,255,0.1)",
                    background: active
                      ? "rgba(200,169,110,0.15)"
                      : "rgba(255,255,255,0.04)",
                    color: active ? "#c8a96e" : "#6b7280",
                    fontSize: 12, fontWeight: active ? 800 : 600, cursor: "pointer",
                  }}
                >
                  {fmtSlot(slot)}
                </button>
              );
            })}
          </div>

          {/* Space availability — shown once date + time are both set */}
          {form.reservationDate && form.reservationTime ? (
            <div style={{ marginTop: 14 }}>
              <div style={subLabel}>{t("host", "streetForm.spaceLabel")}</div>

              {spacesLoading && (
                <div style={{ fontSize: 12, color: "#6b7280", padding: "6px 0" }}>
                  {t("host", "streetForm.availabilityLoading")}
                </div>
              )}
              {spacesError && !spacesLoading && (
                <div style={{ fontSize: 12, color: "#f87171", padding: "6px 0" }}>
                  {spacesError}
                </div>
              )}

              {!spacesLoading && !spacesError && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* No preference */}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, requestedSpaceId: "" }))}
                    style={{
                      padding: "10px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                      border: form.requestedSpaceId === ""
                        ? "1px solid rgba(200,169,110,0.5)"
                        : "1px solid rgba(255,255,255,0.08)",
                      background: form.requestedSpaceId === ""
                        ? "rgba(200,169,110,0.08)"
                        : "rgba(255,255,255,0.03)",
                      color: form.requestedSpaceId === "" ? "#c8a96e" : "#6b7280",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {t("host", "streetForm.spaceNoPreference")}
                    </span>
                  </button>

                  {spaces.map((space) => {
                    const selected = form.requestedSpaceId === space.id;
                    const avail = space.isAvailable;
                    // Four distinct states, each with its own colour + copy:
                    //  available + !requiresApproval  → green  "N covers available"
                    //  available +  requiresApproval  → amber  "Request this space"
                    //  full      + !requiresApproval  → amber  "Full"
                    //  full      +  requiresApproval  → red    "Full — request review"
                    const statusColor = space.eventConflict
                      ? "#f59e0b"
                      : avail
                      ? (space.requiresApproval ? "#f59e0b" : "#10b981")
                      : (space.requiresApproval ? "#f87171" : "#f59e0b");
                    const statusBg = space.eventConflict
                      ? "rgba(245,158,11,0.12)"
                      : avail
                      ? (space.requiresApproval ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)")
                      : (space.requiresApproval ? "rgba(248,113,113,0.12)" : "rgba(245,158,11,0.12)");
                    const statusText = space.eventConflict
                      ? space.eventConflict.message
                      : avail
                      ? (space.requiresApproval
                          ? (t("host", "streetForm.spaceRequestThis") as string)
                          : `${space.available} ${t("host", "streetForm.spaceAvailableCovers") as string}`)
                      : (space.requiresApproval
                          ? (t("host", "streetForm.spaceFullRequestReview") as string)
                          : (t("host", "streetForm.spaceFull") as string));

                    return (
                      <button
                        key={space.id}
                        type="button"
                        onClick={() => {
                          if (space.eventConflict) {
                            setEventDetails(space.eventConflict);
                            return;
                          }
                          if (!space.isAvailable) return;
                          setForm((f) => ({
                            ...f,
                            requestedSpaceId: space.id,
                            // Sync conceptRequested from space unless concept is locked
                            conceptRequested: conceptIsLocked
                              ? (lockedConcept as ConceptKey)
                              : ((space.conceptKey as ConceptKey) || f.conceptRequested),
                          }));
                        }}
                        aria-haspopup={space.eventConflict ? "dialog" : undefined}
                        aria-disabled={!space.isAvailable}
                        style={{
                          padding: "10px 14px", borderRadius: 10, textAlign: "left",
                          cursor: space.eventConflict ? "pointer" : (space.isAvailable ? "pointer" : "not-allowed"),
                          opacity: !space.isAvailable && !space.eventConflict ? 0.72 : 1,
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          border: selected
                            ? "1px solid rgba(200,169,110,0.5)"
                            : "1px solid rgba(255,255,255,0.08)",
                          background: selected
                            ? "rgba(200,169,110,0.08)"
                            : "rgba(255,255,255,0.03)",
                        }}
                      >
                        <div>
                          <div style={{
                            fontSize: 13, fontWeight: 700,
                            color: selected ? "#c8a96e" : "#fff",
                          }}>
                            {space.name}
                          </div>
                          {space.weatherSensitive && (
                            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
                              {t("host", "streetForm.spaceWeatherSensitive")}
                            </div>
                          )}
                        </div>
                        <div style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 8px",
                          borderRadius: 20, background: statusBg, color: statusColor,
                          whiteSpace: "nowrap", flexShrink: 0, marginLeft: 8,
                        }}>
                          {statusText}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── Full-capacity fallback ─────────────────────────── */}
              {!spacesLoading && !spacesError && spaces.length > 0 &&
                spaces.every((s) => !s.isAvailable) && (
                <div style={{
                  marginTop: 10, padding: "14px 16px", borderRadius: 12,
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.25)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", marginBottom: 8 }}>
                    {t("host", "streetForm.capacityFullTitle") as string}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, reservationTime: "" }))}
                      style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#d1d5db", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                      ⏰ {t("host", "streetForm.capacityFullChangeTime") as string}
                    </button>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, reservationDate: "", reservationTime: "", requestedSpaceId: "" }))}
                      style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#d1d5db", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                      📅 {t("host", "streetForm.capacityFullChangeDate") as string}
                    </button>
                    <a href="https://wa.me/50764316090" target="_blank" rel="noopener noreferrer"
                      style={{ display: "block", padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(37,211,102,0.3)", background: "rgba(37,211,102,0.06)", color: "#25d366", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                      💬 {t("host", "streetForm.capacityFullContact") as string}
                    </a>
                    {/* 4th trackable in-system path: submit with no space preference
                        so the host queue receives the booking and can manually assign */}
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, requestedSpaceId: "" }))}
                      style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(200,169,110,0.3)", background: "rgba(200,169,110,0.06)", color: "#c8a96e", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                      🪑 {t("host", "streetForm.capacityFullNoPreference") as string}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 11, color: "#4b5563", fontStyle: "italic" }}>
              {t("host", "streetForm.selectDateTimeFirst")}
            </div>
          )}
        </GlassCard>
      )}

      {/* ── Guest Info ───────────────────────────────────────────────── */}
      <GlassCard style={{ marginBottom: 12 }}>
        <div style={labelHeader}>{t("host", "streetForm.sections.guestInfo")}</div>

        <input
          value={form.guestName}
          onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
          placeholder={t("host", "streetForm.placeholders.fullName") as string}
          style={inputStyle}
        />

        <div style={{ marginTop: 10 }}>
          <div style={subLabel}>
            {t("host", "streetForm.fieldEmail")} <span style={{ color: "#f87171" }}>*</span>
          </div>
          <input
            value={form.guestEmail}
            onChange={(e) => setForm((f) => ({ ...f, guestEmail: e.target.value }))}
            placeholder={t("host", "streetForm.placeholders.email") as string}
            type="email"
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={subLabel}>
            {t("host", "streetForm.fieldWhatsapp")}{" "}
            <span style={{ color: "#4b5563", fontWeight: 400 }}>
              {t("host", "streetForm.fieldEmailOptional")}
            </span>
          </div>
          <input
            value={form.guestWhatsapp}
            onChange={(e) => setForm((f) => ({ ...f, guestWhatsapp: e.target.value }))}
            placeholder={t("host", "streetForm.placeholders.whatsapp") as string}
            type="tel"
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ ...subLabel, marginBottom: 8 }}>
            {t("host", "streetForm.visitorType.label")}
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {(["Resident", "Frequent Panama Visitor", "Visitor"] as const).map((vt) => (
              <button
                key={vt}
                type="button"
                onClick={() => setForm((f) => ({ ...f, visitorType: vt }))}
                style={{
                  flex: 1, padding: "9px 4px", borderRadius: 9, fontSize: 10,
                  fontWeight: form.visitorType === vt ? 800 : 600,
                  background: form.visitorType === vt ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
                  border: form.visitorType === vt
                    ? "1px solid rgba(167,139,250,0.5)"
                    : "1px solid rgba(255,255,255,0.08)",
                  color: form.visitorType === vt ? "#a78bfa" : "#6b7280",
                  cursor: "pointer", letterSpacing: "0.01em", lineHeight: 1.3, textAlign: "center",
                }}
              >
                {vt === "Frequent Panama Visitor"
                  ? t("host", "streetForm.visitorType.frequentVisitor")
                  : vt === "Resident"
                    ? t("host", "streetForm.visitorType.resident")
                    : t("host", "streetForm.visitorType.visitor")}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14, cursor: "pointer" }}>
          <div
            onClick={() => setForm((f) => ({ ...f, emailOptOut: !f.emailOptOut }))}
            style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
              background: form.emailOptOut ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.05)",
              border: form.emailOptOut
                ? "1px solid rgba(248,113,113,0.5)"
                : "1px solid rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            {form.emailOptOut && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span
            onClick={() => setForm((f) => ({ ...f, emailOptOut: !f.emailOptOut }))}
            style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.45 }}
          >
            {t("host", "streetForm.emailOptOut")}
          </span>
        </label>
      </GlassCard>

      {eventDetails && (
        <div
          role="presentation"
          onClick={() => setEventDetails(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-conflict-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "100%", maxWidth: 390, overflow: "hidden", borderRadius: 18, background: "#171512", border: "1px solid rgba(200,169,110,0.35)", boxShadow: "0 24px 80px rgba(0,0,0,0.55)" }}
          >
            {eventDetails.kind === "PUBLIC_EVENT" && eventDetails.imageUrl ? (
              <img src={eventDetails.imageUrl} alt="" style={{ width: "100%", height: 190, objectFit: "cover", display: "block" }} />
            ) : (
              <div aria-hidden="true" style={{ height: 190, display: "grid", placeItems: "center", background: "linear-gradient(145deg,#2d271d,#11100e)", color: "#c8a96e", fontSize: 54 }}>
                {eventDetails.kind === "PRIVATE_BLOCK" ? "🔒" : "✦"}
              </div>
            )}
            <div style={{ padding: 22 }}>
              <div id="event-conflict-title" style={{ color: "#fff", fontFamily: "var(--font-serif)", fontSize: 26, lineHeight: 1.15 }}>
                {eventDetails.kind === "PRIVATE_BLOCK" ? "Private event" : eventDetails.title ?? "Special event"}
              </div>
              <div style={{ color: "#b8b1a7", fontSize: 14, lineHeight: 1.5, marginTop: 10 }}>{eventDetails.message}</div>
              {eventDetails.kind === "PUBLIC_EVENT" && eventDetails.href ? (
                <a href={eventDetails.href} style={{ display: "block", marginTop: 18, padding: "13px 16px", borderRadius: 10, background: "#c8a96e", color: "#171512", textAlign: "center", textDecoration: "none", fontSize: 14, fontWeight: 800 }}>
                  View tickets and join →
                </a>
              ) : (
                <div style={{ marginTop: 16, color: "#8f887f", fontSize: 12 }}>
                  {eventDetails.kind === "PRIVATE_BLOCK"
                    ? "This event is private and cannot be joined from the reservation page."
                    : "This event is not currently open for public ticket booking."}
                </div>
              )}
              <button type="button" onClick={() => setEventDetails(null)} style={{ width: "100%", marginTop: 10, padding: "11px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Choose another space
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Party Size (non-QR mode only — in QR mode it renders before date/time) */}
      {!showDateTimePicker && <GlassCard style={{ marginBottom: 12 }}>
        <div style={labelHeader}>{t("host", "streetForm.sections.partySize")}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setForm((f) => ({ ...f, partySize: n, customPartySize: "" }))}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 10,
                background: form.partySize === n ? "rgba(200,169,110,0.2)" : "rgba(255,255,255,0.05)",
                border: form.partySize === n
                  ? "1px solid rgba(200,169,110,0.5)"
                  : "1px solid rgba(255,255,255,0.08)",
                color: form.partySize === n ? "#c8a96e" : "#9ca3af",
                fontWeight: 700, fontSize: 15, cursor: "pointer",
              }}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, partySize: 6, customPartySize: f.customPartySize || "" }))}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              background: form.partySize === 6 ? "rgba(200,169,110,0.2)" : "rgba(255,255,255,0.05)",
              border: form.partySize === 6
                ? "1px solid rgba(200,169,110,0.5)"
                : "1px solid rgba(255,255,255,0.08)",
              color: form.partySize === 6 ? "#c8a96e" : "#9ca3af",
              fontWeight: 700, fontSize: 15, cursor: "pointer",
            }}
          >
            6+
          </button>
        </div>
        {form.partySize === 6 && (
          <div style={{ marginTop: 10 }}>
            <input
              type="number"
              min={6}
              value={form.customPartySize}
              onChange={(e) => setForm((f) => ({ ...f, customPartySize: e.target.value }))}
              placeholder={t("host", "streetForm.placeholders.customPartySize") as string}
              style={{ ...inputStyle, fontSize: 14 }}
            />
          </div>
        )}
      </GlassCard>}

      {/* ── Experience (concept) ─────────────────────────────────────────
          In QR mode, the concept is inferred from the selected space.
          Suppress this card when a space has been selected so the guest
          isn't shown a redundant (and confusing) second concept picker.
          When no space is selected in QR mode (requestedSpaceId === ""),
          keep it visible as a fallback conceptRequested value.         */}
      {!(showDateTimePicker && form.requestedSpaceId !== "") && <GlassCard style={{ marginBottom: 12 }}>
        <div style={labelHeader}>{t("host", "streetForm.sections.experience")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {visibleConcepts.map((c) => {
            const active = form.conceptRequested === c.key;
            return (
              <button
                key={c.key || "ANY"}
                type="button"
                disabled={conceptIsLocked}
                onClick={() => !conceptIsLocked && setForm((f) => ({ ...f, conceptRequested: c.key }))}
                style={{
                  flex: "1 1 70px", padding: "10px 0", borderRadius: 10,
                  background: active ? `${c.color}20` : "rgba(255,255,255,0.04)",
                  border: active ? `1px solid ${c.color}66` : "1px solid rgba(255,255,255,0.08)",
                  color: active ? c.color : "#6b7280",
                  fontWeight: 700, fontSize: 12,
                  cursor: conceptIsLocked ? "default" : "pointer",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>
          {t("host", "streetForm.sections.occasion")}
        </div>
        <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 10, fontStyle: "italic" }}>
          {t("host", "streetForm.occasionPlaceholder")}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4b5563", marginBottom: 8 }}>
          {t("host", "streetForm.personalOccasions")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {PERSONAL_OCCASIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setForm((f) => ({ ...f, occasion: f.occasion === o.key ? "" : o.key }))}
              style={{
                padding: "7px 14px", borderRadius: 20,
                background: form.occasion === o.key ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
                border: form.occasion === o.key
                  ? "1px solid rgba(167,139,250,0.4)"
                  : "1px solid rgba(255,255,255,0.08)",
                color: form.occasion === o.key ? "#a78bfa" : "#6b7280",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {t("host", o.tKey)}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4b5563", marginBottom: 8 }}>
          {t("host", "streetForm.panamaHolidays")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PANAMA_HOLIDAYS.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={() => setForm((f) => ({ ...f, occasion: f.occasion === h.key ? "" : h.key }))}
              style={{
                padding: "7px 14px", borderRadius: 20,
                background: form.occasion === h.key ? "rgba(200,169,110,0.15)" : "rgba(255,255,255,0.04)",
                border: form.occasion === h.key
                  ? "1px solid rgba(200,169,110,0.4)"
                  : "1px solid rgba(255,255,255,0.08)",
                color: form.occasion === h.key ? "#c8a96e" : "#6b7280",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {t("host", h.tKey)}
            </button>
          ))}
        </div>
      </GlassCard>}

      {/* ── Notes ────────────────────────────────────────────────────── */}
      <GlassCard style={{ marginBottom: 20 }}>
        <div style={{ ...labelHeader, marginBottom: 12 }}>
          {t("host", "streetForm.sections.notes")}
        </div>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder={t("host", "streetForm.placeholders.notes") as string}
          rows={3}
          style={{ ...inputStyle, resize: "none", fontFamily: "inherit" }}
        />
      </GlassCard>

      {error && (
        <div style={{
          background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 14,
          color: "#f87171", fontSize: 13,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 14,
          color: "#10b981", fontSize: 13, fontWeight: 600,
        }}>
          {success}
        </div>
      )}

      <button
        type="button"
        onClick={submitForm}
        disabled={submitting}
        style={{
          width: "100%", padding: "16px", borderRadius: 14, border: "none",
          background: submitting
            ? "rgba(200,169,110,0.3)"
            : "linear-gradient(135deg, #c8a96e 0%, #a8894e 100%)",
          color: submitting ? "#9ca3af" : "#1a1614",
          fontSize: 15, fontWeight: 800,
          cursor: submitting ? "not-allowed" : "pointer",
          letterSpacing: "0.04em",
          // touch-action: manipulation removes the 300 ms tap delay on iOS Safari
          // and prevents the browser from treating the tap as a scroll gesture.
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        } as React.CSSProperties}
      >
        {submitting
          ? (sendingButtonLabel ?? t("host", "streetForm.sendingButton"))
          : (submitButtonLabel ?? t("host", "streetForm.submitButton"))}
      </button>
    </form>
  );
}
