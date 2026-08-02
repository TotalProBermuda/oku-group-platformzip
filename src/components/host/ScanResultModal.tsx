"use client";

import { useEffect, useState, useCallback } from "react";

// ScanResultModal opens after the host scans a QR. It self-fetches the
// universal scan resolver, branches on entity kind, and exposes the right
// hot buttons inline so the host can complete the action without leaving
// the modal:
//   • RESERVATION → Mark Arrived (default), Mark Seated, Partial-arrival
//   • TICKET      → Check In, then chain-through to remaining attendees
//                   in the same order
//   • UNKNOWN     → friendly "not a guest QR" state
//
// Mutations always call existing endpoints — this component is a thin UI
// orchestrator so the schema changes stay isolated to the API layer.

type Reservation = {
  id: string;
  confirmationCode: string | null;
  contactName: string;
  partySize: number;
  status: string;
  reservationDate: string;
  occasion: string | null;
  notes: string | null;
  assignedTableLabel: string | null;
  arrivalConfirmedAt: string | null;
  arrivedHeadcount: number | null;
  seatedAt: string | null;
  zone: { name: string } | null;
  attributions: Array<{ referrer: { fullName: string; referrerType: string } | null }>;
  attributionSession: {
    id: string;
    source: string;
    referralActor: { displayName: string; actorType: string } | null;
    legacyReferrer: { fullName: string; referrerType: string } | null;
  } | null;
};

type Ticket = {
  id: string;
  code: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  ticketStatus: string;
  checkedInAt: string | null;
  orderId: string;
  ticketType: { name: string } | null;
  session: { id: string; title: string } | null;
};

type OrderTicket = {
  id: string;
  code: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  ticketStatus: string;
  checkedInAt: string | null;
  ticketType: { name: string } | null;
};

type ScanResp =
  | { ok: true; kind: "RESERVATION"; reservation: Reservation }
  | { ok: true; kind: "TICKET"; ticket: Ticket; siblingsRemaining: number }
  | { ok: false; kind?: "UNKNOWN"; error?: string };

type Props = {
  code: string;
  onClose: () => void;
  onMutated: () => void;
};

export default function ScanResultModal({ code, onClose, onMutated }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ScanResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Action state
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Reservation-specific
  const [seatTable, setSeatTable] = useState("");
  const [showPartial, setShowPartial] = useState(false);
  const [partial, setPartial] = useState<string>("");
  const [showSeatPicker, setShowSeatPicker] = useState(false);

  // Ticket chain-through
  const [orderTickets, setOrderTickets] = useState<OrderTicket[] | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  // Initial scan resolution. Re-runs whenever `code` changes (e.g. when
  // the chain-through advances to the next ticket — we re-key by setting
  // a fresh activeTicketId then re-fetching the order's tickets list).
  const resolve = useCallback(async () => {
    setLoading(true);
    setData(null);
    setError(null);
    setActionMsg(null);
    try {
      const r = await fetch("/api/v1/host/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = (await r.json()) as ScanResp;
      setData(d);
      if (d.ok && d.kind === "RESERVATION") {
        setSeatTable(d.reservation.assignedTableLabel ?? "");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to resolve scan";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { resolve(); }, [resolve]);

  // Reservation action helpers — all hit the existing PATCH .../status route.
  async function reservationAction(
    res: Reservation,
    next: "ARRIVED" | "SEATED",
    extra?: { tableLabel?: string; arrivedHeadcount?: number }
  ) {
    setBusy(true);
    setActionMsg(null);
    try {
      const r = await fetch(`/api/v1/host/bookings/${res.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, ...extra }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error ?? `Couldn't move to ${next}`);
      setActionMsg(
        next === "ARRIVED"
          ? extra?.arrivedHeadcount
            ? `Marked arrived (${extra.arrivedHeadcount} of ${res.partySize})`
            : "Marked arrived"
          : `Seated at ${extra?.tableLabel ?? res.assignedTableLabel ?? "table"}`
      );
      onMutated();
      // Brief delay so the success message is visible before the modal
      // closes — feels less abrupt than an instant dismiss.
      setTimeout(onClose, 900);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Action failed";
      setActionMsg(`✗ ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  // Ticket: check in the active ticket, then refresh the order list so the
  // chain-through state stays in sync.
  async function checkInTicket(ticketId: string) {
    setBusy(true);
    setActionMsg(null);
    try {
      const r = await fetch(`/api/v1/host/tickets/${ticketId}/checkin`, { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Check-in failed");
      setActionMsg(d.alreadyCheckedIn ? "Already checked in" : "Checked in");
      onMutated();
      // Refresh sibling list so the chain-through reflects the new status.
      if (data?.ok && data.kind === "TICKET") {
        await loadOrderTickets(data.ticket.orderId);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Check-in failed";
      setActionMsg(`✗ ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadOrderTickets(orderId: string) {
    try {
      const r = await fetch(`/api/v1/host/orders/${orderId}/tickets`);
      const d = await r.json();
      if (!r.ok || !d.ok) return;
      setOrderTickets(d.order.tickets as OrderTicket[]);
    } catch { /* non-fatal — chain-through just stays hidden */ }
  }

  // Auto-load order siblings whenever a ticket is shown so the host sees
  // the chain-through immediately (without an extra click).
  useEffect(() => {
    if (data?.ok && data.kind === "TICKET" && data.siblingsRemaining > 0) {
      loadOrderTickets(data.ticket.orderId);
    }
  }, [data]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f0c0a", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16, padding: 22,
          width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
          color: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#c8a96e" }}>
            Scan Result
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {loading && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            Looking up <span style={{ fontFamily: "ui-monospace, monospace", color: "#d1d5db" }}>{code}</span>…
          </div>
        )}

        {error && (
          <div style={{ padding: 18, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#fca5a5", fontSize: 13 }}>
            {error}
          </div>
        )}

        {!loading && data && !data.ok && (
          <div>
            <div style={{ padding: 18, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#fca5a5", fontSize: 13, marginBottom: 12 }}>
              Not a recognised guest QR.
              <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af", fontFamily: "ui-monospace, monospace" }}>{code}</div>
            </div>
            <button onClick={onClose} style={primaryBtn("#6b7280")}>Close</button>
          </div>
        )}

        {!loading && data?.ok && data.kind === "RESERVATION" && (
          <ReservationView
            res={data.reservation}
            seatTable={seatTable}
            setSeatTable={setSeatTable}
            showSeatPicker={showSeatPicker}
            setShowSeatPicker={setShowSeatPicker}
            showPartial={showPartial}
            setShowPartial={setShowPartial}
            partial={partial}
            setPartial={setPartial}
            busy={busy}
            actionMsg={actionMsg}
            onArrive={() => reservationAction(data.reservation, "ARRIVED")}
            onArrivePartial={() => {
              const n = parseInt(partial, 10);
              if (!Number.isInteger(n) || n < 1) { setActionMsg("Enter a valid number"); return; }
              reservationAction(data.reservation, "ARRIVED", { arrivedHeadcount: n });
            }}
            onSeat={() => {
              const t = seatTable.trim();
              if (!t) { setActionMsg("Pick a table to seat at"); setShowSeatPicker(true); return; }
              reservationAction(data.reservation, "SEATED", { tableLabel: t });
            }}
          />
        )}

        {!loading && data?.ok && data.kind === "TICKET" && (
          <TicketView
            ticket={data.ticket}
            siblingsInitiallyRemaining={data.siblingsRemaining}
            orderTickets={orderTickets}
            activeTicketId={activeTicketId ?? data.ticket.id}
            busy={busy}
            actionMsg={actionMsg}
            onCheckIn={(ticketId) => checkInTicket(ticketId)}
            onAdvance={(ticketId) => {
              setActiveTicketId(ticketId);
              setActionMsg(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Reservation view ────────────────────────────────────────────────────────

function ReservationView({
  res, seatTable, setSeatTable, showSeatPicker, setShowSeatPicker,
  showPartial, setShowPartial, partial, setPartial,
  busy, actionMsg, onArrive, onArrivePartial, onSeat,
}: {
  res: Reservation;
  seatTable: string;
  setSeatTable: (v: string) => void;
  showSeatPicker: boolean;
  setShowSeatPicker: (v: boolean) => void;
  showPartial: boolean;
  setShowPartial: (v: boolean) => void;
  partial: string;
  setPartial: (v: string) => void;
  busy: boolean;
  actionMsg: string | null;
  onArrive: () => void;
  onArrivePartial: () => void;
  onSeat: () => void;
}) {
  const refName =
    res.attributionSession?.referralActor?.displayName
      ?? res.attributionSession?.legacyReferrer?.fullName
      ?? res.attributions[0]?.referrer?.fullName
      ?? null;
  const isArrived = !!res.arrivalConfirmedAt;
  const isSeated = !!res.seatedAt;
  const arrivedAt = res.arrivalConfirmedAt ? new Date(res.arrivalConfirmedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const resTime = new Date(res.reservationDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: "white" }}>{res.contactName}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span>{resTime}</span>
          <span>· {res.partySize} guests</span>
          {res.zone && <span>· {res.zone.name}</span>}
          {res.confirmationCode && (
            <span style={{
              fontFamily: "ui-monospace, monospace", fontSize: 10, fontWeight: 700,
              color: "#c8a96e", background: "rgba(200,169,110,0.08)",
              border: "1px solid rgba(200,169,110,0.2)", borderRadius: 4,
              padding: "1px 6px", letterSpacing: "0.04em",
            }}>{res.confirmationCode}</span>
          )}
        </div>
        {refName && (
          <div style={{ fontSize: 11, color: "#c8a96e", marginTop: 6 }}>via {refName}</div>
        )}
        {res.occasion && (
          <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 4 }}>Occasion · {res.occasion}</div>
        )}
      </div>

      {/* Status pill */}
      <div style={{ marginBottom: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={statusPill(res.status)}>{res.status}</span>
        {isArrived && (
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            Arrived at {arrivedAt}
            {res.arrivedHeadcount && res.arrivedHeadcount < res.partySize
              ? ` · ${res.arrivedHeadcount} of ${res.partySize}` : ""}
          </span>
        )}
      </div>

      {actionMsg && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 8,
          background: actionMsg.startsWith("✗") ? "rgba(248,113,113,0.1)" : "rgba(16,185,129,0.1)",
          border: `1px solid ${actionMsg.startsWith("✗") ? "rgba(248,113,113,0.3)" : "rgba(16,185,129,0.35)"}`,
          color: actionMsg.startsWith("✗") ? "#fca5a5" : "#a7f3d0",
          fontSize: 12,
        }}>
          {actionMsg}
        </div>
      )}

      {/* Seat picker (inline) */}
      {showSeatPicker && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Table</div>
          <input
            value={seatTable}
            onChange={(e) => setSeatTable(e.target.value)}
            placeholder="e.g. T2"
            autoFocus
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "8px 10px", borderRadius: 8,
              background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)",
              color: "white", fontSize: 14, outline: "none",
            }}
          />
        </div>
      )}

      {/* Partial arrival input */}
      {showPartial && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)" }}>
          <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            How many of {res.partySize} are here?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number" min="1" max={res.partySize}
              value={partial}
              onChange={(e) => setPartial(e.target.value)}
              autoFocus
              placeholder={String(res.partySize - 1)}
              style={{
                flex: 1, padding: "8px 10px", borderRadius: 8,
                background: "rgba(0,0,0,0.4)", border: "1px solid rgba(251,191,36,0.4)",
                color: "white", fontSize: 14, outline: "none",
              }}
            />
            <button disabled={busy} onClick={onArrivePartial} style={primaryBtn("#fbbf24")}>
              {busy ? "…" : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {!isSeated && (
          <button
            onClick={isArrived || showSeatPicker ? onSeat : () => setShowSeatPicker(true)}
            disabled={busy}
            style={primaryBtn("#10b981", true)}
          >
            {busy ? "Working…" : (isArrived ? "Mark Seated" : (showSeatPicker ? "Confirm Seat" : "Mark Seated"))}
          </button>
        )}

        {!isArrived && !showPartial && (
          <button onClick={onArrive} disabled={busy} style={primaryBtn("#34d399")}>
            Mark Arrived (whole party)
          </button>
        )}

        {!isArrived && !showPartial && (
          <button onClick={() => setShowPartial(true)} disabled={busy} style={secondaryBtn()}>
            Partial — only some are here
          </button>
        )}
      </div>
    </div>
  );
}

// ── Ticket view ─────────────────────────────────────────────────────────────

function TicketView({
  ticket, siblingsInitiallyRemaining, orderTickets, activeTicketId,
  busy, actionMsg, onCheckIn, onAdvance,
}: {
  ticket: Ticket;
  siblingsInitiallyRemaining: number;
  orderTickets: OrderTicket[] | null;
  activeTicketId: string;
  busy: boolean;
  actionMsg: string | null;
  onCheckIn: (ticketId: string) => void;
  onAdvance: (ticketId: string) => void;
}) {
  // The "active" ticket is whichever the host is currently focused on:
  // either the originally-scanned ticket or one they tapped from the
  // chain-through list. Look it up in the order tickets list (which
  // carries the freshest status post-check-in) before falling back to
  // the originally-scanned record.
  const active: Ticket | OrderTicket =
    orderTickets?.find((t) => t.id === activeTicketId) ?? ticket;
  const isCheckedIn = active.ticketStatus === "CHECKED_IN";
  const checkedInAt = active.checkedInAt
    ? new Date(active.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const remainingFromList = orderTickets
    ? orderTickets.filter((t) => t.ticketStatus === "ISSUED").length
    : siblingsInitiallyRemaining + (isCheckedIn ? 0 : 1);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: "white" }}>
          {active.attendeeName ?? "Ticket holder"}
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
          {active.ticketType?.name ?? "Ticket"}
          {ticket.session?.title && <> · {ticket.session.title}</>}
        </div>
        {active.attendeeEmail && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{active.attendeeEmail}</div>
        )}
        <div style={{ marginTop: 8 }}>
          <span style={statusPill(active.ticketStatus)}>{active.ticketStatus.replace(/_/g, " ")}</span>
          {isCheckedIn && checkedInAt && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af" }}>at {checkedInAt}</span>
          )}
        </div>
      </div>

      {actionMsg && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 8,
          background: actionMsg.startsWith("✗") ? "rgba(248,113,113,0.1)" : "rgba(16,185,129,0.1)",
          border: `1px solid ${actionMsg.startsWith("✗") ? "rgba(248,113,113,0.3)" : "rgba(16,185,129,0.35)"}`,
          color: actionMsg.startsWith("✗") ? "#fca5a5" : "#a7f3d0",
          fontSize: 12,
        }}>{actionMsg}</div>
      )}

      {!isCheckedIn && (
        <button
          onClick={() => onCheckIn(active.id)}
          disabled={busy}
          style={primaryBtn("#10b981", true)}
        >
          {busy ? "Checking in…" : "Check In"}
        </button>
      )}

      {/* Chain-through */}
      {orderTickets && orderTickets.length > 1 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 8 }}>
            Same order — {remainingFromList} of {orderTickets.length} remaining
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {orderTickets.filter((t) => t.id !== active.id).map((t) => {
              const done = t.ticketStatus === "CHECKED_IN";
              return (
                <button
                  key={t.id}
                  onClick={() => !done && onAdvance(t.id)}
                  disabled={done || busy}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", borderRadius: 9, fontSize: 13,
                    background: done ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${done ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.1)"}`,
                    color: done ? "#a7f3d0" : "white",
                    cursor: done ? "default" : "pointer",
                    textAlign: "left", width: "100%",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.attendeeName ?? "Unnamed"}</div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                      {t.ticketType?.name ?? "Ticket"}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>
                    {done ? "✓ DONE" : "Check in →"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Style helpers ───────────────────────────────────────────────────────────

function primaryBtn(color: string, large = false): React.CSSProperties {
  return {
    width: "100%", padding: large ? "14px 18px" : "12px 16px", borderRadius: 10,
    border: `1px solid ${color}`,
    background: `linear-gradient(180deg, ${color}33, ${color}1a)`,
    color: "white", fontSize: large ? 15 : 13, fontWeight: 800,
    cursor: "pointer", letterSpacing: "0.02em",
  };
}

function secondaryBtn(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
    color: "#d1d5db", fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}

const STATUS_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  PENDING:      { bg: "rgba(180,131,9,0.15)",  border: "rgba(180,131,9,0.4)",  color: "#fbbf24" },
  CONFIRMED:    { bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.4)", color: "#60a5fa" },
  ACKNOWLEDGED: { bg: "rgba(129,140,248,0.12)",border: "rgba(129,140,248,0.4)",color: "#a5b4fc" },
  ARRIVED:      { bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.4)", color: "#34d399" },
  SEATED:       { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.45)",color: "#a7f3d0" },
  COMPLETED:    { bg: "rgba(107,114,128,0.12)",border: "rgba(107,114,128,0.3)",color: "#9ca3af" },
  ISSUED:       { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.4)", color: "#fbbf24" },
  CHECKED_IN:   { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.45)",color: "#a7f3d0" },
};

function statusPill(status: string): React.CSSProperties {
  const c = STATUS_COLORS[status] ?? { bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.3)", color: "#9ca3af" };
  return {
    display: "inline-block", fontSize: 10, fontWeight: 700,
    letterSpacing: "0.06em", textTransform: "uppercase",
    padding: "3px 9px", borderRadius: 6,
    background: c.bg, border: `1px solid ${c.border}`, color: c.color,
  };
}
