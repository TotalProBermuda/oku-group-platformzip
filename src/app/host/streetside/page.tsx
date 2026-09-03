"use client";

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import Brandmark from "@/components/Brandmark";
import Link from "next/link";
import { useTranslation, useLocale, persistLocale } from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/types/i18n";
import { SUPPORTED_LOCALES } from "@/types/i18n";
import { GuestQRPanel } from "@/components/referral/GuestQRPanel";
import { isHistoryRow, terminalStatusesForSurface } from "@/lib/referrals/statusPolicy";

const QRScanner = lazy(() => import("@/components/host/QRScanner"));
const MenuView = lazy(() => import("@/components/menu/MenuView"));

type MenuVenueSlug = "oku" | "catch" | "terrace";
function conceptToVenueSlug(conceptKey: string): MenuVenueSlug | null {
  const k = (conceptKey || "").toUpperCase();
  if (k === "OKU") return "oku";
  if (k === "CATCH") return "catch";
  if (k === "TERRACE") return "terrace";
  return null;
}

const CONCEPTS = [
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

const LOSS_REASONS: { key: string }[] = [
  { key: "WAIT_TOO_LONG" },
  { key: "TABLE_NOT_READY" },
  { key: "PREFERRED_SEATING_UNAVAILABLE" },
  { key: "GROUP_TOO_LARGE" },
  { key: "NOT_INTERESTED_IN_MENU" },
  { key: "PRICE_CONCERN" },
  { key: "WENT_ELSEWHERE" },
  { key: "CHANGED_MIND" },
  { key: "OTHER" },
];

const STATUS_META: Record<string, { tKey: string; color: string; bg: string }> = {
  PENDING:      { tKey: "streetForm.statusMeta.PENDING",      color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  CONFIRMED:    { tKey: "streetForm.statusMeta.CONFIRMED",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  ACKNOWLEDGED: { tKey: "streetForm.statusMeta.ACKNOWLEDGED", color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  ARRIVED:      { tKey: "streetForm.statusMeta.ARRIVED",      color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  SEATED:       { tKey: "streetForm.statusMeta.SEATED",       color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  NO_SHOW:      { tKey: "streetForm.statusMeta.NO_SHOW",      color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  CANCELLED:    { tKey: "streetForm.statusMeta.CANCELLED",    color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  COMPLETED:    { tKey: "streetForm.statusMeta.COMPLETED",    color: "#9ca3af", bg: "rgba(156,163,175,0.08)" },
};

type Booking = {
  id: string;
  contactName: string;
  partySize: number;
  status: string;
  conceptRequested: string | null;
  reservationDate: string;
  occasion: string | null;
  notes: string | null;
  createdAt: string;
  zone: { name: string; conceptKey: string } | null;
  handoffs: Array<{ handoffStatus: string }>;
  statusLogs: Array<{ toStatus: string; changedAt: string }>;
  // v2 deterministic trust chain (Task #55) — present once an
  // attribution session has been minted (checkin/walkin/booking).
  attributionSession?: {
    id: string;
    bookingCode: string;
    // Lifecycle + earner taxonomy (Bucket A2). Optional for backwards
    // compatibility with any cached payloads from the previous build.
    status?:
      | "CAPTURED"
      | "SEATED"
      | "POS_BIND_INTENT_RECORDED"
      | "BOUND_TO_POS"
      | "VERIFIED_POS_SALE"
      | "CANCELED"
      | "EXPIRED";
    source?: "QR_RESERVATION" | "HOST_CHECKIN" | "HOST_WALKIN" | "MANUAL_ADMIN";
    invuOrderId?: string | null;
    bindMethod?: string | null;
    referralActor?: { id: string; displayName: string; actorType: string } | null;
    legacyReferrer?: { id: string; fullName: string; referralCode: string } | null;
    // tableSession + bindings are only included by /api/v1/host/bookings.
    // The /api/v1/host/me feed (loadBookings) omits both, so they are
    // optional on the client and every read must stay defensive
    // (session?.tableSession?..., session?.bindings?.[0]).
    tableSession?: {
      id: string;
      openedInvuOrderId: string | null;
      invuReferenceField: string | null;
      invuReferenceWritten: boolean;
      syncStatus: string;
      matchStatus: string;
    } | null;
    bindings?: Array<{ id: string; invuOrderId: string; bindingType: string; createdAt: string }>;
  } | null;
};

/**
 * 3-tier referrer resolver — same precedence used by the Operations Board:
 *   1. ReferralActor (modern unified taxonomy)
 *   2. Referrer (legacy referrer table)
 *   3. null — QR self-serve or unknown source
 */
// A booking is "closed" (history) when it hits a terminal status OR its Panama
// service day has already passed. Otherwise it is active (incl. future-dated).
//
// The active/history split is GOVERNED by the shared policy in
// `@/lib/referrals/statusPolicy` — the streetside host must NOT define its own
// terminal statuses. It passes the explicit "STREETSIDE" surface policy, which
// is where SEATED is declared terminal (once the guest is seated the handoff is
// complete). Every other referrer surface uses the DEFAULT policy, so the two
// can never silently drift (Task #140).
function isBookingClosed(b: Booking, nowIso: string): boolean {
  return isHistoryRow(b.status, b.reservationDate, nowIso, "STREETSIDE");
}

function resolveReferrerLabel(s: NonNullable<Booking["attributionSession"]>): string | null {
  if (s.referralActor) {
    return `${s.referralActor.displayName} · ${s.referralActor.actorType}`;
  }
  if (s.legacyReferrer) {
    return `${s.legacyReferrer.fullName} · ${s.legacyReferrer.referralCode}`;
  }
  return null;
}

function elapsed(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 16,
      padding: "18px 20px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function BookingCard({ booking, onUpdateStatus, onBindUpdated, isOperational }: {
  booking: Booking;
  onUpdateStatus: (id: string, status: string, lossReason?: string) => Promise<void>;
  onBindUpdated?: () => void;
  isOperational: boolean;
}) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showLoss, setShowLoss] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showBindForm, setShowBindForm] = useState(false);
  const [invuOrderId, setInvuOrderId] = useState("");
  const [binding, setBinding] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);

  const session = booking.attributionSession ?? null;
  const boundOrderId =
    session?.tableSession?.openedInvuOrderId ??
    session?.bindings?.[0]?.invuOrderId ??
    null;
  // Referral-only (non-operational) hosts never bind: INVU table control is a
  // restaurant-host/admin capability, enforced server-side too.
  const canBind = isOperational && session?.status === "SEATED" && !boundOrderId;
  const referrerLabel = session ? resolveReferrerLabel(session) : null;

  async function submitBind() {
    if (!session || !invuOrderId.trim()) return;
    setBinding(true);
    setBindError(null);
    try {
      const res = await fetch("/api/v1/host/table-open-bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributionSessionId: session.id,
          invuOrderId: invuOrderId.trim(),
          bindingType: "TABLE_OPEN_BINDING",
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d?.error ?? "Bind failed");
      setShowBindForm(false);
      setInvuOrderId("");
      onBindUpdated?.();
    } catch (e) {
      setBindError(e instanceof Error ? e.message : "Bind failed");
    } finally {
      setBinding(false);
    }
  }
  const meta = STATUS_META[booking.status] ?? STATUS_META["PENDING"];
  const metaLabel = t("host", meta.tKey);
  const concept = CONCEPTS.find((c) => c.key === booking.conceptRequested);
  // Terminal set is GOVERNED by the shared policy — the streetside host must not
  // keep its own list (Task #140, item 1). STREETSIDE adds SEATED to the base
  // terminal statuses, matching how isBookingClosed splits active vs history.
  const isFinal = terminalStatusesForSurface("STREETSIDE").has(booking.status);

  async function transition(status: string, lossReason?: string) {
    setUpdating(true);
    await onUpdateStatus(booking.id, status, lossReason);
    setUpdating(false);
    setShowLoss(false);
    setExpanded(false);
  }

  return (
    <div style={{
      background: meta.bg,
      border: `1px solid ${meta.color}33`,
      borderRadius: 14,
      overflow: "hidden",
    }}>
      <div
        onClick={() => !isFinal && setExpanded((v) => !v)}
        style={{
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: isFinal ? "default" : "pointer",
        }}
      >
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: concept ? `${concept.color}22` : "rgba(255,255,255,0.06)",
          border: `1px solid ${concept?.color ?? "#374151"}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          fontWeight: 800, fontSize: 15,
          color: concept?.color ?? "#9ca3af",
        }}>
          {booking.partySize}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "white", fontSize: 15, marginBottom: 3 }}>
            {booking.contactName}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {concept && concept.key && (
              <span style={{ color: concept.color }}>{concept.label}</span>
            )}
            {booking.occasion && booking.occasion !== "None" && (
              <span style={{ color: "#6b7280" }}>· {booking.occasion}</span>
            )}
            <span style={{ color: "#4b5563" }}>{elapsed(booking.createdAt)}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{
            padding: "4px 10px", borderRadius: 20,
            background: meta.bg,
            border: `1px solid ${meta.color}55`,
            fontSize: 11, fontWeight: 700,
            color: meta.color,
            whiteSpace: "nowrap",
          }}>
            {metaLabel}
          </div>
          {boundOrderId && (
            <div style={{
              padding: "2px 8px", borderRadius: 12,
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.4)",
              fontSize: 10, fontWeight: 700, color: "#10b981",
              whiteSpace: "nowrap",
            }}>
              Bound · #{boundOrderId}
            </div>
          )}
          {referrerLabel && (
            <div
              title="Earner attributed to this booking"
              style={{
                padding: "2px 8px",
                borderRadius: 12,
                background: "rgba(96,165,250,0.1)",
                border: "1px solid rgba(96,165,250,0.4)",
                fontSize: 10,
                fontWeight: 700,
                color: "#60a5fa",
                whiteSpace: "nowrap",
              }}
            >
              {referrerLabel}
            </div>
          )}
        </div>
      </div>

      {expanded && !isFinal && (
        <div style={{
          borderTop: `1px solid ${meta.color}22`,
          padding: "14px 16px",
          background: "rgba(0,0,0,0.2)",
        }}>
          {booking.notes && (
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
              "{booking.notes}"
            </div>
          )}

          {showBindForm && canBind && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.06)" }}>
              <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Bind INVU order · {session?.bookingCode}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={invuOrderId}
                  onChange={(e) => setInvuOrderId(e.target.value)}
                  placeholder="INVU order id (e.g. 4831)"
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8,
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "white", fontSize: 13, outline: "none",
                  }}
                />
                <button
                  disabled={binding || !invuOrderId.trim()}
                  onClick={submitBind}
                  style={{
                    background: "rgba(251,191,36,0.2)",
                    border: "1px solid rgba(251,191,36,0.5)",
                    borderRadius: 8, padding: "0 14px",
                    color: "#fbbf24", fontSize: 12, fontWeight: 700,
                    cursor: binding ? "not-allowed" : "pointer",
                    opacity: binding ? 0.5 : 1,
                  }}
                >
                  {binding ? "Binding…" : "Bind"}
                </button>
                <button
                  onClick={() => { setShowBindForm(false); setBindError(null); }}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, padding: "0 12px",
                    color: "#6b7280", fontSize: 12, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
              {bindError && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#f87171" }}>{bindError}</div>
              )}
            </div>
          )}

          {isOperational ? (
            !showLoss ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!["CONFIRMED", "ACKNOWLEDGED", "ARRIVED", "SEATED"].includes(booking.status) && (
                  <ActionButton label={t("host", "actions.confirm")} color="#60a5fa" disabled={updating} onClick={() => transition("CONFIRMED")} />
                )}
                {["CONFIRMED", "ACKNOWLEDGED"].includes(booking.status) && (
                  <ActionButton label={t("host", "actions.arrived")} color="#34d399" disabled={updating} onClick={() => transition("ARRIVED")} />
                )}
                {["ARRIVED", "ACKNOWLEDGED"].includes(booking.status) && (
                  <ActionButton label={t("host", "actions.seat")} color="#10b981" disabled={updating} onClick={() => transition("SEATED")} />
                )}
                {canBind && (
                  <ActionButton
                    label="Bind opened INVU check"
                    color="#fbbf24"
                    disabled={binding}
                    onClick={() => setShowBindForm(true)}
                  />
                )}
                <ActionButton label={t("host", "actions.lost")} color="#f87171" disabled={updating} onClick={() => setShowLoss(true)} />
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700, marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {t("host", "streetForm.lossTitle")}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {LOSS_REASONS.map((r) => (
                    <button
                      key={r.key}
                      disabled={updating}
                      onClick={() => transition("NO_SHOW", r.key)}
                      style={{
                        background: "rgba(248,113,113,0.1)",
                        border: "1px solid rgba(248,113,113,0.3)",
                        borderRadius: 8, padding: "6px 12px",
                        color: "#f87171", fontSize: 12, cursor: "pointer",
                      }}
                    >
                      {t("host", `loss.${r.key}`)}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowLoss(false)}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8, padding: "6px 12px",
                      color: "#6b7280", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {t("host", "actions.cancel")}
                  </button>
                </div>
              </div>
            )
          ) : (
            // Referral-only host: read-only revenue status. No operational
            // controls — spend + commission are confirmed by the venue host /
            // admin close-of-sale flow, then surfaced in the shared payout ledger.
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{
                alignSelf: "flex-start",
                padding: "4px 10px", borderRadius: 20,
                background: boundOrderId ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.12)",
                border: `1px solid ${boundOrderId ? "rgba(16,185,129,0.4)" : "rgba(148,163,184,0.35)"}`,
                fontSize: 11, fontWeight: 700,
                color: boundOrderId ? "#10b981" : "#94a3b8",
                whiteSpace: "nowrap",
              }}>
                {boundOrderId ? t("host", "readonly.awaitingPayout") : t("host", "readonly.pendingClose")}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                {t("host", "readonly.revenueNote")}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, color, disabled, onClick }: {
  label: string; color: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        background: `${color}18`,
        border: `1px solid ${color}55`,
        borderRadius: 10,
        padding: "8px 14px",
        color,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        letterSpacing: "0.03em",
      }}
    >
      {label}
    </button>
  );
}

// GuestQRPanel was extracted to `@/components/referral/GuestQRPanel` so that the
// streetside host page and every referrer dashboard render the SAME component.

type ScanConfig = {
  canScanMembers: boolean;
  canScanTickets: boolean;
  canScanReservationBlocks: boolean;
};

type CheckInResultData = {
  result: "VALID" | "ALREADY_CHECKED_IN" | "INVALID" | "EXPIRED";
  ticket?: {
    id: string;
    code: string;
    attendeeName: string | null;
    ticketType: { name: string; tierCode: string | null } | null;
    user: { id: string; name: string | null; email: string | null };
    session: { id: string; title: string | null; startsAt: string; series: { title: string } | null } | null;
    checkedInAt: string | null;
  };
  message: string;
  giftBagEnabled?: boolean;
  giftBagAlreadyGiven?: boolean;
};

type BlockResultData = {
  block: {
    id: string;
    groupLabel: string;
    expectedCount: number;
    giftBagEnabled: boolean;
    arrivals: Array<{ id: string; partySize: number }>;
  };
  totalArrived: number;
  expectedCount: number;
  giftBagEnabled: boolean;
};

function CheckInModal({
  result,
  onClose,
  giftBagEnabled,
  onGiftBag,
  giftBagDone,
}: {
  result: CheckInResultData;
  onClose: () => void;
  giftBagEnabled?: boolean;
  onGiftBag?: () => void;
  giftBagDone?: boolean;
}) {
  const t = useTranslation();
  const isValid = result.result === "VALID";
  const color = isValid ? "#10b981" : result.result === "ALREADY_CHECKED_IN" ? "#fbbf24" : "#f87171";
  const label = isValid
    ? (t("host", "scan.validResult") ?? "✓ VALID")
    : result.result === "ALREADY_CHECKED_IN"
      ? (t("host", "scan.alreadyCheckedIn") ?? "⚠ ALREADY CHECKED IN")
      : result.result === "EXPIRED"
        ? (t("host", "scan.expiredResult") ?? "✕ EXPIRED")
        : (t("host", "scan.invalidResult") ?? "✕ INVALID");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.93)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#1a1614", border: `1px solid ${color}44`, borderRadius: 20, padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color, letterSpacing: "0.04em", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>{result.message}</div>
        </div>

        {result.ticket && (
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "white", marginBottom: 6 }}>
              {result.ticket.attendeeName || result.ticket.user?.name || "Guest"}
            </div>
            {result.ticket.ticketType && (
              <div style={{ fontSize: 13, color: "#c8a96e", marginBottom: 4 }}>{result.ticket.ticketType.name}</div>
            )}
            {result.ticket.session && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {result.ticket.session.series?.title} · {new Date(result.ticket.session.startsAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </div>
            )}
            {result.ticket.checkedInAt && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                {new Date(result.ticket.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>
        )}

        {isValid && giftBagEnabled && (
          <button
            onClick={onGiftBag}
            disabled={giftBagDone}
            style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "none",
              background: giftBagDone ? "rgba(16,185,129,0.2)" : "rgba(200,169,110,0.18)",
              color: giftBagDone ? "#10b981" : "#c8a96e",
              fontSize: 14, fontWeight: 800, cursor: giftBagDone ? "default" : "pointer",
              marginBottom: 12, letterSpacing: "0.04em",
            }}
          >
            {giftBagDone
              ? (t("host", "scan.giftBagDone") ?? "🎁 Gift Bag Given ✓")
              : (t("host", "scan.giftBagButton") ?? "🎁 Mark Gift Bag Given")}
          </button>
        )}

        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)", color: "white",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {t("host", "scan.close") ?? "Close"}
        </button>
      </div>
    </div>
  );
}

function BlockModal({
  result,
  onClose,
  onMarkArrived,
  onGiftBag,
  giftBagDone,
  arriving,
  arrivalId,
}: {
  result: BlockResultData;
  onClose: () => void;
  onMarkArrived: (partySize: number) => void;
  onGiftBag?: () => void;
  giftBagDone?: boolean;
  arriving?: boolean;
  arrivalId?: string | null;
}) {
  const t = useTranslation();
  const [partySize, setPartySize] = useState(1);
  const pct = Math.min(100, Math.round((result.totalArrived / result.expectedCount) * 100));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.93)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#1a1614", border: "1px solid rgba(200,169,110,0.3)", borderRadius: 20, padding: 28 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>{t("host", "scan.reservationBlock") ?? "Reservation Block"}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#c8a96e" }}>{result.block.groupLabel}</div>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 0" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "white" }}>{result.totalArrived}</div>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("host", "scan.arrived") ?? "Arrived"}</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 0" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#9ca3af" }}>{result.expectedCount}</div>
            <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("host", "scan.expected") ?? "Expected"}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #c8a96e, #10b981)", borderRadius: 3, transition: "width 0.4s" }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{t("host", "scan.partySizeLabel") ?? "Party size arriving now:"}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setPartySize(n)}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 9,
                  background: partySize === n ? "rgba(200,169,110,0.2)" : "rgba(255,255,255,0.05)",
                  border: partySize === n ? "1px solid rgba(200,169,110,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  color: partySize === n ? "#c8a96e" : "#9ca3af",
                  fontWeight: 700, fontSize: 14, cursor: "pointer",
                }}
              >
                {n === 6 ? "6+" : n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => onMarkArrived(partySize)}
          disabled={arriving}
          style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: arriving ? "rgba(200,169,110,0.3)" : "linear-gradient(135deg, #c8a96e 0%, #a8894e 100%)",
            color: "#1a1614", fontSize: 14, fontWeight: 800, cursor: arriving ? "not-allowed" : "pointer",
            marginBottom: 12, letterSpacing: "0.04em",
          }}
        >
          {arriving ? (t("host", "scan.marking") ?? "Marking…") : (t("host", "scan.markArrived") ?? "✓ Mark Arrived")}
        </button>

        {result.giftBagEnabled && !!arrivalId && (
          <button
            onClick={onGiftBag}
            disabled={giftBagDone}
            style={{
              width: "100%", padding: "12px", borderRadius: 12, border: "none",
              background: giftBagDone ? "rgba(16,185,129,0.2)" : "rgba(200,169,110,0.12)",
              color: giftBagDone ? "#10b981" : "#c8a96e",
              fontSize: 13, fontWeight: 700, cursor: giftBagDone ? "default" : "pointer",
              marginBottom: 12,
            }}
          >
            {giftBagDone ? (t("host", "scan.giftBagsNoted") ?? "🎁 Gift Bags Noted ✓") : (t("host", "scan.recordGiftBags") ?? "🎁 Record Gift Bags")}
          </button>
        )}

        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)", color: "white",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          {t("host", "scan.close") ?? "Close"}
        </button>
      </div>
    </div>
  );
}

/**
 * Standalone menu slot for the Pure Referrer Console's "Menu" tab on streetside.
 * Has its own venue-pick state so it doesn't pollute the parent component.
 */
function StreetsideMenuContent() {
  const t = useTranslation();
  const locale = useLocale();
  const [menuVenuePick, setMenuVenuePick] = useState<MenuVenueSlug | null>(null);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af" }}>
          {t("host", "streetForm.menuTab.heading") ?? "Restaurant Menu"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["oku", "catch", "terrace"] as const).map((slug) => {
            const isActive = menuVenuePick === slug;
            return (
              <button
                key={slug}
                onClick={() => setMenuVenuePick(slug)}
                style={{
                  padding: "6px 12px", borderRadius: 8,
                  border: isActive ? "1px solid rgba(200,169,110,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  background: isActive ? "rgba(200,169,110,0.12)" : "rgba(255,255,255,0.03)",
                  color: isActive ? "#c8a96e" : "#9ca3af",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                  cursor: "pointer", textTransform: "uppercase",
                }}
              >
                {slug === "oku" ? "OKÜ" : slug.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>
      {menuVenuePick ? (
        <Suspense fallback={<div style={{ textAlign: "center", padding: "40px 0", color: "#4b5563", fontSize: 13 }}>{t("host", "streetForm.loading")}</div>}>
          <MenuView venueSlug={menuVenuePick} locale={locale as Locale} variant="embedded" showVenueHeading />
        </Suspense>
      ) : (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "#6b7280", fontSize: 13, background: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
          {t("host", "streetForm.menuTab.pickPrompt") ?? "Pick a restaurant above to view its menu."}
        </div>
      )}
    </div>
  );
}

const LOCALE_LABELS: Record<Locale, string> = { en: "EN", es: "ES", pt: "PT" };

function StreetsideLangSwitcher() {
  const locale = useLocale();
  function switchTo(l: Locale) {
    if (l === locale) return;
    persistLocale(l);
    window.location.reload();
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {SUPPORTED_LOCALES.map((loc, i) => (
        <span key={loc} style={{ display: "flex", alignItems: "center" }}>
          <button
            onClick={() => switchTo(loc)}
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: loc === locale ? "#c8a96e" : "rgba(255,255,255,0.3)",
              background: "none", border: "none",
              cursor: loc === locale ? "default" : "pointer",
              padding: "2px 4px",
              transition: "color 0.15s",
            }}
          >
            {LOCALE_LABELS[loc]}
          </button>
          {i < SUPPORTED_LOCALES.length - 1 && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", marginLeft: 2 }}>·</span>
          )}
        </span>
      ))}
    </div>
  );
}

export default function StreetsideHostPage() {
  const t = useTranslation();
  // `locale` is consumed by <MenuView locale={locale as Locale} /> inside the
  // menu-tab IIFE further below. It used to leak in from the now-extracted
  // GuestQRPanel inner component; keep it explicit at the page level.
  const locale = useLocale();
  const [showScanner, setShowScanner] = useState(false);
  const [scannedResult, setScannedResult] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  // Initialized to `true` so the QR tab's gated render shows "Loading your QR…"
  // on first paint instead of briefly flashing the "no code on your account"
  // copy before the first /api/v1/host/me response lands.
  const [loadingBookings, setLoadingBookings] = useState(true);
  // The streetside host's own personal referral code, loaded from
  // /api/v1/host/me. Embedded in the guest QR as ?ref=<code> so the diner's
  // booking can be deterministically attributed back to this host.
  //
  // Initialized to null (NOT the legacy "streetside" sentinel) so the QR
  // tab refuses to render a scannable code until a real per-host code has
  // loaded. The old default raced the async load: if a guest scanned during
  // the ~200-500ms before /api/v1/host/me returned, the QR shipped
  // ?ref=streetside, which resolves to nothing and silently drops the
  // attribution. Showing a "loading" state instead makes that failure mode
  // impossible.
  const [myReferralCode, setMyReferralCode] = useState<string | null>(null);
  // True when the server tried to provision the host's personal
  // commission code but the DB write failed. The UI uses this to warn
  // the host that this session's QR isn't currently carrying their
  // referral, so they don't assume credit they aren't getting.
  const [provisionFailed, setProvisionFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"qr" | "form" | "active" | "menu">("qr");
  const [menuVenuePick, setMenuVenuePick] = useState<MenuVenueSlug | null>(null);

  // Scan config & multi-mode state
  const [scanConfig, setScanConfig] = useState<ScanConfig>({ canScanMembers: true, canScanTickets: false, canScanReservationBlocks: false });
  const [checkInResult, setCheckInResult] = useState<CheckInResultData | null>(null);
  const [blockResult, setBlockResult] = useState<BlockResultData | null>(null);
  const [giftBagDone, setGiftBagDone] = useState(false);
  const [blockGiftBagDone, setBlockGiftBagDone] = useState(false);
  const [scanPending, setScanPending] = useState(false);
  const [blockArriving, setBlockArriving] = useState(false);
  const [activeScanMode, setActiveScanMode] = useState<"member" | "ticket" | "block">("member");
  const [lastArrivalId, setLastArrivalId] = useState<string | null>(null);
  // Operational capability = RESTAURANT_HOST / SUPERADMIN. A pure STREETSIDE_HOST
  // is referral-visibility only: read-only booking status, no INVU table open /
  // bind, no status transitions. Derived from GET /api/v1/host/me roles.
  const [isOperational, setIsOperational] = useState(false);
  // Host identity for the pure console path. Loaded from /api/v1/host/me.
  const [hostDisplayName, setHostDisplayName] = useState<string>("");
  const [hostRoles, setHostRoles] = useState<string[]>([]);
  // True once the first /api/v1/host/me load completes. Used to gate the
  // pure-vs-operational bifurcation so neither path flashes before we know
  // which role the viewer has.
  const [isHostLoaded, setIsHostLoaded] = useState(false);
  // Set when /api/v1/host/me returns non-ok or throws. Prevents the page from
  // silently falling through to the pure-console path for an operational host
  // that hit a transient error, and prevents an empty QR from rendering.
  const [hostLoadFailed, setHostLoadFailed] = useState(false);
  const [scanToast, setScanToast] = useState<{ message: string; type: "warn" | "error" } | null>(null);
  const scanToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active tab: today's reservation blocks
  const [activeBlocks, setActiveBlocks] = useState<Array<{
    id: string; groupLabel: string; expectedCount: number; totalArrived: number; giftBagEnabled: boolean;
    giftBagsGiven: number;
    session: { id: string; title: string | null; startsAt: string } | null;
  }>>([]);

  const loadActiveBlocks = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/host/reservation-blocks");
      const d = await r.json();
      if (d.ok) setActiveBlocks(d.data);
    } catch {}
  }, []);

  const [form, setForm] = useState({
    guestName: "",
    guestEmail: "",
    guestWhatsapp: "",
    visitorType: "" as "Resident" | "Frequent Panama Visitor" | "Visitor" | "",
    emailOptOut: false,
    partySize: 2,
    customPartySize: "" as string,
    conceptRequested: "",
    occasion: "",
    notes: "",
  });

  const loadBookings = useCallback(async () => {
    setLoadingBookings(true);
    try {
      const r = await fetch("/api/v1/host/me");
      const d = await r.json();
      if (d.ok) {
        // The Active tab must show the venue's real active reservations, not
        // just bookings attributed to the viewer's own QR. `mySubmissions` is
        // the streetside-host personal funnel (empty unless STREETSIDE_HOST);
        // `todayReservations` is the venue-wide active queue (populated only
        // for RESTAURANT_HOST / SUPERADMIN, server-side gated). A confirmed
        // website reservation lands in `todayReservations`, so a restaurant
        // host / superadmin opening this page previously saw "No active
        // bookings". Merge both, deduped by id, preferring the venue record
        // (it carries the richer attribution/INVU-bind shape). Pure streetside
        // hosts get `todayReservations: []`, so their experience is unchanged.
        const mine = d.data.mySubmissions ?? [];
        const venueActive = d.data.todayReservations ?? [];
        const seen = new Set<string>();
        const merged: typeof mine = [];
        for (const b of [...venueActive, ...mine]) {
          if (!b?.id || seen.has(b.id)) continue;
          seen.add(b.id);
          merged.push(b);
        }
        setBookings(merged);
        const roleKeys: string[] = d.data.user?.roles ?? d.data.roles ?? [];
        setIsOperational(
          roleKeys.includes("RESTAURANT_HOST") || roleKeys.includes("SUPERADMIN")
        );
        setHostDisplayName(d.data.user?.name ?? "");
        setHostRoles(roleKeys);
        // Use the host's PERSONAL self-anchored assignment specifically
        // (server picks it via parentHostProfileId === host.id). This
        // avoids accidentally encoding a delegated partner/influencer
        // seat that the host happens to also operate.
        const code: string | undefined =
          d.data?.personalReferrerAssignment?.referralCode ??
          d.data?.streetsideReferralCode;
        if (code && typeof code === "string" && code.trim().length > 0) {
          setMyReferralCode(code.toUpperCase());
        }
        // Surface the rare provisioning-failure path (DB write blew up
        // server-side); we still render the QR area but warn the host
        // it isn't carrying their referral, so they don't think every
        // walk-in scan is being credited to them.
        setProvisionFailed(Boolean(d.data?.provisionFailed) && !code);
        setIsHostLoaded(true);
      } else {
        // Non-ok response: mark as failed so we render a named error card
        // instead of silently falling through to the pure-console path.
        setHostLoadFailed(true);
        setIsHostLoaded(true);
      }
    } catch {
      // Network or parse error: mark failed so neither path renders with
      // empty/stale identity.
      setHostLoadFailed(true);
      setIsHostLoaded(true);
    }
    setLoadingBookings(false);
  }, []);

  // Cleanup scan toast timer on unmount
  useEffect(() => {
    return () => {
      if (scanToastTimerRef.current) clearTimeout(scanToastTimerRef.current);
    };
  }, []);

  // Load scan config on mount
  useEffect(() => {
    fetch("/api/v1/host/scan-config/me")
      .then((r) => r.json())
      .then((d) => { if (d.ok && d.data) setScanConfig(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadBookings();
    loadActiveBlocks();
    const iv = setInterval(() => {
      loadBookings();
      loadActiveBlocks();
    }, 15_000);
    return () => clearInterval(iv);
  }, [loadBookings, loadActiveBlocks]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.guestName || !form.guestEmail) {
      setError(t("host", "streetForm.errorNameEmailRequired"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch("/api/v1/host/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: form.guestName,
          guestEmail: form.guestEmail,
          guestWhatsapp: form.guestWhatsapp,
          visitorType: form.visitorType,
          emailOptOut: form.emailOptOut,
          partySize: form.partySize === 6 ? (parseInt(form.customPartySize, 10) || 6) : form.partySize,
          conceptRequested: form.conceptRequested,
          occasion: form.occasion || null,
          notes: form.notes,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Failed to submit");

      setSuccess(`Booking submitted for ${form.guestName} (party of ${form.partySize === 6 ? (parseInt(form.customPartySize, 10) || 6) : form.partySize})`);
      setForm({ guestName: "", guestEmail: "", guestWhatsapp: "", visitorType: "", emailOptOut: false, partySize: 2, customPartySize: "", conceptRequested: "", occasion: "", notes: "" });
      setActiveTab("active");
      loadBookings();
      setTimeout(() => setSuccess(""), 4000);
    } catch (e: any) {
      setError(e.message);
    }
    setSubmitting(false);
  }

  async function handleUpdateStatus(id: string, status: string, lossReason?: string) {
    await fetch(`/api/v1/host/bookings/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, lossReason }),
    });
    await loadBookings();
  }

  async function handleQRScan(raw: string) {
    setShowScanner(false);
    setScanPending(true);
    setGiftBagDone(false);
    setBlockGiftBagDone(false);

    try {
      // Detect payload type and enforce scan-config permissions
      if (raw.startsWith("BLOCK:")) {
        if (!scanConfig.canScanReservationBlocks) {
          setScanPending(false);
          setScanToast({ message: t("host", "scan.blockPermDeniedMessage") ?? "Reservation block scan mode is not enabled for your account. Ask an admin to turn it on in the scan settings.", type: "warn" });
          if (scanToastTimerRef.current) clearTimeout(scanToastTimerRef.current);
          scanToastTimerRef.current = setTimeout(() => setScanToast(null), 6000);
          return;
        }
        const qrCode = raw.slice(6).trim();
        const r = await fetch(`/api/v1/host/reservation-block-qr/${encodeURIComponent(qrCode)}`);
        if (r.ok) {
          const d = await r.json();
          if (d.ok) {
            setBlockResult(d.data);
            setScanPending(false);
            return;
          }
        }
        // Fall through on error
      } else if (
        scanConfig.canScanTickets &&
        (activeScanMode === "ticket" || raw.toUpperCase().startsWith("TIX-") || /^[A-Z0-9-]{6,20}$/i.test(raw))
      ) {
        // Attempt ticket check-in (only when ticket scan mode is enabled)
        const r = await fetch("/api/v1/host/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: raw }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.ok) {
            setCheckInResult(d.data);
            setScanPending(false);
            return;
          }
        }
      }

      // Default: member card / referral QR (only when member scan enabled, or no scan mode configured)
      if (!scanConfig.canScanMembers) {
        // No applicable mode — silently discard
        setScanPending(false);
        return;
      }
      setScannedResult(raw);
      const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) setForm((f) => ({ ...f, guestEmail: emailMatch[0] }));
      const nameMatch = raw.match(/name=([^&]+)/i);
      if (nameMatch) setForm((f) => ({ ...f, guestName: decodeURIComponent(nameMatch[1]) }));
      setActiveTab("form");
    } catch {}
    setScanPending(false);
  }

  async function handleGiftBag() {
    if (!checkInResult?.ticket) return;
    await fetch(`/api/v1/host/gift-bag/${checkInResult.ticket.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setGiftBagDone(true);
  }

  async function handleBlockArrive(partySize: number) {
    if (!blockResult) return;
    setBlockArriving(true);
    try {
      const r = await fetch(`/api/v1/host/reservation-block/${blockResult.block.id}/arrive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partySize }),
      });
      const d = await r.json();
      if (d.ok) {
        // d.data: { arrival, block, totalArrived, expectedCount, giftBagEnabled }
        if (d.data.arrival?.id) setLastArrivalId(d.data.arrival.id);
        setBlockResult({
          block: d.data.block,
          totalArrived: d.data.totalArrived,
          expectedCount: d.data.expectedCount,
          giftBagEnabled: d.data.giftBagEnabled,
        });
        await loadActiveBlocks();
      }
    } catch {}
    setBlockArriving(false);
  }

  async function handleBlockGiftBag() {
    if (!lastArrivalId) return;
    await fetch(`/api/v1/host/gift-bag/block-arrival/${lastArrivalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBlockGiftBagDone(true);
  }

  const nowIso = new Date().toISOString();
  const activeBookings = bookings.filter((b) => !isBookingClosed(b, nowIso));
  const finalBookings  = bookings.filter((b) => isBookingClosed(b, nowIso));
  const seatedCount = bookings.filter((b) => b.status === "SEATED").length;
  const lostCount   = bookings.filter((b) => ["NO_SHOW", "CANCELLED"].includes(b.status)).length;

  // All loaded hosts — operational (RESTAURANT_HOST / SUPERADMIN) and pure
  // streetside (STREETSIDE_HOST) — share the same segmented tab shell.
  // The tabs gate operational-only controls internally via the `isOperational`
  // flag; the shell itself is identical so the UX never diverges.
  // hostLoadFailed is excluded: a failed load renders the error card above,
  // not an empty tab shell.
  const TABS: { key: "qr" | "form" | "active" | "menu"; label: string }[] = [
    { key: "qr",     label: t("host", "streetForm.tabQr") },
    { key: "form",   label: t("host", "streetForm.tabForm") },
    { key: "active", label: t("host", "streetForm.tabActive") },
    { key: "menu",   label: t("host", "streetForm.tabMenu") },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", color: "white", fontFamily: "var(--font-sans)" }}>
      {/* Scan permission toast */}
      {scanToast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 2000, maxWidth: 360, width: "calc(100% - 32px)",
          background: scanToast.type === "warn" ? "#78350f" : "#7f1d1d",
          border: `1px solid ${scanToast.type === "warn" ? "#d97706" : "#dc2626"}`,
          borderRadius: 14, padding: "14px 18px",
          display: "flex", alignItems: "flex-start", gap: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>{scanToast.type === "warn" ? "⚠️" : "✕"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: scanToast.type === "warn" ? "#fbbf24" : "#f87171", marginBottom: 3 }}>
              {scanToast.type === "warn"
                ? (t("host", "scan.blockPermDeniedTitle") ?? "Scan Mode Not Enabled")
                : (t("host", "scan.errorTitle") ?? "Scan Error")}
            </div>
            <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>{scanToast.message}</div>
          </div>
          <button
            onClick={() => setScanToast(null)}
            style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 16, padding: 0, flexShrink: 0, marginLeft: "auto" }}
          >
            ×
          </button>
        </div>
      )}
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(13,13,15,0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 20px",
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              href="/"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 9,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#9ca3af", textDecoration: "none",
                flexShrink: 0,
              }}
              title="Back to Dashboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </Link>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
            <Brandmark size={18} color="#e8d9b3" showTagline={false} />
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a78bfa" }}>
              Streetside
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StreetsideLangSwitcher />
            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
          {/* Scan buttons — operational hosts only (RESTAURANT_HOST / SUPERADMIN) */}
          {isOperational && <div style={{ display: "flex", gap: 6 }}>
            {scanConfig.canScanMembers && (
              <button
                onClick={() => { setActiveScanMode("member"); setShowScanner(true); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: activeScanMode === "member" ? "rgba(200,169,110,0.18)" : "rgba(200,169,110,0.08)",
                  border: "1px solid rgba(200,169,110,0.35)",
                  borderRadius: 10, padding: "8px 12px",
                  color: "#c8a96e", cursor: "pointer",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 17h.01M17 14h.01"/>
                </svg>
                {t("host", "scan.member") ?? "Member"}
              </button>
            )}
            {scanConfig.canScanTickets && (
              <button
                onClick={() => { setActiveScanMode("ticket"); setShowScanner(true); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: activeScanMode === "ticket" ? "rgba(56,189,248,0.18)" : "rgba(56,189,248,0.08)",
                  border: "1px solid rgba(56,189,248,0.35)",
                  borderRadius: 10, padding: "8px 12px",
                  color: "#38bdf8", cursor: "pointer",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                }}
              >
                🎫 {t("host", "scan.ticket") ?? "Ticket"}
              </button>
            )}
            {scanConfig.canScanReservationBlocks && (
              <button
                onClick={() => { setActiveScanMode("block"); setShowScanner(true); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: activeScanMode === "block" ? "rgba(167,139,250,0.18)" : "rgba(167,139,250,0.08)",
                  border: "1px solid rgba(167,139,250,0.35)",
                  borderRadius: 10, padding: "8px 12px",
                  color: "#a78bfa", cursor: "pointer",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                }}
              >
                👥 {t("host", "scan.block") ?? "Block"}
              </button>
            )}
            {!scanConfig.canScanMembers && !scanConfig.canScanTickets && !scanConfig.canScanReservationBlocks && (
              <button
                onClick={() => setShowScanner(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(200,169,110,0.08)",
                  border: "1px solid rgba(200,169,110,0.25)",
                  borderRadius: 10, padding: "8px 12px",
                  color: "#6b7280", cursor: "pointer",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                }}
              >
                {t("host", "scan.scanQr") ?? "Scan QR"}
              </button>
            )}
          </div>}
          </div>
        </div>
      </header>

      {/* ── Pure referrer console path (STREETSIDE_HOST only, no restaurant perms) ── */}
      {!isHostLoaded && (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 16px", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
          Loading…
        </div>
      )}

      {/* Error state: /api/v1/host/me returned non-ok or threw.
          Rendered for BOTH pure and operational hosts so neither path
          silently renders with stale/empty identity. */}
      {isHostLoaded && hostLoadFailed && (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 16px" }}>
          <div style={{
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: 14, padding: "20px 20px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", letterSpacing: "0.06em", marginBottom: 6 }}>
              Couldn&rsquo;t load your profile
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6, marginBottom: 16 }}>
              There was a problem connecting to the server. Your session is still valid — try reloading the page.
            </div>
            <button
              onClick={() => { setHostLoadFailed(false); setIsHostLoaded(false); loadBookings(); }}
              style={{
                padding: "9px 20px", borderRadius: 10, border: "1px solid rgba(248,113,113,0.35)",
                background: "rgba(248,113,113,0.1)", color: "#f87171",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Segmented tabs — all loaded hosts (operational + pure streetside) ── */}
      {isHostLoaded && !hostLoadFailed && (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 80px" }}>

        {/* Scanned result banner */}
        {scannedResult && (
          <div style={{
            background: "rgba(200,169,110,0.1)",
            border: "1px solid rgba(200,169,110,0.3)",
            borderRadius: 12, padding: "12px 16px", marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontSize: 12, color: "#c8a96e" }}>
              {t("host", "streetForm.memberScanned")}
            </div>
            <button onClick={() => setScannedResult("")} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4 }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 9,
                border: "none",
                background: activeTab === tab.key ? "rgba(255,255,255,0.1)" : "transparent",
                color: activeTab === tab.key ? "white" : "#6b7280",
                fontWeight: activeTab === tab.key ? 700 : 500,
                fontSize: 13, cursor: "pointer",
                position: "relative",
              }}
            >
              {tab.label}
              {tab.key === "active" && activeBookings.length > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: "22%",
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#fbbf24",
                }} />
              )}
            </button>
          ))}
        </div>

        {/* Tab: Guest QR — guest scans on their own phone. Every host  */}
        {/* has a personal referral code (auto-provisioned on first    */}
        {/* /api/v1/host/me load), so the QR normally always carries   */}
        {/* ?ref and attribution + commission flow back to them. The   */}
        {/* `provisionFailed` banner only appears in the rare case the */}
        {/* server-side write blew up — the QR is still rendered so     */}
        {/* the host isn't blocked, but they're warned that it isn't   */}
        {/* currently carrying their referral.                         */}
        {activeTab === "qr" && (
          loadingBookings && !myReferralCode ? (
            <GlassCard style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", letterSpacing: "0.05em" }}>
                Loading your QR…
              </div>
            </GlassCard>
          ) : (
            <>
              {provisionFailed && (
                <GlassCard style={{ padding: 14, marginBottom: 12, textAlign: "center", borderColor: "rgba(248,113,113,0.4)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                    Couldn&rsquo;t load your commission code
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.55 }}>
                    Guests can still book using this QR, but this session won&rsquo;t be credited to you.
                    Try reloading the page; if it keeps happening, ask admin to look at your host profile.
                  </div>
                </GlassCard>
              )}
              <GuestQRPanel
                referralCode={myReferralCode ?? ""}
                appendRefQuery={Boolean(myReferralCode)}
                onFillFormClick={() => setActiveTab("form")}
                showWhatsAppShare
                date={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()}
              />
            </>
          )
        )}

        {/* Tab: Host Form — host fills on company device */}
        {activeTab === "form" && (
          <form onSubmit={handleSubmit}>
            {/* Guest Info */}
            <GlassCard style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 14 }}>
                {t("host", "streetForm.sections.guestInfo")}
              </div>

              <input
                value={form.guestName}
                onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
                placeholder={t("host", "streetForm.placeholders.fullName")}
                required
                style={inputStyle}
              />

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 5 }}>
                  {t("host", "streetForm.fieldEmail")} <span style={{ color: "#f87171" }}>*</span>
                </div>
                <input
                  value={form.guestEmail}
                  onChange={(e) => setForm((f) => ({ ...f, guestEmail: e.target.value }))}
                  placeholder={t("host", "streetForm.placeholders.email")}
                  type="email"
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 5 }}>
                  {t("host", "streetForm.fieldWhatsapp")} <span style={{ color: "#4b5563", fontWeight: 400 }}>{t("host", "streetForm.fieldEmailOptional")}</span>
                </div>
                <input
                  value={form.guestWhatsapp}
                  onChange={(e) => setForm((f) => ({ ...f, guestWhatsapp: e.target.value }))}
                  placeholder={t("host", "streetForm.placeholders.whatsapp")}
                  type="tel"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 8 }}>
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
                        border: form.visitorType === vt ? "1px solid rgba(167,139,250,0.5)" : "1px solid rgba(255,255,255,0.08)",
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
                    border: form.emailOptOut ? "1px solid rgba(248,113,113,0.5)" : "1px solid rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {form.emailOptOut && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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

            {/* Party size */}
            <GlassCard style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 14 }}>
                {t("host", "streetForm.sections.partySize")}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, partySize: n, customPartySize: "" }))}
                    style={{
                      flex: 1, padding: "12px 0", borderRadius: 10,
                      background: form.partySize === n ? "rgba(200,169,110,0.2)" : "rgba(255,255,255,0.05)",
                      border: form.partySize === n ? "1px solid rgba(200,169,110,0.5)" : "1px solid rgba(255,255,255,0.08)",
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
                    border: form.partySize === 6 ? "1px solid rgba(200,169,110,0.5)" : "1px solid rgba(255,255,255,0.08)",
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
                    placeholder={t("host", "streetForm.placeholders.customPartySize")}
                    style={{ ...inputStyle, fontSize: 14 }}
                  />
                </div>
              )}
            </GlassCard>

            {/* Experience + Occasion */}
            <GlassCard style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 14 }}>
                {t("host", "streetForm.sections.experience")}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {CONCEPTS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, conceptRequested: c.key }))}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 10,
                      background: form.conceptRequested === c.key ? `${c.color}20` : "rgba(255,255,255,0.04)",
                      border: form.conceptRequested === c.key ? `1px solid ${c.color}66` : "1px solid rgba(255,255,255,0.08)",
                      color: form.conceptRequested === c.key ? c.color : "#6b7280",
                      fontWeight: 700, fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
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
                      border: form.occasion === o.key ? "1px solid rgba(167,139,250,0.4)" : "1px solid rgba(255,255,255,0.08)",
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
                      border: form.occasion === h.key ? "1px solid rgba(200,169,110,0.4)" : "1px solid rgba(255,255,255,0.08)",
                      color: form.occasion === h.key ? "#c8a96e" : "#6b7280",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {t("host", h.tKey)}
                  </button>
                ))}
              </div>
            </GlassCard>

            {/* Notes */}
            <GlassCard style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 12 }}>
                {t("host", "streetForm.sections.notes")}
              </div>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder={t("host", "streetForm.placeholders.notes")}
                rows={3}
                style={{ ...inputStyle, resize: "none", fontFamily: "inherit" }}
              />
            </GlassCard>

            {error && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 14, color: "#f87171", fontSize: 13 }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 14, color: "#10b981", fontSize: 13, fontWeight: 600 }}>
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%", padding: "16px", borderRadius: 14, border: "none",
                background: submitting ? "rgba(200,169,110,0.3)" : "linear-gradient(135deg, #c8a96e 0%, #a8894e 100%)",
                color: submitting ? "#9ca3af" : "#1a1614",
                fontSize: 15, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer",
                letterSpacing: "0.04em",
              }}
            >
              {submitting ? t("host", "streetForm.sendingButton") : t("host", "streetForm.submitButton")}
            </button>
          </form>
        )}

        {/* Tab: Active Bookings */}
        {activeTab === "active" && (
          <div>
            {/* Stats strip — shown in active tab for operational hosts */}
            {bookings.length > 0 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                <StatPill label={t("host", "streetForm.statsActive")} value={activeBookings.length} color="#fbbf24" />
                <StatPill label={t("host", "streetForm.statsSeated")} value={seatedCount} color="#10b981" />
                <StatPill label={t("host", "streetForm.statsLost")} value={lostCount} color="#f87171" />
              </div>
            )}

            {/* Reservation block live arrival counts */}
            {scanConfig.canScanReservationBlocks && activeBlocks.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#a78bfa", marginBottom: 10 }}>
                  {t("host", "reservationBlocks.title") ?? "Reservation Blocks"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeBlocks.map((blk) => {
                    const pct = Math.min(100, blk.expectedCount > 0 ? Math.round((blk.totalArrived / blk.expectedCount) * 100) : 0);
                    const remaining = blk.expectedCount - blk.totalArrived;
                    return (
                      <div key={blk.id} style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.18)", borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "white" }}>{blk.groupLabel}</div>
                            {blk.session && (
                              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
                                {blk.session.title ?? new Date(blk.session.startsAt).toLocaleDateString()} · {new Date(blk.session.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: remaining <= 0 ? "#10b981" : "#c8a96e" }}>
                              {blk.totalArrived} / {blk.expectedCount}
                            </div>
                            <div style={{ fontSize: 10, color: "#6b7280" }}>
                              {remaining <= 0
                                ? (t("host", "reservationBlocks.complete") ?? "Complete")
                                : t("host", "reservationBlocks.remaining", { n: remaining })}
                            </div>
                            {blk.giftBagEnabled && (
                              <div style={{ fontSize: 10, color: "#c8a96e", marginTop: 2 }}>
                                🎁 {blk.giftBagsGiven} {t("host", "reservationBlocks.giftBags") ?? "gift bags"}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: remaining <= 0 ? "#10b981" : "#a78bfa", borderRadius: 2, transition: "width 0.4s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {loadingBookings && bookings.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#4b5563", fontSize: 13 }}>{t("host", "streetForm.loading")}</div>
            ) : activeBookings.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#4b5563", fontSize: 13 }}>
                {t("host", "streetForm.noActiveBookings")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeBookings.map((b) => (
                  <BookingCard key={b.id} booking={b} onUpdateStatus={handleUpdateStatus} onBindUpdated={loadBookings} isOperational={isOperational} />
                ))}
              </div>
            )}

            {(() => {
              const inServiceBookings = finalBookings.filter((b) => b.status === "ARRIVED" || b.status === "SEATED");
              const pastAwaitingCloseBookings = finalBookings.filter(
                (b) => !["COMPLETED", "CANCELLED", "NO_SHOW", "ARRIVED", "SEATED"].includes(b.status)
              );
              const closedBookings = finalBookings.filter((b) => b.status === "COMPLETED");
              const lostBookings = finalBookings.filter((b) => b.status === "CANCELLED" || b.status === "NO_SHOW");
              const sections: Array<{ key: string; label: string; items: typeof finalBookings }> = [
                { key: "inService", label: t("host", "streetForm.sectionInService"), items: inServiceBookings },
                { key: "pastAwaiting", label: t("host", "streetForm.sectionPastAwaitingClose"), items: pastAwaitingCloseBookings },
                { key: "closed", label: t("host", "streetForm.sectionClosed"), items: closedBookings },
                { key: "lost", label: t("host", "streetForm.sectionLost"), items: lostBookings },
              ];
              return sections
                .filter((s) => s.items.length > 0)
                .map((s) => (
                  <div key={s.key} style={{ marginTop: 28 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#374151", marginBottom: 12 }}>
                      {s.label}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {s.items.map((b) => (
                        <BookingCard key={b.id} booking={b} onUpdateStatus={handleUpdateStatus} isOperational={isOperational} />
                      ))}
                    </div>
                  </div>
                ));
            })()}
          </div>
        )}

        {/* Tab: Menu — live restaurant menu for the selected concept */}
        {activeTab === "menu" && (() => {
          const fromForm = conceptToVenueSlug(form.conceptRequested || "");
          const venueSlug: MenuVenueSlug | null = fromForm ?? menuVenuePick;
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af" }}>
                  {t("host", "streetForm.menuTab.heading") ?? "Restaurant Menu"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["oku", "catch", "terrace"] as const).map(slug => {
                    const isActive = venueSlug === slug;
                    return (
                      <button
                        key={slug}
                        onClick={() => setMenuVenuePick(slug)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: isActive ? "1px solid rgba(200,169,110,0.5)" : "1px solid rgba(255,255,255,0.08)",
                          background: isActive ? "rgba(200,169,110,0.12)" : "rgba(255,255,255,0.03)",
                          color: isActive ? "#c8a96e" : "#9ca3af",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          cursor: "pointer",
                          textTransform: "uppercase",
                        }}
                      >
                        {slug === "oku" ? "OKÜ" : slug.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
              {venueSlug ? (
                <Suspense fallback={<div style={{ textAlign: "center", padding: "40px 0", color: "#4b5563", fontSize: 13 }}>{t("host", "streetForm.loading")}</div>}>
                  <MenuView venueSlug={venueSlug} locale={locale as Locale} variant="embedded" showVenueHeading />
                </Suspense>
              ) : (
                <div style={{ textAlign: "center", padding: "60px 24px", color: "#6b7280", fontSize: 13, background: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
                  {t("host", "streetForm.menuTab.pickPrompt") ?? "Pick a restaurant above to view its menu."}
                </div>
              )}
            </div>
          );
        })()}
      </div>
      )} {/* end segmented tabs */}

      {/* Scan pending overlay */}
      {scanPending && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1050, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "#c8a96e", fontSize: 16, fontWeight: 700 }}>{t("host", "scan.processingTitle") ?? "Processing scan…"}</div>
        </div>
      )}

      {/* Ticket check-in result modal */}
      {checkInResult && (
        <CheckInModal
          result={checkInResult}
          onClose={() => { setCheckInResult(null); setGiftBagDone(false); }}
          giftBagEnabled={checkInResult.giftBagEnabled}
          onGiftBag={handleGiftBag}
          giftBagDone={giftBagDone || checkInResult.giftBagAlreadyGiven}
        />
      )}

      {/* Block arrival modal */}
      {blockResult && (
        <BlockModal
          result={blockResult}
          onClose={() => { setBlockResult(null); setBlockGiftBagDone(false); setLastArrivalId(null); }}
          onMarkArrived={handleBlockArrive}
          onGiftBag={handleBlockGiftBag}
          giftBagDone={blockGiftBagDone}
          arriving={blockArriving}
          arrivalId={lastArrivalId}
        />
      )}

      {showScanner && (
        <Suspense fallback={null}>
          <QRScanner
            onScan={handleQRScan}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: 1,
      background: `${color}0f`,
      border: `1px solid ${color}33`,
      borderRadius: 10,
      padding: "10px 12px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "13px 14px",
  color: "white",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
