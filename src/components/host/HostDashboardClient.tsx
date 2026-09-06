"use client";

import { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import Brandmark from "@/components/Brandmark";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";

const QRScanner = lazy(() => import("./QRScanner"));
import BindInvuOrderControl, { type AttributionSessionForBind } from "./BindInvuOrderControl";
import ScanResultModal from "./ScanResultModal";

// ─── Types ─────────────────────────────────────────────────────────────────

// AttributionSession on the host dashboard carries two roles: (a) bind UI
// surface (BindInvuOrderControl reads bindings/tableSession), and (b)
// referral-chain source of truth for the "Today's Referred Guests" panel
// (referralActor / legacyReferrer / hostUserId). The legacy
// `attributions[]` join is missing for actor-only and host-only chains —
// this richer shape replaces it everywhere the panel reads.
type AttributionSessionRich = AttributionSessionForBind & {
  hostUserId?: string | null;
  referralActor?: { id: string; displayName: string; actorType: string } | null;
  legacyReferrer?: { id: string; fullName: string; referrerType: string } | null;
};

type Reservation = {
  id: string;
  // confirmationCode is the human-readable booking handle (e.g. R3RLEWES)
  // — surfaced on the referral panel so hosts can verify against the
  // confirmation email/QR the guest is showing them at the door.
  confirmationCode?: string | null;
  contactName: string;
  partySize: number;
  status: string;
  reservationDate: string;
  conceptRequested: string | null;
  occasion: string | null;
  notes: string | null;
  assignedTableLabel: string | null;
  source: string;
  // Closed-card surface (Apr 28 2026). actualRevenueCents lands when the
  // host (or the INVU close webhook) records the table total; null until
  // POS settles, in which case the closed card shows "Awaiting POS close".
  // arrivedHeadcount is the optional partial-arrival count captured at
  // ARRIVED — null when the whole party walked in together.
  actualRevenueCents?: number | null;
  arrivedHeadcount?: number | null;
  arrivalConfirmedAt?: string | null;
  seatedAt?: string | null;
  zone: { name: string; conceptKey: string } | null;
  handoffs: Array<{ handoffStatus: string }>;
  attributions: Array<{ referrer: { fullName: string; referrerType: string } | null }>;
  addons: Array<{ addonType: string; label: string }>;
  assignedHost: { displayName: string; badgeColor: string | null } | null;
  statusLogs: Array<{ toStatus: string; changedAt: string; changedByLabel: string | null; notes: string | null }>;
  // v2 deterministic trust chain — present once an attribution session has
  // been minted (QR/referrer booking, streetside walk-in, or check-in). The
  // host uses this to bind the OKÜ booking to the open INVU order id, which
  // makes downstream commission attribution Tier-1 deterministic instead of
  // falling back to heuristic matching.
  attributionSession?: AttributionSessionRich | null;
};

type ChatSession = {
  id: string;
  guestName: string;
  guestPhone: string | null;
  language: string;
  status: string;
  updatedAt: string;
  messages: Array<{ id: string; senderRole: string; content: string; createdAt: string }>;
};

type HostProfile = {
  id: string;
  displayName: string;
  isActive: boolean;
  badgeColor: string | null;
  venue: { id: string; name: string; slug: string } | null;
  parentProfile: { id: string; displayName: string } | null;
  referrerAssignments: Array<{
    id: string; displayName: string; referralCode: string;
    referralUrl: string | null; qrCodeImageUrl: string | null;
    isCommissionEligible: boolean; commissionMode: string;
    commissionShareBps: number | null; commissionPayer: string | null;
    series: { id: string; title: string } | null;
  }>;
};

type MeData = {
  user: { id: string; name: string; email: string; roles: string[] };
  hostProfile: HostProfile | null;
  todayReservations: Reservation[];
  // 7-day window of COMPLETED reservations at the venue, server-driven
  // by /api/v1/host/me. Used by the "Closed" tab + stat chip so closed
  // tables drop off the active queue immediately but stay reachable for
  // a week (POS-verification lag, late commission lookups, etc.).
  closedReservations?: Reservation[];
  // hostUserId → display name lookup that mirrors the AttributionSession
  // chain; lets the panel render "Walked in by <name>" for HOST_WALKIN
  // sessions without an extra schema relation.
  hostUserNameById?: Record<string, string>;
  inboundHandoffs: any[];
  chatSessions: ChatSession[];
  commissions: any[];
  venue: { id: string; name: string } | null;
};

// ─── Constants ─────────────────────────────────────────────────────────────

const LOSS_REASONS = [
  { key: "WAIT_TOO_LONG",          label: "Wait too long" },
  { key: "TABLE_NOT_READY",        label: "Table not ready" },
  { key: "PREFERRED_SEATING_UNAVAILABLE", label: "No preferred seating" },
  { key: "GROUP_TOO_LARGE",        label: "Group too large" },
  { key: "PRICE_CONCERN",          label: "Price concern" },
  { key: "WENT_ELSEWHERE",         label: "Went elsewhere" },
  { key: "CHANGED_MIND",           label: "Changed mind" },
  { key: "OTHER",                  label: "Other" },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PENDING:      { label: "Pending",    color: "#fbbf24", bg: "rgba(251,191,36,0.07)", border: "rgba(251,191,36,0.25)" },
  CONFIRMED:    { label: "Confirmed",  color: "#60a5fa", bg: "rgba(96,165,250,0.07)", border: "rgba(96,165,250,0.25)" },
  WAITLISTED:   { label: "Waitlisted", color: "#a78bfa", bg: "rgba(167,139,250,0.07)", border: "rgba(167,139,250,0.25)" },
  ACKNOWLEDGED: { label: "Host aware", color: "#818cf8", bg: "rgba(129,140,248,0.07)", border: "rgba(129,140,248,0.25)" },
  ARRIVED:      { label: "Arrived",    color: "#34d399", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.3)" },
  SEATED:       { label: "Seated ✓",  color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.35)" },
  COMPLETED:    { label: "Done",       color: "#6b7280", bg: "rgba(107,114,128,0.06)", border: "rgba(107,114,128,0.15)" },
  NO_SHOW:      { label: "Lost / No show", color: "#f87171", bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.25)" },
  CANCELLED:    { label: "Cancelled",  color: "#4b5563", bg: "rgba(75,85,99,0.07)", border: "rgba(75,85,99,0.15)" },
};

const CONCEPT_COLOR: Record<string, string> = {
  OKU: "#c8a96e", CATCH: "#38bdf8", TERRACE: "#4ade80",
};

const REFERRER_HINTS: Record<string, { icon: string; prompt: string }> = {
  TOUR_GUIDE:       { icon: "🗺️", prompt: "Ask: How was the tour?" },
  TAXI_DRIVER:      { icon: "🚕", prompt: "Ask: How was the taxi ride over?" },
  HOTEL_CONCIERGE:  { icon: "🏨", prompt: "Ask: How are you enjoying your stay?" },
  PARTNER:          { icon: "🤝", prompt: "Welcome — always glad to see friends of our partners." },
  STREETSIDE_HOST:  { icon: "🚶", prompt: "Our host brought you in — welcome to OKÜ!" },
  MEMBER:           { icon: "◇",  prompt: "Our member recommended you — you're in good hands." },
  INFLUENCER:       { icon: "✨", prompt: "Great to have you — welcome to the experience." },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function elapsed(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── Reservation Card ───────────────────────────────────────────────────────

const STATUS_LABEL_KEYS: Record<string, string> = {
  PENDING: "filters.pending",
  CONFIRMED: "filters.confirmed",
  ACKNOWLEDGED: "filters.acknowledged",
  ARRIVED: "filters.arrived",
  SEATED: "filters.seated",
};

function ReservationCard({ res, onAction }: {
  res: Reservation;
  onAction: (id: string, status: string, extra?: Record<string, string>) => Promise<void>;
}) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showLoss, setShowLoss] = useState(false);
  const [invuSyncing, setInvuSyncing] = useState(false);
  const [invuSyncResult, setInvuSyncResult] = useState<{
    grossCents: number;
    taxCents: number;
    commissionableCents: number;
    commissionAllocations: Array<{ earnerType: string; amountCents: number }>;
  } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // comp drink
  const [drinkSaving, setDrinkSaving] = useState(false);
  const [drinkLogs, setDrinkLogs] = useState<Array<{ label: string; at: Date }>>(
    res.statusLogs
      .filter((l) => l.changedByLabel === "COMP_DRINK")
      .map((l) => ({ label: l.notes ?? "Drink offered", at: new Date(l.changedAt) }))
  );
  // party size — track saved value separately since res.partySize is a stale prop
  const [partyAdj, setPartyAdj] = useState(res.partySize);
  const [committedPartySize, setCommittedPartySize] = useState(res.partySize);
  const [partySaving, setPartySaving] = useState(false);
  const [partySaved, setPartySaved] = useState(false);
  // host intro note (local session only)
  const [hostNote, setHostNote] = useState("");

  const meta = STATUS_META[res.status] ?? STATUS_META["PENDING"];
  // Resolve the "referrer" identity for card rendering. Order MUST match
  // HostOperationsBoard (session actor → session legacy → legacy attribution)
  // so the same booking shows the same name in both surfaces. The session
  // actor wins because it's the most precise per-booking attribution.
  const sessionActor = res.attributionSession?.referralActor ?? null;
  const sessionLegacy = res.attributionSession?.legacyReferrer ?? null;
  const legacyAttribRef = res.attributions[0]?.referrer ?? null;
  const referrer = sessionActor
    ? { fullName: sessionActor.displayName, referrerType: sessionActor.actorType }
    : sessionLegacy
    ? { fullName: sessionLegacy.fullName, referrerType: sessionLegacy.referrerType }
    : legacyAttribRef ?? null;
  const conceptColor = CONCEPT_COLOR[res.conceptRequested ?? ""] ?? "#6b7280";
  const isFinal = ["COMPLETED", "CANCELLED"].includes(res.status);
  const isLost = res.status === "NO_SHOW";
  const boundInvuOrderId =
    res.attributionSession?.tableSession?.openedInvuOrderId ??
    res.attributionSession?.bindings?.[0]?.invuOrderId ?? null;
  // An accidental completion before an INVU bind is recoverable.  Once a POS
  // order or revenue exists, reopening would make the financial audit trail
  // ambiguous, so the server and UI both refuse it.
  const canReopenForInvu =
    res.status === "COMPLETED" &&
    !boundInvuOrderId &&
    res.actualRevenueCents == null;
  const isStreetside = res.source === "STREETSIDE_HOST";
  const isWaiting = ["PENDING", "CONFIRMED", "ACKNOWLEDGED", "ARRIVED"].includes(res.status);

  async function logCompDrink(drinkType: "ALCOHOLIC" | "NON_ALCOHOLIC") {
    setDrinkSaving(true);
    try {
      const r = await fetch(`/api/v1/host/bookings/${res.id}/comp-drink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drinkType }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setDrinkLogs((prev) => [
        { label: drinkType === "ALCOHOLIC" ? t("host", "card.alcoholic") : t("host", "card.nonAlcoholic"), at: new Date() },
        ...prev,
      ]);
    } catch (e: any) { alert(e.message); }
    setDrinkSaving(false);
  }

  async function savePartySize() {
    if (partyAdj === committedPartySize) return;
    setPartySaving(true);
    try {
      const r = await fetch(`/api/v1/host/bookings/${res.id}/party-size`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partySize: partyAdj }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setCommittedPartySize(partyAdj);
      setPartySaved(true);
      setTimeout(() => setPartySaved(false), 3000);
    } catch (e: any) { alert(e.message); }
    setPartySaving(false);
  }

  async function syncInvuClose() {
    setInvuSyncing(true);
    try {
      const r = await fetch(`/api/v1/host/bookings/${res.id}/sync-invu-close`, {
        method: "POST",
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setInvuSyncResult(d.tableSession);
    } catch (e: any) {
      alert(e.message);
    }
    setInvuSyncing(false);
  }

  async function act(status: string, extra?: Record<string, string>) {
    setUpdating(true);
    await onAction(res.id, status, extra);
    setUpdating(false);
    setShowLoss(false);
    setExpanded(false);
  }

  return (
    <div style={{
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      borderRadius: 14,
      overflow: "hidden",
      transition: "all 0.15s",
    }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          background: `${conceptColor}20`,
          border: `1px solid ${conceptColor}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, fontWeight: 800, fontSize: 15, color: conceptColor,
        }}>
          {res.partySize}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "white", fontSize: 14, marginBottom: 3 }}>
            {res.contactName}
            {isStreetside && (
              <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600, marginLeft: 8, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 4, padding: "1px 5px" }}>
                STREETSIDE
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span>{formatTime(res.reservationDate)}</span>
            {res.zone && <span style={{ color: "#6b7280" }}>· {res.zone.name}</span>}
            {res.assignedHost && <span style={{ color: "#4b5563" }}>· {res.assignedHost.displayName}</span>}
            {referrer && <span style={{ color: "#c8a96e" }}>· via {referrer.fullName}</span>}
          </div>
        </div>

        <div style={{
          padding: "3px 9px", borderRadius: 20,
          background: meta.bg, border: `1px solid ${meta.border}`,
          fontSize: 10, fontWeight: 700, color: meta.color, whiteSpace: "nowrap",
          letterSpacing: "0.04em",
        }}>
          {meta.label}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${meta.border}`, padding: "14px 16px", background: "rgba(0,0,0,0.25)" }}>
          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14, fontSize: 12 }}>
            {res.occasion && <InfoItem label={t("host", "card.occasion")} value={res.occasion} />}
            {res.assignedTableLabel && <InfoItem label={t("host", "card.table")} value={res.assignedTableLabel} />}
            {res.addons.length > 0 && <InfoItem label={t("host", "card.addons")} value={res.addons.map((a) => a.label).join(", ")} />}
            {res.notes && <div style={{ gridColumn: "1/-1" }}><InfoItem label={t("host", "card.notes")} value={res.notes} /></div>}
          </div>

          {/* ── Closed (Settled) Summary ──────────────────────────────
              Only shown for COMPLETED reservations. The arrival/welcome
              greeting below is intentionally noise on a settled card —
              what the host (and superadmin combing through the Closed
              tab a week later) needs is the reservation handle, the INVU
              order it bound to, and the realized revenue. */}
          {res.status === "COMPLETED" && (
            <div style={{
              marginBottom: 14, padding: "12px 14px",
              background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: 10,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                color: "#a7f3d0", marginBottom: 10,
              }}>
                Settled
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                {res.confirmationCode && (
                  <ClosedRow label="Booking">
                    <span style={{
                      fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700,
                      color: "#c8a96e", background: "rgba(200,169,110,0.08)",
                      border: "1px solid rgba(200,169,110,0.2)", borderRadius: 4,
                      padding: "1px 6px", letterSpacing: "0.04em",
                    }}>{res.confirmationCode}</span>
                  </ClosedRow>
                )}
                <ClosedRow label="Date">
                  {new Date(res.reservationDate).toLocaleString([], {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </ClosedRow>
                <ClosedRow label="Party">
                  <span style={{ color: "white", fontWeight: 700 }}>
                    {res.partySize}
                    {res.arrivedHeadcount != null && res.arrivedHeadcount !== res.partySize && (
                      <span style={{ color: "#fbbf24", fontWeight: 600, marginLeft: 4, fontSize: 11 }}>
                        · {res.arrivedHeadcount} arrived
                      </span>
                    )}
                  </span>
                </ClosedRow>
                <ClosedRow label="Table">
                  <span style={{ color: res.assignedTableLabel ? "white" : "#6b7280", fontWeight: 700 }}>
                    {res.assignedTableLabel ?? "—"}
                  </span>
                </ClosedRow>
                <ClosedRow label="INVU order">
                  {(() => {
                    const invu = res.attributionSession?.bindings?.[0]?.invuOrderId;
                    return invu ? (
                      <span style={{
                        fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700,
                        color: "#fbbf24", background: "rgba(251,191,36,0.08)",
                        border: "1px solid rgba(251,191,36,0.25)", borderRadius: 4,
                        padding: "1px 6px",
                      }}>#{invu}</span>
                    ) : (
                      <span style={{ color: "#6b7280", fontSize: 11 }}>Not bound</span>
                    );
                  })()}
                </ClosedRow>
                <ClosedRow label="Revenue">
                  {typeof res.actualRevenueCents === "number" ? (
                    <span style={{ color: "#a7f3d0", fontWeight: 800 }}>
                      ${(res.actualRevenueCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span style={{ color: "#fbbf24", fontSize: 11, fontStyle: "italic" }}>
                      Awaiting POS close
                    </span>
                  )}
                </ClosedRow>
                {referrer && (
                  <div style={{ gridColumn: "1/-1" }}>
                    <ClosedRow label="Referred by">
                      <span style={{ color: "#c8a96e", fontWeight: 700 }}>
                        {referrer.fullName}
                        <span style={{ color: "#6b7280", fontWeight: 500, marginLeft: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {referrer.referrerType.replace(/_/g, " ")}
                        </span>
                      </span>
                    </ClosedRow>
                  </div>
                )}
              </div>
              {canReopenForInvu && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(200,169,110,0.18)" }}>
                  <div style={{ fontSize: 11, color: "#d1d5db", lineHeight: 1.45, marginBottom: 8 }}>
                    No INVU check is bound. If this table was completed by mistake, reopen it to <strong>Seated</strong> and bind the actual open INVU check before closing it again.
                  </div>
                  <QuickBtn
                    label="Reopen for INVU binding"
                    color="#c8a96e"
                    disabled={updating}
                    onClick={() => {
                      if (window.confirm("Reopen this completed reservation to Seated for INVU binding? No POS order or revenue is attached.")) {
                        act("SEATED");
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Referrer Intro Card ──────────────────────────────────
              Suppressed on COMPLETED — the Settled summary above carries
              the referrer line and the welcome textarea has no purpose
              for a guest who has already left. */}
          {referrer && res.status !== "COMPLETED" && (
            <div style={{
              marginBottom: 14, padding: "12px 14px",
              background: "rgba(200,169,110,0.06)", border: "1px solid rgba(200,169,110,0.2)",
              borderRadius: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{REFERRER_HINTS[referrer.referrerType]?.icon ?? "👤"}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#c8a96e" }}>
                    {t("host", "card.guestOf")} {referrer.fullName}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {referrer.referrerType.replace(/_/g, " ")}
                  </div>
                </div>
              </div>
              {REFERRER_HINTS[referrer.referrerType] && (
                <div style={{
                  fontSize: 11, color: "#d1b06b",
                  background: "rgba(200,169,110,0.08)", borderRadius: 7,
                  padding: "6px 10px", marginBottom: 8, fontStyle: "italic",
                }}>
                  {t("host", `rapportHints.${referrer.referrerType}`)}
                </div>
              )}
              <textarea
                value={hostNote}
                onChange={(e) => setHostNote(e.target.value)}
                placeholder={t("host", "card.introNotePrompt")}
                rows={2}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 7, padding: "7px 10px", color: "white", fontSize: 11,
                  resize: "none", outline: "none", fontFamily: "inherit",
                }}
              />
            </div>
          )}

          {/* ── Party Size Adjustment ───────────────────────────────── */}
          {["ARRIVED", "SEATED"].includes(res.status) && !isLost && (
            <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", flex: 1, minWidth: 80 }}>
                {t("host", "card.partySize")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setPartyAdj((n) => Math.max(1, n - 1))}
                  style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "white", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >−</button>
                <span style={{ fontSize: 20, fontWeight: 800, color: "white", minWidth: 28, textAlign: "center" }}>
                  {partyAdj}
                </span>
                <button
                  onClick={() => setPartyAdj((n) => Math.min(100, n + 1))}
                  style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "white", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >+</button>
              </div>
              {partyAdj !== committedPartySize && (
                <button
                  onClick={savePartySize}
                  disabled={partySaving}
                  style={{ padding: "6px 13px", borderRadius: 8, border: "none", background: "rgba(52,211,153,0.15)", color: "#34d399", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                >
                  {partySaving ? t("host", "invu.saving") : `${t("host", "card.save")} (${t("host", "card.was")} ${committedPartySize})`}
                </button>
              )}
              {partySaved && partyAdj === committedPartySize && (
                <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>{t("host", "card.updated")}</span>
              )}
            </div>
          )}

          {/* ── Complimentary Drinks ────────────────────────────────── */}
          {isWaiting && (
            <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: drinkLogs.length > 0 ? 10 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.06em", textTransform: "uppercase", flex: 1 }}>
                  {t("host", "card.compDrinks")} {drinkLogs.length > 0 && <span style={{ background: "rgba(167,139,250,0.2)", borderRadius: 10, padding: "1px 7px", marginLeft: 4 }}>{drinkLogs.length}</span>}
                </div>
                <button
                  disabled={drinkSaving}
                  onClick={() => logCompDrink("NON_ALCOHOLIC")}
                  style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.1)", color: "#a78bfa", fontSize: 11, fontWeight: 700, cursor: drinkSaving ? "not-allowed" : "pointer", opacity: drinkSaving ? 0.5 : 1 }}
                >
                  {t("host", "card.nonAlcoholic")}
                </button>
                <button
                  disabled={drinkSaving}
                  onClick={() => logCompDrink("ALCOHOLIC")}
                  style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.1)", color: "#a78bfa", fontSize: 11, fontWeight: 700, cursor: drinkSaving ? "not-allowed" : "pointer", opacity: drinkSaving ? 0.5 : 1 }}
                >
                  {t("host", "card.alcoholic")}
                </button>
              </div>
              {drinkLogs.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {drinkLogs.map((d, i) => (
                    <span key={i} style={{ fontSize: 10, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 6, padding: "2px 8px", color: "#c4b5fd" }}>
                      {d.label} · {d.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── INVU Bind ──────────────────────────────────────────────
              The maitre d' is the human point of contact with the server in
              INVU. As soon as the server opens the table in INVU and reads
              out the order id, bind it here so the closed sale will match
              this reservation deterministically (Tier 1) at sync time. */}
          {!isFinal && !isLost && (
            <div style={{ marginBottom: 14 }}>
              <BindInvuOrderControl
                attributionSession={res.attributionSession ?? null}
                seatedTableLabel={res.seatedAt ? res.assignedTableLabel : null}
              />
            </div>
          )}

          {/* Actions — standard flow.
              Layout is intentionally tiered so the host's most common
              real-world action ("seat this guest") is the obvious CTA at
              every waiting stage — they shouldn't have to hunt for it on
              the floor-control board or step through Acknowledge/Arrived
              first when the guest is already standing in front of them. */}
          {!isFinal && !isLost && !showLoss && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {res.status === "PENDING_APPROVAL" && (
                <Link
                  href={`/host/operations?reservationId=${encodeURIComponent(res.id)}`}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "14px 18px", borderRadius: 10,
                    border: "1px solid rgba(96,165,250,0.55)", background: "rgba(96,165,250,0.14)",
                    color: "#bfdbfe", fontSize: 15, fontWeight: 800, textDecoration: "none", textAlign: "center",
                  }}
                >
                  Review &amp; confirm
                </Link>
              )}
              {/* Primary CTA — "Seat" reachable from any waiting state */}
              {["PENDING", "CONFIRMED", "WAITLISTED", "ACKNOWLEDGED", "ARRIVED"].includes(res.status) && (
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => act("SEATED")}
                  style={{
                    width: "100%", padding: "14px 18px", borderRadius: 10,
                    border: "1px solid rgba(16,185,129,0.5)",
                    background: "linear-gradient(180deg, rgba(16,185,129,0.22), rgba(16,185,129,0.12))",
                    color: "#a7f3d0", fontSize: 15, fontWeight: 800, letterSpacing: "0.02em",
                    cursor: updating ? "not-allowed" : "pointer", opacity: updating ? 0.6 : 1,
                    boxShadow: "0 1px 0 rgba(16,185,129,0.25) inset",
                  }}
                >
                  {t("host", "actions.seat")}
                </button>
              )}

              {/* The closed INVU order is authoritative: never ask a host to
                  enter a total or override a commission rate. */}
              {res.status === "SEATED" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <QuickBtn label={t("host", "actions.complete")} color="#6b7280" disabled={updating} onClick={() => act("COMPLETED")} />
                  <QuickBtn label={invuSyncing ? "Syncing INVU close…" : "Sync closed INVU check"} color="#c8a96e" disabled={invuSyncing || !boundInvuOrderId} onClick={syncInvuClose} />
                </div>
              )}

              {invuSyncResult && (
                <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, fontSize: 12, color: "#d1fae5" }}>
                  <strong>✓ Closed total verified from INVU:</strong> ${(invuSyncResult.grossCents / 100).toFixed(2)}
                  {invuSyncResult.taxCents > 0 && <> · tax ${(invuSyncResult.taxCents / 100).toFixed(2)}</>}
                  <> · commissionable ${(invuSyncResult.commissionableCents / 100).toFixed(2)}</>
                  {invuSyncResult.commissionAllocations.map((allocation, index) => (
                    <span key={index}> · {allocation.earnerType.toLowerCase()} commission ${(allocation.amountCents / 100).toFixed(2)}</span>
                  ))}
                </div>
              )}

              {/* Secondary quick acks + Lost — kept as small pills */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {res.status === "PENDING" && (
                  <QuickBtn label={t("host", "actions.confirm")} color="#60a5fa" disabled={updating} onClick={() => act("CONFIRMED")} />
                )}
                {["PENDING", "CONFIRMED", "WAITLISTED"].includes(res.status) && (
                  <QuickBtn label={t("host", "actions.acknowledge")} color="#818cf8" disabled={updating} onClick={() => act("ACKNOWLEDGED")} />
                )}
                {["CONFIRMED", "ACKNOWLEDGED"].includes(res.status) && (
                  <QuickBtn label={t("host", "actions.arrived")} color="#34d399" disabled={updating} onClick={() => act("ARRIVED")} />
                )}
                <QuickBtn label={t("host", "actions.lost")} color="#f87171" disabled={updating} onClick={() => setShowLoss(true)} />
              </div>

              {/* Bidirectional move + audit history.
                  Every transition (forward or backward) creates a
                  ReservationStatusLog row server-side via transitionStatus,
                  so verification is automatic — we just expose it here. */}
              <div style={{ display: "flex", gap: 14, alignItems: "center", paddingTop: 4, fontSize: 11 }}>
                {(() => {
                  const PREV: Record<string, string> = {
                    CONFIRMED: "PENDING",
                    ACKNOWLEDGED: "CONFIRMED",
                    ARRIVED: "ACKNOWLEDGED",
                    SEATED: "ARRIVED",
                  };
                  const back = PREV[res.status];
                  if (!back) return null;
                  // Prefer the localized filter label so the confirm prompt
                  // doesn't mix English status names into Spanish/Portuguese
                  // copy. Fall back to STATUS_META if no i18n key exists.
                  const labelKey = STATUS_LABEL_KEYS[back];
                  const backLabel = labelKey ? t("host", labelKey) : (STATUS_META[back]?.label ?? back);
                  return (
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => {
                        if (window.confirm(t("host", "actions.confirmStepBack").replace("{status}", backLabel))) {
                          act(back);
                        }
                      }}
                      style={{
                        background: "transparent", border: "none", padding: 0,
                        color: "#9ca3af", fontSize: 11, cursor: "pointer",
                        textDecoration: "underline", textUnderlineOffset: 3,
                      }}
                    >
                      {t("host", "actions.stepBack")} → {backLabel}
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => setShowHistory((s) => !s)}
                  style={{
                    background: "transparent", border: "none", padding: 0, marginLeft: "auto",
                    color: "#9ca3af", fontSize: 11, cursor: "pointer",
                    textDecoration: "underline", textUnderlineOffset: 3,
                  }}
                >
                  {showHistory ? t("host", "actions.hideHistory") : t("host", "actions.viewHistory")}
                </button>
              </div>

              {showHistory && (
                <div
                  style={{
                    marginTop: 4, padding: "10px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {(() => {
                    const transitions = (res.statusLogs ?? []).filter(
                      (l) => l.changedByLabel !== "COMP_DRINK"
                    );
                    if (transitions.length === 0) {
                      return (
                        <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
                          {t("host", "actions.noHistory")}
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {transitions
                          .slice()
                          .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
                          .slice(0, 8)
                          .map((l, i) => {
                            const toLabel = STATUS_META[l.toStatus]?.label ?? l.toStatus;
                            return (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11 }}>
                                <span style={{ color: "#d1d5db" }}>
                                  → <strong style={{ color: STATUS_META[l.toStatus]?.color ?? "#fff" }}>{toLabel}</strong>
                                  {l.changedByLabel && <span style={{ color: "#6b7280" }}> · {l.changedByLabel}</span>}
                                </span>
                                <span style={{ color: "#6b7280", whiteSpace: "nowrap" }}>
                                  {formatTime(l.changedAt)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Loss reason picker */}
          {showLoss && (
            <div>
              <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700, marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {t("host", "lossReasons.title")}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {LOSS_REASONS.map((r) => (
                  <button
                    key={r.key}
                    disabled={updating}
                    onClick={() => act("NO_SHOW", { lossReason: r.key })}
                    style={{
                      background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                      borderRadius: 8, padding: "6px 11px", color: "#f87171", fontSize: 11,
                      cursor: "pointer", fontWeight: 600,
                    }}
                  >
                    {t("host", `lossReasons.${r.key}`)}
                  </button>
                ))}
                <button onClick={() => setShowLoss(false)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 11px", color: "#6b7280", fontSize: 11, cursor: "pointer" }}>
                  {t("host", "actions.cancel")}
                </button>
              </div>
            </div>
          )}

          {/* Guest came back after being marked lost */}
          {isLost && !showLoss && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#f87171", fontStyle: "italic", flex: 1 }}>
                {t("host", "actions.markedLost")}
              </div>
              <button
                disabled={updating}
                onClick={() => act("ARRIVED")}
                style={{
                  background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.4)",
                  borderRadius: 9, padding: "8px 14px",
                  color: "#34d399", fontSize: 11, fontWeight: 800, cursor: "pointer",
                  letterSpacing: "0.03em",
                }}
              >
                {t("host", "actions.theyReturned")}
              </button>
              <button
                disabled={updating}
                onClick={() => setShowLoss(true)}
                style={{
                  background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 9, padding: "8px 12px",
                  color: "#6b7280", fontSize: 11, cursor: "pointer",
                }}
              >
                {t("host", "actions.changeReason")}
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4b5563", marginBottom: 2 }}>{label}</div>
      <div style={{ color: "#d1d5db", fontSize: 12 }}>{value}</div>
    </div>
  );
}

// ClosedRow renders a label/value pair inside the Settled summary panel
// shown on COMPLETED reservation cards. Looks like InfoItem but with an
// inline children slot so callers can pass styled chips (mono badges,
// colored values) instead of a plain string.
function ClosedRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: "#d1d5db" }}>{children}</div>
    </div>
  );
}

function QuickBtn({ label, color, disabled, onClick }: { label: string; color: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        background: `${color}15`, border: `1px solid ${color}44`,
        borderRadius: 9, padding: "7px 13px",
        color, fontSize: 11, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, letterSpacing: "0.03em",
      }}
    >
      {label}
    </button>
  );
}

// ─── Chat Panel ─────────────────────────────────────────────────────────────

function ChatPanel({ sessions, hostId }: { sessions: ChatSession[]; hostId: string }) {
  const [activeSession, setActiveSession] = useState<string | null>(
    sessions.find((s) => s.status === "WAITING")?.id ?? sessions[0]?.id ?? null
  );
  const [messages, setMessages] = useState<Array<{ id: string; senderRole: string; content: string; createdAt: string }>>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!activeSession) return;
    const r = await fetch(`/api/v1/host/chat/sessions/${activeSession}/messages`);
    const d = await r.json();
    if (d.ok) {
      setMessages(d.data);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSession]);

  useEffect(() => {
    loadMessages();
    const iv = setInterval(loadMessages, 4000);
    return () => clearInterval(iv);
  }, [loadMessages]);

  async function sendReply() {
    if (!reply.trim() || !activeSession) return;
    setSending(true);
    await fetch(`/api/v1/host/chat/sessions/${activeSession}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: reply, senderRole: "HOST" }),
    });
    setReply("");
    setSending(false);
    loadMessages();
  }

  if (!sessions.length) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0", color: "#374151", fontSize: 13 }}>
        No open chat sessions
      </div>
    );
  }

  const current = sessions.find((s) => s.id === activeSession);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 340 }}>
      {/* Session tabs */}
      {sessions.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: activeSession === s.id ? "rgba(255,255,255,0.1)" : "transparent",
                border: activeSession === s.id ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                color: s.status === "WAITING" ? "#fbbf24" : "#9ca3af",
                cursor: "pointer", position: "relative",
              }}
            >
              {s.guestName}
              {s.status === "WAITING" && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", display: "inline-block", marginLeft: 6 }} />
              )}
            </button>
          ))}
        </div>
      )}

      {current && (
        <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 12 }}>
          {current.guestName}
          {current.guestPhone && <a href={`tel:${current.guestPhone}`} style={{ color: "#60a5fa", marginLeft: 10, textDecoration: "none" }}>📞 Call {current.guestPhone}</a>}
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", marginBottom: 12,
        display: "flex", flexDirection: "column", gap: 8, maxHeight: 280,
      }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              justifyContent: m.senderRole === "HOST" ? "flex-end" : "flex-start",
            }}
          >
            <div style={{
              maxWidth: "80%",
              background: m.senderRole === "HOST"
                ? "rgba(200,169,110,0.15)"
                : m.senderRole === "BOT"
                ? "rgba(107,114,128,0.12)"
                : "rgba(255,255,255,0.07)",
              border: m.senderRole === "HOST"
                ? "1px solid rgba(200,169,110,0.3)"
                : "1px solid rgba(255,255,255,0.08)",
              borderRadius: m.senderRole === "HOST" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              padding: "9px 13px",
              fontSize: 13,
              color: m.senderRole === "HOST" ? "#c8a96e" : "#d1d5db",
            }}>
              {m.senderRole === "BOT" && <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 3 }}>Bot</div>}
              {m.content}
              <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4, textAlign: "right" }}>
                {elapsed(m.createdAt)}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendReply()}
          placeholder="Reply to guest…"
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            padding: "10px 14px",
            color: "white",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={sendReply}
          disabled={sending || !reply.trim()}
          style={{
            padding: "10px 16px", borderRadius: 10,
            background: reply.trim() ? "rgba(200,169,110,0.2)" : "rgba(255,255,255,0.04)",
            border: reply.trim() ? "1px solid rgba(200,169,110,0.4)" : "1px solid rgba(255,255,255,0.08)",
            color: reply.trim() ? "#c8a96e" : "#4b5563",
            cursor: reply.trim() ? "pointer" : "not-allowed",
            fontSize: 13, fontWeight: 700,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function HostDashboardClient() {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"queue" | "chat" | "referral">("queue");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showScanner, setShowScanner] = useState(false);
  // Holds the raw decoded code from the QR camera so ScanResultModal
  // can resolve it via /api/v1/host/scan and show the right action panel
  // (reservation arrive/seat or ticket check-in). Null means "no scan
  // pending" — the modal is unmounted entirely so its state resets
  // between scans.
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [shiftOn, setShiftOn] = useState<boolean | null>(null);
  const [shiftToggling, setShiftToggling] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/host/me");
      const json = await r.json();
      if (!json.ok) throw new Error(json.error || "Failed to load");
      setData(json.data);
      setLastUpdated(new Date());
      setError("");
      // Load shift status for streetside hosts
      const userRoles: string[] = json.data?.user?.roles ?? [];
      if (userRoles.includes("STREETSIDE_HOST")) {
        const tr = await fetch("/api/v1/host/streetside-team");
        const td = await tr.json();
        if (td.ok) {
          const self = (td.team as Array<{ isSelf: boolean; isOnShift: boolean }>).find((m) => m.isSelf);
          if (self) setShiftOn(self.isOnShift);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  async function toggleShift() {
    if (shiftOn === null) return;
    setShiftToggling(true);
    try {
      const r = await fetch("/api/v1/host/my-shift", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnShift: !shiftOn }),
      });
      const d = await r.json();
      if (d.ok) setShiftOn(d.isOnShift);
    } finally {
      setShiftToggling(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 20_000);
    return () => clearInterval(iv);
  }, [load]);

  async function handleAction(id: string, status: string, extra?: Record<string, string>) {
    await fetch(`/api/v1/host/bookings/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    await load();
  }

  const t = useTranslation();

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0f" }}>
      <div style={{ color: "#6b7280", fontSize: 14 }}>Loading…</div>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0f", flexDirection: "column", gap: 12 }}>
      <div style={{ color: "#f87171", fontSize: 14 }}>{error || "Unable to load"}</div>
      <button onClick={load} style={{ padding: "8px 20px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "white", cursor: "pointer" }}>{t("host", "actions.retry")}</button>
    </div>
  );

  const { user, hostProfile, todayReservations, chatSessions, commissions } = data;
  const closedReservations = data.closedReservations ?? [];
  const hostUserNameById = data.hostUserNameById ?? {};
  const roles = user.roles;
  const isRestaurantHost = roles.some((r) => ["RESTAURANT_HOST", "SUPERADMIN"].includes(r));
  const isStreetsideHost = roles.includes("STREETSIDE_HOST");
  const hasReferrals = (hostProfile?.referrerAssignments ?? []).length > 0;

  // True when ANY of the three attribution chains identifies a referrer
  // or host: legacy `attributions[].referrer`, new `referralActor` /
  // `legacyReferrer`, or a HOST_WALKIN session with hostUserId set. This
  // is what the referral panel filters on so QR-driven and host-walked
  // bookings both surface, regardless of which resolution path fired.
  function hasAttributionChain(r: Reservation): boolean {
    if (r.attributions[0]?.referrer != null) return true;
    const s = r.attributionSession;
    if (!s) return false;
    if (s.referralActor || s.legacyReferrer) return true;
    if (s.source === "HOST_WALKIN" && s.hostUserId) return true;
    return false;
  }

  // Stats
  const pending   = todayReservations.filter((r) => r.status === "PENDING").length;
  const confirmed = todayReservations.filter((r) => ["CONFIRMED", "ACKNOWLEDGED"].includes(r.status)).length;
  const arrived   = todayReservations.filter((r) => r.status === "ARRIVED").length;
  const seated    = todayReservations.filter((r) => r.status === "SEATED").length;
  const lost      = todayReservations.filter((r) => r.status === "NO_SHOW").length;
  const closedCount = closedReservations.length;
  const waitingChats = chatSessions.filter((s) => s.status === "WAITING").length;
  const referredReservations = todayReservations.filter(hasAttributionChain);
  const referralCount = referredReservations.length;

  // Filtered reservations. CLOSED is special: it pulls from the 7-day
  // closedReservations payload rather than today's queue, so older
  // closed tables remain reachable for a week without polluting Active.
  const filteredReservations = filterStatus === "CLOSED"
    ? closedReservations
    : filterStatus === "all"
    ? todayReservations.filter((r) => !["COMPLETED", "CANCELLED"].includes(r.status))
    : filterStatus === "CONFIRMED"
    ? todayReservations.filter((r) => ["CONFIRMED", "ACKNOWLEDGED"].includes(r.status))
    : todayReservations.filter((r) => r.status === filterStatus);

  // Today's same-day finished/cancelled rows shown beneath the active
  // queue. Hidden when CLOSED filter is active because the closed list
  // already shows that data (and more, going back 7 days).
  const doneReservations = filterStatus === "CLOSED"
    ? []
    : todayReservations.filter((r) => ["COMPLETED", "CANCELLED"].includes(r.status));

  const STATUS_FILTERS = ["all", "PENDING", "CONFIRMED", "ARRIVED", "SEATED", "CLOSED"];

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", color: "white" }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(13,13,15,0.92)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 20px",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Brandmark size={20} color="#e8d9b3" showTagline={false} />
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#c8a96e" }}>
              {isRestaurantHost ? t("host", "roleBadge.restaurantHost") : t("host", "roleBadge.host")}
            </span>
            <Link href="/" style={{ fontSize: 11, color: "#4b5563", textDecoration: "none", padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)", letterSpacing: "0.03em" }}>
              {t("host", "platform")}
            </Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setShowScanner(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "rgba(200,169,110,0.1)", border: "1px solid rgba(200,169,110,0.3)",
                borderRadius: 9, padding: "6px 12px", color: "#c8a96e",
                cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/>
              </svg>
              {t("host", "scanQr")}
            </button>
            {lastUpdated && (
              <div style={{ fontSize: 10, color: "#374151" }}>
                {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </div>
            )}
            <div style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600, color: "#d1d5db",
            }}>
              {hostProfile?.displayName ?? user.name}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            fontFamily: "var(--font-heading)", fontSize: "clamp(22px, 5vw, 28px)",
            fontWeight: 600, color: "white", letterSpacing: "-0.02em", margin: "0 0 4px",
          }}>
            {t("host", `greeting.${getGreeting()}`)}, {(hostProfile?.displayName ?? user.name ?? "").split(" ")[0]}.
          </h1>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            {todayLabel()}
            {data.venue && <span style={{ color: "#374151", marginLeft: 8 }}>· {data.venue.name}</span>}
          </div>
        </div>

        {/* Shift clock-in/out — streetside hosts only */}
        {isStreetsideHost && shiftOn !== null && (
          <div style={{
            marginBottom: 20,
            padding: "12px 16px",
            background: shiftOn ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${shiftOn ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: shiftOn ? "#34d399" : "#374151", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: shiftOn ? "#34d399" : "#6b7280" }}>
                  {shiftOn ? t("host", "shift.onShift") : t("host", "shift.offShift")}
                </div>
                <div style={{ fontSize: 11, color: "#4b5563" }}>
                  {t("host", "shift.visibility")}
                </div>
              </div>
            </div>
            <button
              onClick={toggleShift}
              disabled={shiftToggling}
              style={{
                padding: "7px 16px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 11, cursor: shiftToggling ? "not-allowed" : "pointer",
                background: shiftOn ? "rgba(248,113,113,0.15)" : "rgba(52,211,153,0.15)",
                color: shiftOn ? "#f87171" : "#34d399",
                opacity: shiftToggling ? 0.6 : 1, letterSpacing: "0.04em",
              }}
            >
              {shiftToggling ? t("host", "shift.updating") : shiftOn ? t("host", "shift.clockOut") : t("host", "shift.clockIn")}
            </button>
          </div>
        )}

        {/* Stats strip — clickable filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
          {[
            { labelKey: "stats.pending",   value: pending,      color: "#fbbf24", filter: "PENDING",   tab: "queue" as const },
            { labelKey: "stats.confirmed", value: confirmed,    color: "#60a5fa", filter: "CONFIRMED",  tab: "queue" as const },
            { labelKey: "stats.arrived",   value: arrived,      color: "#34d399", filter: "ARRIVED",    tab: "queue" as const },
            { labelKey: "stats.seated",    value: seated,       color: "#10b981", filter: "SEATED",     tab: "queue" as const },
            { labelKey: "stats.lost",      value: lost,         color: "#f87171", filter: "NO_SHOW",    tab: "queue" as const },
            ...(waitingChats > 0 ? [{ labelKey: "stats.chats", value: waitingChats, color: "#a78bfa", filter: "chats", tab: "chat" as const }] : []),
          ].map((s) => {
            const isActive = s.tab === "chat"
              ? activeTab === "chat"
              : activeTab === "queue" && filterStatus === s.filter;
            return (
              <button
                key={s.filter}
                onClick={() => {
                  if (s.tab === "chat") {
                    setActiveTab("chat");
                  } else {
                    setActiveTab("queue");
                    setFilterStatus((prev) => prev === s.filter ? "all" : s.filter);
                  }
                }}
                style={{
                  minWidth: 70, flex: "0 0 auto",
                  background: isActive ? `${s.color}22` : `${s.color}0d`,
                  border: isActive ? `1.5px solid ${s.color}70` : `1px solid ${s.color}30`,
                  borderRadius: 11, padding: "10px 14px", textAlign: "center",
                  cursor: "pointer", transition: "all 0.15s",
                  outline: "none",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: isActive ? s.color : "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 1, fontWeight: isActive ? 700 : 400 }}>{t("host", s.labelKey)}</div>
              </button>
            );
          })}
        </div>

        {/* Tab nav — Queue · Chat · Referral in one row */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4 }}>
          {([
            { key: "queue",    labelKey: "tabs.queue",    badge: pending + confirmed + arrived, badgeColor: "#fbbf24" },
            { key: "chat",     labelKey: "tabs.chat",     badge: waitingChats,                  badgeColor: "#a78bfa" },
            { key: "referral", labelKey: "tabs.referral", badge: referralCount,                 badgeColor: "#c8a96e" },
          ] as { key: string; labelKey: string; badge: number; badgeColor: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 9, border: "none",
                background: activeTab === tab.key ? "rgba(255,255,255,0.1)" : "transparent",
                color: activeTab === tab.key ? "white" : "#6b7280",
                fontWeight: activeTab === tab.key ? 700 : 500,
                fontSize: 13, cursor: "pointer", position: "relative",
              }}
            >
              {t("host", tab.labelKey)}
              {tab.badge > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 800,
                  color: activeTab === tab.key ? tab.badgeColor : "#6b7280",
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Queue tab */}
        {activeTab === "queue" && (
          <div>
            {/* Status filter pills */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
              {STATUS_FILTERS.map((f) => {
                // CLOSED uses the COMPLETED meta swatch (grey) since both
                // signal "table done" — just sourced from a longer window.
                const meta = f === "CLOSED" ? STATUS_META["COMPLETED"] : STATUS_META[f];
                const count = f === "all"
                  ? todayReservations.filter((r) => !["COMPLETED","CANCELLED"].includes(r.status)).length
                  : f === "CLOSED"
                  ? closedCount
                  : todayReservations.filter((r) => r.status === f).length;
                const label = f === "all"
                  ? t("host", "filters.all")
                  : f === "CLOSED"
                  ? "Closed"
                  : t("host", STATUS_LABEL_KEYS[f] ?? "filters.all");
                return (
                  <button
                    key={f}
                    onClick={() => setFilterStatus(f)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      whiteSpace: "nowrap", cursor: "pointer",
                      background: filterStatus === f ? (meta?.bg ?? "rgba(255,255,255,0.1)") : "transparent",
                      border: filterStatus === f ? `1px solid ${meta?.border ?? "rgba(255,255,255,0.15)"}` : "1px solid rgba(255,255,255,0.07)",
                      color: filterStatus === f ? (meta?.color ?? "white") : "#6b7280",
                    }}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>

            {filteredReservations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#374151", fontSize: 13 }}>
                {filterStatus === "all"
                  ? t("host", "queue.noActive")
                  : filterStatus === "CLOSED"
                  ? "No tables closed in the last 7 days."
                  : t("host", "queue.noStatus", { status: t("host", STATUS_LABEL_KEYS[filterStatus] ?? "filters.all").toLowerCase() })}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredReservations.map((r) => (
                  <ReservationCard key={r.id} res={r} onAction={handleAction} />
                ))}
              </div>
            )}

            {doneReservations.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#1f2937", marginBottom: 12 }}>
                  {t("host", "queue.completedTitle")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {doneReservations.map((r) => (
                    <ReservationCard key={r.id} res={r} onAction={handleAction} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat tab */}
        {activeTab === "chat" && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16, padding: 20,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 16 }}>
              {t("host", "tabs.liveChat")}
              {waitingChats > 0 && (
                <span style={{ marginLeft: 8, color: "#fbbf24" }}>— {waitingChats} {t("host", "tabs.waiting")}</span>
              )}
            </div>
            <ChatPanel sessions={chatSessions} hostId={user.id} />
          </div>
        )}

        {/* Referral tab */}
        {activeTab === "referral" && (
          <div>
            {/* Summary banner */}
            {referralCount > 0 && (
              <div style={{
                background: "rgba(200,169,110,0.08)", border: "1px solid rgba(200,169,110,0.2)",
                borderRadius: 12, padding: "12px 16px", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#c8a96e" }}>{referralCount}</span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{t("host", "referral.totalToday")}</span>
              </div>
            )}

            {/* Today's referred guests */}
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 12 }}>
              {t("host", "referral.todayReferrals")}
            </div>

            {referredReservations.length === 0 ? (
              <div style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, padding: "28px 20px", textAlign: "center",
                color: "#4b5563", fontSize: 13, marginBottom: 24,
              }}>
                {t("host", "referral.noReferrals")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {referredReservations.map((r) => {
                  // Three-source resolution mirroring hasAttributionChain.
                  // Prefers the legacy join (richest data — has rapport
                  // hints), then the new chain's actor/referrer rows,
                  // then a HOST_WALKIN host-name fallback.
                  const legacyRef = r.attributions[0]?.referrer ?? null;
                  const sess = r.attributionSession ?? null;
                  const refName: string =
                    legacyRef?.fullName
                      ?? sess?.legacyReferrer?.fullName
                      ?? sess?.referralActor?.displayName
                      ?? (sess?.source === "HOST_WALKIN" && sess?.hostUserId
                          ? (hostUserNameById[sess.hostUserId] ?? "your team")
                          : "—");
                  const refType: string =
                    legacyRef?.referrerType
                      ?? sess?.legacyReferrer?.referrerType
                      ?? (sess?.referralActor?.actorType
                          ? `actor · ${sess.referralActor.actorType.replace(/_/g, " ").toLowerCase()}`
                          : (sess?.source === "HOST_WALKIN" ? "STREETSIDE_HOST" : "REFERRER"));
                  const hint = REFERRER_HINTS[refType] ?? REFERRER_HINTS["STREETSIDE_HOST"];
                  const statusMeta = STATUS_META[r.status] ?? STATUS_META["PENDING"];
                  return (
                    <div key={r.id} style={{
                      background: "rgba(200,169,110,0.05)", border: "1px solid rgba(200,169,110,0.15)",
                      borderRadius: 14, padding: "14px 16px",
                    }}>
                      {/* Guest row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: "white", fontSize: 14 }}>{r.contactName}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span>{formatTime(r.reservationDate)}</span>
                            {r.partySize ? <span>· {r.partySize} guests</span> : null}
                            {r.confirmationCode && (
                              // Monospace confirmation code — primary
                              // way the host confirms a guest's booking
                              // when they arrive showing only their email.
                              <span style={{
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                fontSize: 10, fontWeight: 700, color: "#c8a96e",
                                background: "rgba(200,169,110,0.08)",
                                border: "1px solid rgba(200,169,110,0.2)",
                                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.04em",
                              }}>
                                {r.confirmationCode}
                              </span>
                            )}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20,
                          background: statusMeta.bg, border: `1px solid ${statusMeta.border}`, color: statusMeta.color,
                        }}>
                          {r.status}
                        </span>
                      </div>

                      {/* Referrer chip */}
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: "rgba(200,169,110,0.1)", border: "1px solid rgba(200,169,110,0.25)",
                        borderRadius: 8, padding: "5px 10px", marginBottom: 10,
                      }}>
                        <span style={{ fontSize: 14 }}>{hint?.icon ?? "👤"}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#c8a96e" }}>{t("host", "referral.via")} {refName}</div>
                          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{refType.replace(/_/g, " ")}</div>
                        </div>
                      </div>

                      {/* Rapport tip */}
                      {hint && REFERRER_HINTS[refType] && (
                        <div style={{
                          background: "rgba(255,255,255,0.04)", borderRadius: 8,
                          padding: "8px 12px", marginBottom: r.notes || r.occasion ? 8 : 0,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#c8a96e", marginBottom: 4 }}>
                            {t("host", "referral.rapportTip")}
                          </div>
                          <div style={{ fontSize: 12, color: "#d1d5db", fontStyle: "italic" }}>
                            {t("host", `rapportHints.${refType}`)}
                          </div>
                        </div>
                      )}

                      {/* Occasion + Notes */}
                      {(r.occasion || r.notes) && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                          {r.occasion && (
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>
                              <span style={{ color: "#6b7280", marginRight: 4 }}>{t("host", "referral.occasionLabel")}:</span>
                              {r.occasion}
                            </div>
                          )}
                          {r.notes && (
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>
                              <span style={{ color: "#6b7280", marginRight: 4 }}>{t("host", "referral.notesLabel")}:</span>
                              {r.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Host's referrer partners */}
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 12 }}>
              {t("host", "referral.yourReferrers")}
            </div>

            {(hostProfile?.referrerAssignments ?? []).length === 0 ? (
              <div style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, padding: "20px", textAlign: "center", color: "#4b5563", fontSize: 13,
              }}>
                {t("host", "referral.noPartners")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(hostProfile?.referrerAssignments ?? []).map((ra) => (
                  <div key={ra.id} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 12, padding: "12px 16px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "white", fontSize: 13 }}>{ra.displayName}</div>
                      {ra.series && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{ra.series.title}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#c8a96e", letterSpacing: "0.06em" }}>{ra.referralCode}</div>
                      {ra.commissionShareBps && (
                        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                          {(ra.commissionShareBps / 100).toFixed(0)}% {t("host", "referral.commission")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick nav */}
        <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
          <Link href="/host/streetside" style={{ textDecoration: "none", flex: 1 }}>
            <div style={{
              background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)",
              borderRadius: 12, padding: "13px 16px", cursor: "pointer",
            }}>
              <div style={{ fontWeight: 700, color: "#a78bfa", fontSize: 12 }}>{t("host", "quickNav.streetsideForm")}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{t("host", "quickNav.streetsideDesc")}</div>
            </div>
          </Link>
          <Link href="/host/operations" style={{ textDecoration: "none", flex: 1 }}>
            <div style={{
              background: "rgba(200,169,110,0.07)", border: "1px solid rgba(200,169,110,0.2)",
              borderRadius: 12, padding: "13px 16px", cursor: "pointer",
            }}>
              <div style={{ fontWeight: 700, color: "#c8a96e", fontSize: 12 }}>{t("host", "quickNav.operationsBoard")}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{t("host", "quickNav.operationsDesc")}</div>
            </div>
          </Link>
          <Link href="/host/mobile" style={{ textDecoration: "none", flex: 1 }}>
            <div style={{
              background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)",
              borderRadius: 12, padding: "13px 16px", cursor: "pointer",
            }}>
              <div style={{ fontWeight: 700, color: "#60a5fa", fontSize: 12 }}>{t("host", "quickNav.mobileView")}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{t("host", "quickNav.mobileDesc")}</div>
            </div>
          </Link>
        </div>
      </main>

      {showScanner && (
        <Suspense fallback={null}>
          <QRScanner
            onScan={(result) => {
              // Close the camera and hand the decoded code off to
              // ScanResultModal — that component owns lookup + actions.
              setShowScanner(false);
              setScannedCode(result.trim());
            }}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}

      {scannedCode && (
        <ScanResultModal
          code={scannedCode}
          onClose={() => setScannedCode(null)}
          onMutated={load}
        />
      )}
    </div>
  );
}
