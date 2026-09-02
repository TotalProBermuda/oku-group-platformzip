"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Brandmark from "@/components/Brandmark";
import LiveAttendanceFeed from "./LiveAttendanceFeed";
import { useTranslation } from "@/components/i18n/LocaleProvider";

type StatusLog = { fromStatus?: string | null; toStatus: string; changedByLabel?: string | null; lossReason?: string | null; changedAt: string; notes?: string | null };
type Attribution = { referrer?: { fullName: string; referrerType: string } | null };
type Handoff = { handoffStatus: string };
type Addon = { addonType: string; label: string };
type Zone = { name: string; conceptKey: string };

type RestaurantSpace = {
  id: string;
  name: string;
  capacity: number;
};

type SpaceUtilisation = {
  id: string;
  name: string;
  capacity: number;
  held: number;
  available: number;
  utilPct: number;
  isActive: boolean;
  reservable: boolean;
  eventConflict?: EventConflictCard | null;
};

type EventConflictCard = {
  kind: "PUBLIC_EVENT" | "PRIVATE_BLOCK";
  title?: string;
  imageUrl?: string | null;
  href?: string;
  message: string;
};

type Reservation = {
  id: string;
  contactName: string;
  partySize: number;
  conceptRequested?: string | null;
  status: string;
  occasion?: string | null;
  notes?: string | null;
  reservationDate: string;
  source: string;
  assignedTableLabel?: string | null;
  commissionEligible?: boolean;
  arrivalConfirmedAt?: string | null;
  seatedAt?: string | null;
  zone?: Zone | null;
  guestProfile?: { noShowCount: number } | null;
  handoffs: Handoff[];
  attributions: Attribution[];
  // The new attribution chain (preferred over the legacy `attributions` row).
  // Populated by the QR booking POST and host check-in. The drawer's
  // "Referred by" line falls back through:
  //   attributionSession.referralActor.displayName
  //     → attributionSession.legacyReferrer.fullName
  //     → attributions[0].referrer.fullName
  // so a guest attributed via ReferralLink (RAFNH01-style host link) still
  // shows up correctly even though no legacy ReservationAttribution row was
  // ever written for them.
  attributionSession?: {
    id: string;
    source: string;
    status: string;
    referralActor:  { id: string; displayName: string; actorType: string } | null;
    legacyReferrer: { id: string; fullName: string;    referrerType: string } | null;
  } | null;
  addons: Addon[];
  statusLogs: StatusLog[];
  assignedHost?: { displayName: string } | null;
  // Space-aware capacity (Task #181)
  requestedSpace?: RestaurantSpace | null;
  assignedSpace?: RestaurantSpace | null;
};

type WaitlistEntry = {
  id: string;
  contactName: string;
  partySize: number;
  conceptRequested?: string | null;
  estimatedWaitMinutes?: number | null;
  status: string;
  createdAt: string;
};

type VenueZone = {
  id: string;
  name: string;
  conceptKey: string;
  capacityCovers: number;
  currentWaitMinutes: number | null;
  tables: Array<{ id: string; name: string; seats: number; minPartySize?: number; maxPartySize?: number; mergeable?: boolean; isVip: boolean }>;
};

const CONCEPT_BG: Record<string, string> = { oku: "#1a1614", catch: "#1e3a5f", terrace: "#2d4a1e", vip: "#4a1e1e" };
const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  PENDING:          { bg: "#fff8e1", text: "#b45309", border: "#fcd34d" },
  PENDING_APPROVAL: { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
  ACKNOWLEDGED: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  WAITLISTED:   { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
  ARRIVED:      { bg: "#ecfdf5", text: "#065f46", border: "#6ee7b7" },
  SEATED:       { bg: "#f0fdf4", text: "#15803d", border: "#86efac" },
  COMPLETED:    { bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
  NO_SHOW:      { bg: "#fff1f2", text: "#be123c", border: "#fda4af" },
  CANCELLED:    { bg: "#f8fafc", text: "#94a3b8", border: "#e2e8f0" },
  REJECTED:     { bg: "#fff1f2", text: "#be123c", border: "#fda4af" },
};

const SOURCE_LABEL: Record<string, string> = {
  STREETSIDE_HOST: "Streetside",
  WALK_IN: "Walk-in",
  QR_CODE: "QR Code",
  UMBRELLA_SITE: "Website",
  OKU_SITE: "OKU Web",
  CATCH_SITE: "CATCH Web",
  ADMIN: "Admin",
  TAXI_DRIVER: "Taxi",
  TOUR_GUIDE: "Tour Guide",
  HOTEL_CONCIERGE: "Concierge",
};

// Human-readable labels for the "Referred by" line. Kept separate from
// SOURCE_LABEL (which also feeds the source-filter dropdown) so every
// commission-eligible referrer/actor type renders a clean name instead of
// a raw enum. Covers all ReferralActorType + ReferrerType values.
const REFERRER_TYPE_LABEL: Record<string, string> = {
  STREETSIDE_HOST: "Streetside Host",
  TAXI_DRIVER: "Taxi",
  UBER_DRIVER: "Uber",
  TOUR_GUIDE: "Tour Guide",
  HOTEL_CONCIERGE: "Concierge",
  INFLUENCER_SUB_REFERRER: "Influencer",
  PROMOTER: "Promoter",
  PRIVATE_NETWORK: "Private Network",
  PARTNER: "Partner",
  OTHER: "Other",
};

const LOSS_REASONS = [
  { value: "WAIT_TOO_LONG", label: "Wait too long" },
  { value: "TABLE_NOT_READY", label: "No table available" },
  { value: "GROUP_TOO_LARGE", label: "Large party — no fit" },
  { value: "NOT_INTERESTED_IN_MENU", label: "Menu mismatch" },
  { value: "PRICE_CONCERN", label: "Price sensitivity" },
  { value: "PREFERRED_SEATING_UNAVAILABLE", label: "Preferred seating not available" },
  { value: "CHANGED_MIND", label: "Guest changed mind" },
  { value: "WENT_ELSEWHERE", label: "Found another venue" },
  { value: "NO_RESPONSE", label: "Could not be reached" },
  { value: "BAD_SERVICE", label: "Slow / poor host response" },
  { value: "ELEVATOR_NOT_WORKING", label: "Venue access issue" },
  { value: "TERRACE_UNAVAILABLE", label: "Terrace unavailable" },
  { value: "OTHER", label: "Other" },
];

const PANEL_GROUPS = [
  { labelKey: "operations.panelIncoming",     statuses: ["PENDING", "PENDING_APPROVAL"], accent: "#b45309" },
  { labelKey: "operations.panelAcknowledged", statuses: ["ACKNOWLEDGED", "CONFIRMED"], accent: "#1d4ed8" },
  { labelKey: "operations.panelWaitlist",     statuses: ["WAITLISTED"], accent: "#7e22ce" },
  { labelKey: "operations.panelArrived",      statuses: ["ARRIVED"], accent: "#065f46" },
  { labelKey: "operations.panelSeated",       statuses: ["SEATED"], accent: "#15803d" },
  { labelKey: "operations.panelClosed",       statuses: ["COMPLETED", "NO_SHOW", "CANCELLED"], accent: "#94a3b8" },
];

function elapsed(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function toDateTimeLocalValue(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? { bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 99, background: c.bg, color: c.text, border: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const label = SOURCE_LABEL[source] ?? source;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "1px 7px", borderRadius: 99, background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", fontSize: 10, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function ActionButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "5px 11px", borderRadius: 7, border: `1.5px solid ${color}`, background: "transparent", color, fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.03em", transition: "background 0.15s" }}
      onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = color; (e.target as HTMLButtonElement).style.color = "#fff"; }}
      onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = "transparent"; (e.target as HTMLButtonElement).style.color = color; }}>
      {label}
    </button>
  );
}

function JourneyTimeline({ logs }: { logs: StatusLog[] }) {
  const t = useTranslation();
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 10 }}>{t("host", "operations.journeyTimeline")}</div>
      <div style={{ position: "relative", paddingLeft: 16 }}>
        <div style={{ position: "absolute", left: 5, top: 0, bottom: 0, width: 1.5, background: "#e2e8f0" }} />
        {logs.map((l, i) => {
          const c = STATUS_COLOR[l.toStatus] ?? { bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1" };
          return (
            <div key={i} style={{ position: "relative", paddingBottom: 14, paddingLeft: 14 }}>
              <div style={{ position: "absolute", left: -5, top: 3, width: 12, height: 12, borderRadius: "50%", background: c.bg, border: `2px solid ${c.border}` }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: c.text }}>{l.toStatus.replace(/_/g, " ")}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{new Date(l.changedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{l.changedByLabel ? ` · ${l.changedByLabel}` : ""}</div>
              {l.lossReason && <div style={{ fontSize: 10, color: "#be123c", marginTop: 2 }}>{t("host", "operations.lossLabel")}: {l.lossReason.replace(/_/g, " ")}</div>}
              {l.notes && <div style={{ fontSize: 10, color: "#64748b", marginTop: 1, fontStyle: "italic" }}>{l.notes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuestDrawer({
  res, zones, spaces, onClose, onAction,
}: {
  res: Reservation; zones: VenueZone[]; spaces: SpaceUtilisation[];
  onClose: () => void;
  onAction: (
    id: string,
    status: string,
    opts?: Record<string, string>,
    onConflict?: (conflict: EventConflictCard) => void,
  ) => void;
}) {
  const t = useTranslation();
  const [tab, setTab] = useState<"journey" | "actions">("actions");
  const [tableLabel, setTableLabel] = useState(res.assignedTableLabel ?? "");
  const [selectedSpaceId, setSelectedSpaceId] = useState(res.assignedSpace?.id ?? res.requestedSpace?.id ?? "");
  const [confirmedReservationDate, setConfirmedReservationDate] = useState(toDateTimeLocalValue(res.reservationDate));
  const [spaceWarning, setSpaceWarning] = useState<{ overCapacity: boolean; available: number; capacity?: number; partySize?: number } | null>(null);
  const [assigningSpace, setAssigningSpace] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [lossReason, setLossReason] = useState("");
  const [lossNotes, setLossNotes] = useState("");
  const [showLossForm, setShowLossForm] = useState(false);
  const [pendingLossStatus, setPendingLossStatus] = useState("");
  const [scheduledSpaces, setScheduledSpaces] = useState<SpaceUtilisation[]>([]);
  const [scheduledSpacesLoading, setScheduledSpacesLoading] = useState(false);
  const [scheduledSpacesError, setScheduledSpacesError] = useState<string | null>(null);
  const [eventDetails, setEventDetails] = useState<EventConflictCard | null>(null);

  useEffect(() => {
    if (res.status !== "PENDING_APPROVAL" || !confirmedReservationDate) return;
    const startAt = new Date(confirmedReservationDate);
    if (Number.isNaN(startAt.getTime())) return;
    const endAt = new Date(startAt.getTime() + 120 * 60_000);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setScheduledSpacesLoading(true);
      setScheduledSpacesError(null);
      try {
        const params = new URLSearchParams({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          reservationId: res.id,
        });
        const response = await fetch(`/api/v1/host/spaces/utilisation?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Availability could not be loaded");
        setScheduledSpaces(payload.data ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setScheduledSpaces([]);
          setScheduledSpacesError(error instanceof Error ? error.message : "Availability could not be loaded");
        }
      } finally {
        if (!controller.signal.aborted) setScheduledSpacesLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [confirmedReservationDate, res.id, res.status]);

  /**
   * Two-phase space assignment:
   *  Phase 1: POST without confirmOverride — if 409+needsConfirmation, show warning.
   *  Phase 2: POST with confirmOverride:true after host explicitly confirms.
   */
  async function handleAssignSpace(forceOverride = false) {
    if (!selectedSpaceId) return;
    setAssigningSpace(true);
    setSpaceWarning(null);
    try {
      const body: Record<string, unknown> = { spaceId: selectedSpaceId };
      if (forceOverride) body.confirmOverride = true;

      const r = await fetch(`/api/v1/host/bookings/${res.id}/assign-space`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();

      if (r.status === 409 && d.needsConfirmation) {
        // Server returned a preflight warning — show it, do NOT write yet
        setSpaceWarning(d.warning);
        return;
      }
      if (!r.ok) {
        if (d.code === "EVENT_UNAVAILABLE" && d.eventConflict) setEventDetails(d.eventConflict);
        else alert(d.error ?? "Failed to assign space");
        return;
      }
      // Success (possibly with post-hoc override note)
      if (d.warning?.overCapacity) setSpaceWarning(d.warning);
    } catch (e) {
      console.error("[assign-space]", e);
    } finally {
      setAssigningSpace(false);
    }
  }

  // Three-tier fallback: prefer the new attribution chain, then the legacy
  // ReservationAttribution row. The session-level `referralActor` covers
  // RAFNH01-style host-link bookings where no Referrer row exists; the
  // session-level `legacyReferrer` covers QR bookings where the resolved
  // actor is a Referrer; and the legacy attributions[] handles seeded /
  // historical rows that predate AttributionSession. Without this chain
  // the drawer renders "—" for every host-link guest.
  const sessionActor    = res.attributionSession?.referralActor ?? null;
  const sessionLegacy   = res.attributionSession?.legacyReferrer ?? null;
  const legacyAttribRef = res.attributions[0]?.referrer ?? null;
  const refName =
    sessionActor?.displayName ??
    sessionLegacy?.fullName ??
    legacyAttribRef?.fullName ??
    null;
  const refType =
    (sessionActor?.actorType as string | undefined) ??
    sessionLegacy?.referrerType ??
    legacyAttribRef?.referrerType ??
    null;

  function triggerLoss(status: string) {
    setPendingLossStatus(status);
    setShowLossForm(true);
  }

  function submitLoss() {
    if (!lossReason) return;
    onAction(res.id, pendingLossStatus, { lossReason, lossReasonNotes: lossNotes });
    setShowLossForm(false);
  }

  async function resendConfirmation() {
    setEmailBusy(true);
    setEmailNotice(null);
    try {
      const response = await fetch(`/api/v1/host/bookings/${res.id}/resend-confirmation`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Confirmation email could not be sent");
      setEmailNotice("Confirmation email sent.");
    } catch (error) {
      setEmailNotice(error instanceof Error ? error.message : "Confirmation email could not be sent");
    } finally {
      setEmailBusy(false);
    }
  }

  const STATUS_ACTIONS: Record<string, Array<{ labelKey: string; status: string; color: string; isLoss?: boolean }>> = {
    PENDING:          [{ labelKey: "operations.actAccept", status: "ACKNOWLEDGED", color: "#1d4ed8" }, { labelKey: "operations.actWaitlist", status: "WAITLISTED", color: "#7e22ce" }, { labelKey: "operations.actReject", status: "CANCELLED", color: "#be123c", isLoss: true }],
    PENDING_APPROVAL: [{ labelKey: "operations.actAccept", status: "CONFIRMED",    color: "#1d4ed8" }, { labelKey: "operations.actWaitlist", status: "WAITLISTED", color: "#7e22ce" }, { labelKey: "operations.actReject", status: "CANCELLED", color: "#be123c", isLoss: true }],
    ACKNOWLEDGED: [{ labelKey: "operations.actMarkArrived", status: "ARRIVED",      color: "#065f46" }, { labelKey: "operations.actWaitlist",    status: "WAITLISTED", color: "#7e22ce" }, { labelKey: "operations.actNoShow",  status: "NO_SHOW",   color: "#be123c", isLoss: true }, { labelKey: "operations.actCancel", status: "CANCELLED", color: "#94a3b8", isLoss: true }],
    WAITLISTED:   [{ labelKey: "operations.actMarkArrived", status: "ARRIVED",      color: "#065f46" }, { labelKey: "operations.actNoShow",      status: "NO_SHOW",    color: "#be123c", isLoss: true }, { labelKey: "operations.actCancel", status: "CANCELLED", color: "#94a3b8", isLoss: true }],
    ARRIVED:      [{ labelKey: "operations.actSeatGuest",   status: "SEATED",       color: "#15803d" }, { labelKey: "operations.actNoShow",      status: "NO_SHOW",    color: "#be123c", isLoss: true }],
    SEATED:       [{ labelKey: "operations.actComplete",    status: "COMPLETED",    color: "#475569" }],
  };

  const actions = STATUS_ACTIONS[res.status] ?? [];
  const approvalSpaces = scheduledSpaces.filter((space) => space.isActive && space.reservable);

  return (
    <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 420, background: "#fff", borderLeft: "1px solid #e2e8f0", zIndex: 200, display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.1)" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{res.contactName}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
            <StatusBadge status={res.status} />
            <SourceBadge source={res.source} />
            <span style={{ fontSize: 11, color: "#94a3b8", alignSelf: "center" }}>{res.partySize} {t("host", "card.guests")}</span>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8", lineHeight: 1, padding: "4px 8px" }}>✕</button>
      </div>

      {/* Guest info */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
        {[
          { labelKey: "operations.fieldTime",          val: fmtTime(res.reservationDate) },
          { labelKey: "operations.fieldZone",           val: res.zone?.name ?? res.conceptRequested ?? "—" },
          { labelKey: "operations.fieldOccasion",       val: res.occasion ?? "—" },
          { labelKey: "operations.fieldReferredBy",     val: refName ? `${refName}${refType ? ` (${REFERRER_TYPE_LABEL[refType] ?? refType})` : ""}` : "—" },
          { labelKey: "operations.fieldTable",          val: res.assignedTableLabel ?? "—" },
          { labelKey: "operations.fieldCommission",     val: res.commissionEligible ? `✓ ${t("host", "operations.validated")}` : t("host", "operations.pending") },
          { labelKey: "operations.fieldAssignedSpace",  val: res.assignedSpace?.name ?? "—" },
          { labelKey: "operations.fieldRequestedSpace", val: res.requestedSpace?.name ?? "—" },
        ].map(({ labelKey, val }) => (
          <div key={labelKey}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>{t("host", labelKey)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", marginTop: 1 }}>{val}</div>
          </div>
        ))}
      </div>

      {res.notes && (
        <div style={{ padding: "10px 24px", borderBottom: "1px solid #f1f5f9", background: "#fffbeb" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#92400e", marginBottom: 3 }}>{t("host", "operations.guestNotes")}</div>
          <div style={{ fontSize: 12, color: "#1e293b" }}>{res.notes}</div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
        {(["actions", "journey"] as const).map(v => (
          <button key={v} onClick={() => setTab(v)} style={{ flex: 1, padding: "12px", border: "none", background: "none", fontSize: 12, fontWeight: tab === v ? 700 : 500, color: tab === v ? "#0f172a" : "#94a3b8", borderBottom: tab === v ? "2px solid #0f172a" : "2px solid transparent", cursor: "pointer", textTransform: "capitalize" }}>
            {v === "actions" ? t("host", "operations.tabActions") : t("host", "operations.tabJourney")}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {eventDetails && (
          <div role="dialog" aria-modal="true" aria-label="Section unavailable due to event" style={{ marginBottom: 12, padding: 14, borderRadius: 10, background: "#fffbeb", border: "1px solid #f59e0b" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#92400e" }}>
              {eventDetails.kind === "PUBLIC_EVENT" ? eventDetails.title ?? "Event in this section" : "Section blocked by a private event"}
            </div>
            <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, color: "#78350f" }}>{eventDetails.message}</div>
            {approvalSpaces.some((space) => !space.eventConflict && space.available >= res.partySize) && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#92400e" }}>
                Available alternatives: {approvalSpaces.filter((space) => !space.eventConflict && space.available >= res.partySize).map((space) => space.name).join(", ")}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {eventDetails.href && <a href={eventDetails.href} target="_blank" rel="noreferrer" style={{ fontSize: 10, fontWeight: 700, color: "#92400e" }}>View event</a>}
              <button type="button" onClick={() => setEventDetails(null)} style={{ marginLeft: "auto", border: 0, background: "transparent", color: "#92400e", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Choose another section</button>
            </div>
          </div>
        )}
        {tab === "actions" && !showLossForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(res.status === "CONFIRMED" || res.statusLogs.some((log) => log.toStatus === "CONFIRMED")) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => void resendConfirmation()} disabled={emailBusy}
                  style={{ padding: "7px 11px", borderRadius: 7, border: "1.5px solid #64748b", background: "#fff", color: "#334155", fontSize: 11, fontWeight: 700, cursor: emailBusy ? "wait" : "pointer" }}>
                  {emailBusy ? "Sending…" : "Resend confirmation"}
                </button>
                {emailNotice && <span role="status" style={{ fontSize: 10, color: emailNotice.endsWith("sent.") ? "#15803d" : "#be123c" }}>{emailNotice}</span>}
              </div>
            )}
            {/* Space assignment — available for all active reservations */}
            {res.status !== "PENDING_APPROVAL" && spaces.length > 0 && !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(res.status) && (
              <div style={{ marginBottom: 10, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 8 }}>{t("host", "operations.spaceAssignment")}</div>
                {spaceWarning?.overCapacity && (
                  <div style={{ padding: "8px 10px", borderRadius: 6, background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c", fontSize: 11, marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{t("host", "operations.spaceWarning")}</div>
                    <div style={{ fontSize: 10, color: "#92400e", marginBottom: 6 }}>
                      {spaceWarning.partySize ?? res.partySize} guests · {spaceWarning.available ?? 0} covers free of {spaceWarning.capacity ?? "?"}
                    </div>
                    <button onClick={() => { void handleAssignSpace(true); }} disabled={assigningSpace}
                      style={{ padding: "5px 12px", borderRadius: 5, border: "1.5px solid #c2410c", background: "#c2410c", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {assigningSpace ? "…" : t("host", "operations.spaceWarningOverride")}
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={selectedSpaceId} onChange={e => { setSelectedSpaceId(e.target.value); setSpaceWarning(null); }}
                    style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a", background: "#fff" }}>
                    <option value="">{t("host", "operations.spacePlaceholder")}</option>
                    {spaces.filter(s => s.isActive && s.reservable).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.held}/{s.capacity}) {s.utilPct >= 100 ? "⚠" : ""}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => { void handleAssignSpace(); }} disabled={!selectedSpaceId || assigningSpace}
                    style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: selectedSpaceId ? "#0f172a" : "#e2e8f0", color: selectedSpaceId ? "#fff" : "#94a3b8", fontSize: 11, fontWeight: 700, cursor: selectedSpaceId ? "pointer" : "not-allowed" }}>
                    {assigningSpace ? "…" : t("host", "operations.assignSpace")}
                  </button>
                </div>
              </div>
            )}

            {res.status === "PENDING_APPROVAL" && (
              <div style={{ marginBottom: 8, padding: "12px 14px", background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7e22ce", marginBottom: 8 }}>Confirmation plan</div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Confirmed date and time</label>
                <input
                  type="datetime-local"
                  value={confirmedReservationDate}
                  onChange={(event) => setConfirmedReservationDate(event.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", background: "#fff", color: "#0f172a", fontSize: 12 }}
                />
                <div style={{ marginTop: 8, fontSize: 10, color: "#64748b", lineHeight: 1.4 }}>
                  Select the final dining space and time. The exact table is assigned when the guest arrives; the requested space remains in the audit trail if the group is moved.
                </div>
                <div style={{ marginTop: 12, fontSize: 10, fontWeight: 700, color: "#64748b" }}>Final dining section</div>
                {scheduledSpacesLoading && <div role="status" style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>Checking booking-time availability…</div>}
                {scheduledSpacesError && (
                  <div role="alert" style={{ marginTop: 8, padding: 9, borderRadius: 7, background: "#fff1f2", color: "#be123c", fontSize: 11 }}>
                    {scheduledSpacesError}. Change the time to retry or refresh the board.
                  </div>
                )}
                {!scheduledSpacesLoading && !scheduledSpacesError && (
                  <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                    {approvalSpaces.map((space) => {
                      const selected = selectedSpaceId === space.id;
                      const requested = res.requestedSpace?.id === space.id;
                      const blocked = Boolean(space.eventConflict);
                      const fits = space.available >= res.partySize;
                      return (
                        <button
                          key={space.id}
                          type="button"
                          aria-pressed={selected}
                          aria-haspopup={blocked ? "dialog" : undefined}
                          onClick={() => {
                            if (space.eventConflict) {
                              setEventDetails(space.eventConflict);
                              return;
                            }
                            setSelectedSpaceId(space.id);
                            setEventDetails(null);
                          }}
                          style={{ padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${selected ? "#7e22ce" : blocked ? "#f59e0b" : "#e2e8f0"}`, background: selected ? "#faf5ff" : "#fff", textAlign: "left", cursor: blocked ? "help" : "pointer" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{space.name}</span>
                            <span style={{ fontSize: 9, fontWeight: 800, color: blocked ? "#b45309" : fits ? "#15803d" : "#be123c" }}>
                              {blocked ? "EVENT BLOCK" : `${Math.max(0, space.available)} COVERS FREE`}
                            </span>
                          </div>
                          <div style={{ marginTop: 3, fontSize: 10, color: "#64748b" }}>
                            {blocked
                              ? "Unavailable due to event — view details"
                              : requested
                                ? "Guest requested · recommended when available"
                                : fits
                                  ? "Available alternative"
                                  : "Insufficient capacity — F&B Director override required"}
                          </div>
                        </button>
                      );
                    })}
                    {approvalSpaces.length === 0 && <div role="alert" style={{ fontSize: 11, color: "#be123c" }}>No reservable dining sections are configured for this venue.</div>}
                  </div>
                )}
              </div>
            )}

            {res.status === "ARRIVED" && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                  {t("host", "operations.tableAssignment")}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={tableLabel} onChange={e => setTableLabel(e.target.value)} placeholder={t("host", "operations.tablePlaceholder")} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a" }} />
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {zones.flatMap(z => z.tables).slice(0, 12).map(tb => (
                    <button key={tb.id} onClick={() => setTableLabel(tb.name)} style={{ padding: "4px 10px", borderRadius: 6, border: "1.5px solid #e2e8f0", background: tableLabel === tb.name ? "#0f172a" : "#fff", color: tableLabel === tb.name ? "#fff" : "#475569", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                      {tb.name} · {tb.seats} seats{tb.mergeable ? " · mergeable" : ""}{tb.isVip ? " ✦" : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {actions.map(a => {
              const confirmingApproval = res.status === "PENDING_APPROVAL" && a.status === "CONFIRMED";
              const selectedApprovalSpace = approvalSpaces.find((space) => space.id === selectedSpaceId);
              const confirmationReady = !!selectedSpaceId && !!confirmedReservationDate && !scheduledSpacesLoading && !scheduledSpacesError && !!selectedApprovalSpace && !selectedApprovalSpace.eventConflict;
              return <button key={a.status}
                disabled={confirmingApproval && !confirmationReady}
                onClick={() => {
                  if (a.isLoss) return triggerLoss(a.status);
                  if (confirmingApproval) {
                    return onAction(res.id, a.status, {
                      assignedSpaceId: selectedSpaceId,
                      confirmedReservationDate: new Date(confirmedReservationDate).toISOString(),
                    }, setEventDetails);
                  }
                  return onAction(res.id, a.status, a.status === "SEATED" ? { tableLabel } : {});
                }}
                style={{ padding: "12px 16px", borderRadius: 10, border: `2px solid ${a.color}`, background: a.status === "SEATED" ? a.color : "transparent", color: a.status === "SEATED" ? "#fff" : a.color, fontSize: 13, fontWeight: 700, cursor: confirmingApproval && !confirmationReady ? "not-allowed" : "pointer", opacity: confirmingApproval && !confirmationReady ? 0.45 : 1, textAlign: "left" }}>
                {t("host", a.labelKey)}
                {confirmingApproval && !confirmationReady ? " · select space and time" : ""}
              </button>;
            })}
          </div>
        )}

        {tab === "actions" && showLossForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#be123c" }}>{t("host", "operations.lossFormTitle")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {LOSS_REASONS.map(r => (
                <button key={r.value} onClick={() => setLossReason(r.value)} style={{ padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${lossReason === r.value ? "#be123c" : "#e2e8f0"}`, background: lossReason === r.value ? "#fff1f2" : "#fff", color: lossReason === r.value ? "#be123c" : "#475569", fontSize: 12, fontWeight: lossReason === r.value ? 700 : 500, cursor: "pointer", textAlign: "left" }}>
                  {t("host", `loss.${r.value}`)}
                </button>
              ))}
            </div>
            <textarea value={lossNotes} onChange={e => setLossNotes(e.target.value)} placeholder={t("host", "operations.lossNotesPlaceholder")} rows={2} style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowLossForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("host", "operations.lossBack")}</button>
              <button onClick={submitLoss} disabled={!lossReason} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: lossReason ? "#be123c" : "#e2e8f0", color: lossReason ? "#fff" : "#94a3b8", fontSize: 12, fontWeight: 700, cursor: lossReason ? "pointer" : "not-allowed" }}>{t("host", "operations.lossConfirm")}</button>
            </div>
          </div>
        )}

        {tab === "journey" && <JourneyTimeline logs={[...res.statusLogs].reverse()} />}
      </div>
    </div>
  );
}

function BookingCard({ res, onClick }: { res: Reservation; onClick: () => void }) {
  // Same fallback chain as the drawer — see GuestDrawer for the rationale.
  // Card only needs the display name, not the type chip.
  const refName =
    res.attributionSession?.referralActor?.displayName ??
    res.attributionSession?.legacyReferrer?.fullName ??
    res.attributions[0]?.referrer?.fullName ??
    null;
  const c = STATUS_COLOR[res.status] ?? { bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1" };
  const conceptBg = CONCEPT_BG[res.zone?.conceptKey ?? res.conceptRequested ?? ""] ?? "#334155";
  const priorNoShow = (res.guestProfile?.noShowCount ?? 0) > 0;

  return (
    <div onClick={onClick} style={{ background: "#fff", border: `1.5px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "box-shadow 0.15s", marginBottom: 8 }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{res.contactName}</div>
          {res.occasion && <div style={{ fontSize: 11, color: "#7d7269" }}>{res.occasion}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{res.partySize}</div>
          <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase" }}>pax</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ padding: "2px 8px", borderRadius: 99, background: conceptBg, color: "#fff", fontSize: 10, fontWeight: 700 }}>{res.zone?.name ?? res.conceptRequested ?? "Any"}</span>
        {/* Requested space — shown on the card so the host sees it without opening the drawer */}
        {res.requestedSpace && (
          <span style={{ padding: "2px 8px", borderRadius: 99, background: "rgba(200,169,110,0.12)", color: "#c8a96e", border: "1px solid rgba(200,169,110,0.3)", fontSize: 10, fontWeight: 700 }}>
            📍 {res.requestedSpace.name}
          </span>
        )}
        <SourceBadge source={res.source} />
        {priorNoShow && <span style={{ padding: "2px 7px", borderRadius: 99, background: "#fff1f2", color: "#be123c", border: "1px solid #fda4af", fontSize: 10, fontWeight: 700 }}>⚠ No-show history</span>}
        {refName && <span style={{ fontSize: 10, color: "#64748b" }}>via {refName}</span>}
      </div>
      {/* suppressHydrationWarning: fmtTime renders in the client's local
          timezone (e.g. 19:30 Bermuda) while the server renders in UTC
          (22:30); elapsed uses Date.now() which also drifts between
          server-rendered HTML and the moment the client hydrates. Both
          are intentional — we want guest-local time on screen — so we
          tell React not to scream about the mismatch on the initial paint. */}
      <div suppressHydrationWarning style={{ marginTop: 8, fontSize: 10, color: "#94a3b8" }}>{fmtTime(res.reservationDate)} · {elapsed(res.reservationDate)}</div>
      {res.assignedTableLabel && <div style={{ marginTop: 4, fontSize: 10, color: "#15803d", fontWeight: 600 }}>Table: {res.assignedTableLabel}</div>}
    </div>
  );
}

export default function HostOperationsBoard({
  reservations: initial,
  waitlist: initialWl,
  zones,
}: {
  reservations: Reservation[];
  waitlist: WaitlistEntry[];
  zones: VenueZone[];
}) {
  const t = useTranslation();
  const [reservations, setReservations] = useState(initial);
  const [waitlist, setWaitlist] = useState(initialWl);
  const [spaces, setSpaces] = useState<SpaceUtilisation[]>([]);
  const [spaceLoadError, setSpaceLoadError] = useState<string | null>(null);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const deepLinkHandled = useRef(false);
  const [waitlistBusy, setWaitlistBusy] = useState<string | null>(null);

  // Mark-lost / remove handler for stale waitlist entries (Apr 29 2026
  // pre-launch: 4 demo rows from Apr 15 had been clogging the queue
  // because the desktop board had no setter for waitlist state and there
  // was no PATCH/DELETE endpoint at all). NO_SHOW preserves the row for
  // analytics; DELETE actually removes it for true demo cleanup.
  async function handleWaitlistAction(id: string, action: "lost" | "delete") {
    if (waitlistBusy) return;
    setWaitlistBusy(id);
    try {
      const res = action === "delete"
        ? await fetch(`/api/v1/host/waitlist/${id}`, { method: "DELETE" })
        : await fetch(`/api/v1/host/waitlist/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "NO_SHOW" }),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Could not update waitlist entry: ${err?.error ?? res.statusText}`);
        return;
      }
      setWaitlist((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      console.error("[waitlist action]", err);
      alert("Network error updating waitlist entry.");
    } finally {
      setWaitlistBusy(null);
    }
  }
  const [waitTimes, setWaitTimes] = useState<Record<string, number | null>>(Object.fromEntries(zones.map(z => [z.id, z.currentWaitMinutes])));
  const [activeRes, setActiveRes] = useState<Reservation | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [savingZone, setSavingZone] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [boardView, setBoardView] = useState<"operations" | "attendance">("operations");
  const [attendanceSessionId, setAttendanceSessionId] = useState<string>("");

  // Fetch space utilisation on mount and periodically
  const refreshSpaces = useCallback(async () => {
    setSpacesLoading(true);
    try {
      const r = await fetch("/api/v1/host/spaces/utilisation", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `Space availability failed (${r.status})`);
      setSpaces(d.data ?? []);
      setSpaceLoadError(null);
    } catch (error) {
      setSpaces([]);
      setSpaceLoadError(error instanceof Error ? error.message : "Space availability could not be loaded");
    } finally {
      setSpacesLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSpaces();
    const interval = setInterval(refreshSpaces, 30_000);
    return () => clearInterval(interval);
  }, [refreshSpaces]);

  useEffect(() => {
    if (deepLinkHandled.current) return;
    const reservationId = new URLSearchParams(window.location.search).get("reservationId");
    if (!reservationId) return;
    const match = reservations.find((reservation) => reservation.id === reservationId);
    if (match) {
      setActiveRes(match);
      deepLinkHandled.current = true;
    }
  }, [reservations]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/host/queue");
      if (r.ok) {
        const d = await r.json();
        const next: Reservation[] = d.data.reservations ?? [];
        // Stable merge: keep prior object identity for unchanged rows so
        // React preserves DOM/component state and we don't get a flicker.
        setReservations((prev) => {
          const prevById = new Map(prev.map((r) => [r.id, r]));
          let anyChange = prev.length !== next.length;
          const merged = next.map((row, i) => {
            const old = prevById.get(row.id);
            if (old && JSON.stringify(old) === JSON.stringify(row)) {
              if (!anyChange && prev[i]?.id !== row.id) anyChange = true;
              return old;
            }
            anyChange = true;
            return row;
          });
          return anyChange ? merged : prev;
        });
        setLastRefreshTime(new Date().toLocaleTimeString());
      }
    } catch {}
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, 20000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleAction(
    id: string,
    status: string,
    opts?: Record<string, string>,
    onConflict?: (conflict: EventConflictCard) => void,
  ) {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/host/bookings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...opts }),
      });
      if (r.ok) {
        const d = await r.json();
        setReservations(prev => prev.map(res => res.id === id ? { ...res, ...d.data } : res));
        setActiveRes(prev => prev?.id === id ? { ...prev, ...d.data } : prev);
      } else {
        const d = await r.json().catch(() => ({}));
        if (d.code === "EVENT_UNAVAILABLE" && d.eventConflict && onConflict) {
          onConflict(d.eventConflict);
        } else {
          alert(d.error ?? "Could not update this reservation.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function setZoneWait(zoneId: string, minutes: number | null) {
    setWaitTimes(prev => ({ ...prev, [zoneId]: minutes }));
    setSavingZone(zoneId);
    try {
      await fetch(`/api/host/zones/${zoneId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentWaitMinutes: minutes }) });
    } finally {
      setSavingZone(null);
    }
  }

  const filtered = reservations.filter(r => sourceFilter === "all" || r.source === sourceFilter);

  const kpis = [
    { labelKey: "operations.kpiIncoming",   val: filtered.filter(r => ["PENDING", "PENDING_APPROVAL"].includes(r.status)).length, color: "#b45309" },
    { labelKey: "operations.kpiAwaiting",   val: filtered.filter(r => ["ACKNOWLEDGED", "WAITLISTED", "CONFIRMED"].includes(r.status)).length, color: "#7e22ce" },
    { labelKey: "operations.kpiArrived",    val: filtered.filter(r => r.status === "ARRIVED").length, color: "#065f46" },
    { labelKey: "operations.kpiSeated",     val: filtered.filter(r => r.status === "SEATED").length, color: "#15803d" },
    { labelKey: "operations.kpiCompleted",  val: filtered.filter(r => r.status === "COMPLETED").length, color: "#475569" },
    { labelKey: "operations.kpiLost",       val: filtered.filter(r => ["NO_SHOW", "CANCELLED"].includes(r.status)).length, color: "#be123c" },
    { labelKey: "operations.kpiCovers",     val: filtered.filter(r => !["CANCELLED", "NO_SHOW"].includes(r.status)).reduce((s, r) => s + r.partySize, 0), color: "#0f172a" },
    { labelKey: "operations.kpiWaitlist",   val: waitlist.length, color: "#0ea5e9" },
  ];

  const conversion = (() => {
    const base = filtered.filter(r => !["PENDING", "PENDING_APPROVAL"].includes(r.status)).length;
    const ok = filtered.filter(r => ["SEATED", "COMPLETED"].includes(r.status)).length;
    return base > 0 ? Math.round((ok / base) * 100) : 0;
  })();

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "var(--font-sans)", position: "relative" }}>
      {/* Overlay when drawer open */}
      {activeRes && <div onClick={() => setActiveRes(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", zIndex: 100 }} />}

      {/* Sticky top nav — Platform return */}
      <header style={{
        position: "sticky", top: 0, zIndex: 150,
        background: "rgba(13,13,15,0.96)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 20px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Brandmark size={18} color="#e8d9b3" showTagline={false} />
            <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#c8a96e" }}>
              {t("host", "operations.boardTitle")}
            </span>
          </div>
          <a href="/en" style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600, color: "#9ca3af",
            textDecoration: "none", padding: "6px 12px",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
          }}>
            ← {t("host", "operations.platform")}
          </a>
        </div>
      </header>

      {/* Header */}
      <div style={{ background: "#0f172a", color: "#fff", padding: "20px 24px 18px" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>OKÜ Hospitality Group</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{t("host", "operations.floorControl")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: 3 }}>
              {(["operations", "attendance"] as const).map((v) => (
                <button key={v} onClick={() => setBoardView(v)}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: boardView === v ? 700 : 400, background: boardView === v ? "white" : "transparent", color: boardView === v ? "#0f172a" : "rgba(255,255,255,0.55)" }}>
                  {v === "operations" ? `🏨 ${t("host", "operations.viewFloor")}` : `🎫 ${t("host", "operations.viewAttendance")}`}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{t("host", "operations.liveRefresh")}{busy ? ` · ${t("host", "operations.saving")}` : ""}</div>
          </div>
        </div>
        {/* KPI Strip */}
        <div style={{ display: "flex", gap: 20, marginTop: 16, overflowX: "auto", paddingBottom: 2 }}>
          {kpis.map(k => (
            <div key={k.labelKey} style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: k.color === "#0f172a" ? "#fff" : k.color }}>{k.val}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 1 }}>{t("host", k.labelKey)}</div>
            </div>
          ))}
          <div style={{ flexShrink: 0, paddingLeft: 12, borderLeft: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: conversion >= 70 ? "#4ade80" : conversion >= 40 ? "#fbbf24" : "#f87171" }}>{conversion}%</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 1 }}>{t("host", "operations.kpiConversion")}</div>
          </div>
        </div>
      </div>

      {/* Operations View — Zone, Filters, Kanban, Waitlist */}
      {boardView === "operations" && <><div style={{ display: "flex", gap: 8, padding: "12px 20px", borderBottom: "1px solid #e2e8f0", background: "#fff", overflowX: "auto" }}>
        {spaceLoadError && (
          <div role="alert" style={{ minWidth: 320, padding: "10px 12px", borderRadius: 10, border: "1px solid #fecaca", background: "#fff1f2", color: "#9f1239", fontSize: 11 }}>
            <div style={{ fontWeight: 800, marginBottom: 3 }}>Dining-space availability unavailable</div>
            <div>{spaceLoadError}</div>
            <button type="button" onClick={() => void refreshSpaces()} disabled={spacesLoading} style={{ marginTop: 7, border: "1px solid #fb7185", borderRadius: 6, background: "#fff", color: "#be123c", padding: "4px 9px", fontSize: 10, fontWeight: 700, cursor: spacesLoading ? "wait" : "pointer" }}>
              {spacesLoading ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}
        {/* Space utilisation (from CapacityHold — overlap-aware) */}
        {spaces.length > 0 ? spaces.map(s => {
          const bg = s.utilPct > 85 ? "#ef4444" : s.utilPct > 60 ? "#f59e0b" : "#10b981";
          return (
            <div key={s.id} style={{ minWidth: 130, background: "#f8fafc", border: `1px solid ${s.utilPct >= 100 ? "#fda4af" : "#e2e8f0"}`, borderRadius: 10, padding: "10px 12px", flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 5, textTransform: "uppercase" }}>{s.name}</div>
              <div style={{ height: 5, borderRadius: 3, background: "#e2e8f0", overflow: "hidden", marginBottom: 4 }}>
                <div style={{ height: "100%", background: bg, width: `${Math.min(s.utilPct, 100)}%`, borderRadius: 3, transition: "width 0.4s" }} />
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{s.held}/{s.capacity} covers {s.utilPct >= 100 ? "⚠" : ""}</div>
            </div>
          );
        }) : zones.map(z => {
          const seated = filtered.filter(r => (r.zone?.conceptKey ?? r.conceptRequested) === z.conceptKey && r.status === "SEATED").reduce((s, r) => s + r.partySize, 0);
          const pct = Math.min(Math.round((seated / z.capacityCovers) * 100), 100);
          const bg = CONCEPT_BG[z.conceptKey] ?? "#334155";
          return (
            <div key={z.id} style={{ minWidth: 110, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 5, textTransform: "uppercase" }}>{z.name}</div>
              <div style={{ height: 5, borderRadius: 3, background: "#e2e8f0", overflow: "hidden", marginBottom: 4 }}>
                <div style={{ height: "100%", background: pct > 85 ? "#ef4444" : pct > 60 ? "#f59e0b" : bg, width: `${pct}%`, borderRadius: 3, transition: "width 0.4s" }} />
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{seated}/{z.capacityCovers}</div>
            </div>
          );
        })}
      </div>

      {/* Wait Time Controls */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>{t("host", "operations.waitTimesTitle")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {zones.map(z => {
            const wait = waitTimes[z.id] ?? null;
            return (
              <div key={z.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", minWidth: 55 }}>{z.name}</div>
                <button onClick={() => setZoneWait(z.id, Math.max(0, (wait ?? 0) - 5))} style={{ width: 26, height: 26, borderRadius: 5, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 14, cursor: "pointer" }}>−</button>
                <div style={{ textAlign: "center", minWidth: 44 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: wait ? "#dc2626" : "#cbd5e1" }}>{wait ?? "—"}</div>
                  <div style={{ fontSize: 8, color: "#94a3b8", textTransform: "uppercase" }}>min</div>
                </div>
                <button onClick={() => setZoneWait(z.id, (wait ?? 0) + 5)} style={{ width: 26, height: 26, borderRadius: 5, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 14, cursor: "pointer" }}>+</button>
                {wait ? <button onClick={() => setZoneWait(z.id, null)} style={{ fontSize: 10, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}>{t("host", "operations.clear")}</button> : null}
                {savingZone === z.id && <span style={{ fontSize: 10, color: "#16a34a" }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: "10px 20px", display: "flex", gap: 8, borderBottom: "1px solid #e2e8f0", background: "#fff", alignItems: "center" }}>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid #e2e8f0", fontSize: 12, background: "#fff", color: "#334155", cursor: "pointer" }}>
          <option value="all">{t("host", "operations.allSources")}</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div style={{ marginLeft: "auto", fontSize: 10, color: "#94a3b8" }}>
          {filtered.length} {t("host", "operations.bookings")} · {t("host", "operations.lastRefresh")} {lastRefreshTime ?? ""}
        </div>
        <button onClick={refresh} style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 11, cursor: "pointer", color: "#475569", fontWeight: 600 }}>↻ {t("host", "operations.refresh")}</button>
      </div>

      {/* Kanban columns */}
      <div style={{ display: "flex", gap: 12, padding: "16px 20px", overflowX: "auto", minHeight: 400 }}>
        {PANEL_GROUPS.map(group => {
          const cols = filtered.filter(r => group.statuses.includes(r.status));
          return (
            <div key={group.labelKey} style={{ minWidth: 260, maxWidth: 300, flex: "0 0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: group.accent }} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569" }}>{t("host", group.labelKey)}</span>
                <span style={{ marginLeft: "auto", background: "#f1f5f9", color: "#64748b", borderRadius: 99, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{cols.length}</span>
              </div>
              <div style={{ minHeight: 80 }}>
                {cols.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 0", color: "#cbd5e1", fontSize: 12 }}>{t("host", "operations.empty")}</div>
                ) : (
                  cols.map(r => <BookingCard key={r.id} res={r} onClick={() => setActiveRes(r)} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Waitlist row */}
      {waitlist.length > 0 && (
        <div style={{ padding: "0 20px 24px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>{t("host", "operations.waitlistQueue")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {waitlist.map((w, i) => {
              const isBusy = waitlistBusy === w.id;
              return (
                <div key={w.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", minWidth: 180, opacity: isBusy ? 0.5 : 1 }}>
                  <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>#{i + 1} {t("host", "operations.waiting")}</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{w.contactName}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{w.partySize} {t("host", "card.guests")} · {w.conceptRequested ?? t("host", "operations.any")}</div>
                  {w.estimatedWaitMinutes && <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginTop: 3 }}>~{w.estimatedWaitMinutes}m</div>}
                  <div suppressHydrationWarning style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{elapsed(w.createdAt)}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleWaitlistAction(w.id, "lost")}
                      style={{
                        flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                        padding: "5px 8px", border: "1px solid #fbbf24", background: "#fffbeb", color: "#92400e",
                        borderRadius: 6, cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                      title="Mark as lost (no-show)"
                    >
                      Lost
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        if (confirm(`Remove ${w.contactName} from the waitlist permanently?`)) {
                          handleWaitlistAction(w.id, "delete");
                        }
                      }}
                      style={{
                        flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                        padding: "5px 8px", border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b",
                        borderRadius: 6, cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                      title="Remove permanently"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </>}

      {/* Attendance View */}
      {boardView === "attendance" && (
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{t("host", "operations.sessionId")}:</div>
            <input
              type="text"
              value={attendanceSessionId}
              onChange={(e) => setAttendanceSessionId(e.target.value)}
              placeholder={t("host", "operations.sessionPlaceholder")}
              style={{ flex: 1, maxWidth: 340, padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
            />
          </div>
          <LiveAttendanceFeed sessionId={attendanceSessionId || undefined} />
        </div>
      )}

      {/* Guest Journey Drawer */}
      {activeRes && boardView === "operations" && (
        <GuestDrawer
          res={activeRes}
          zones={zones}
          spaces={spaces}
          onClose={() => setActiveRes(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
