"use client";

import { useEffect, useState, useCallback } from "react";

interface AttendanceEventRow {
  id: string;
  status: "ARRIVED" | "SEATED" | "COMPLETED" | "LEFT_EARLY" | "NO_SHOW";
  arrivalTime: string;
  seatedTime: string | null;
  departureTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  ticket: {
    code: string;
    attendeeName: string | null;
    ticketType: { name: string; tierCode: string | null } | null;
  } | null;
  user: { name: string | null; email: string | null } | null;
  outcome: { outcomeType: string; reasonCode: string } | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ARRIVED:    { bg: "#dbeafe", text: "#1d4ed8", label: "Arrived" },
  SEATED:     { bg: "#dcfce7", text: "#15803d", label: "Seated" },
  COMPLETED:  { bg: "#f0fdf4", text: "#16a34a", label: "Completed" },
  LEFT_EARLY: { bg: "#fef3c7", text: "#d97706", label: "Left Early" },
  NO_SHOW:    { bg: "#fee2e2", text: "#dc2626", label: "No Show" },
};

function elapsed(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export default function LiveAttendanceFeed({ sessionId }: { sessionId?: string }) {
  const [events, setEvents] = useState<AttendanceEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showOutcomeModal, setShowOutcomeModal] = useState<AttendanceEventRow | null>(null);
  const [outcomeType, setOutcomeType] = useState("COMPLETED");
  const [reasonCode, setReasonCode] = useState("UNKNOWN");
  const [outcomeNotes, setOutcomeNotes] = useState("");

  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

  const load = useCallback(async () => {
    if (!sessionId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/v1/events/${sessionId}/attendance`);
      const data = await res.json();
      if (data.ok) {
        const next: AttendanceEventRow[] = data.events ?? [];
        // Stable merge so unchanged rows keep their identity (no row flicker).
        setEvents((prev) => {
          const prevById = new Map(prev.map((e) => [e.id, e]));
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
      }
    } finally {
      setLoading(false);
      setLastRefresh(Date.now());
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]);

  async function markSeated(attendanceEventId: string) {
    setActioning(attendanceEventId);
    try {
      await fetch("/api/v1/attendance/seat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceEventId }),
      });
      await load();
    } finally {
      setActioning(null);
    }
  }

  async function submitOutcome() {
    if (!showOutcomeModal) return;
    setActioning(showOutcomeModal.id);
    try {
      await fetch("/api/v1/attendance/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceEventId: showOutcomeModal.id, outcomeType, reasonCode, notes: outcomeNotes }),
      });
      setShowOutcomeModal(null);
      setOutcomeNotes("");
      await load();
    } finally {
      setActioning(null);
    }
  }

  const filtered = statusFilter === "all" ? events : events.filter((e) => e.status === statusFilter);

  const counts = {
    ARRIVED:    events.filter((e) => e.status === "ARRIVED").length,
    SEATED:     events.filter((e) => e.status === "SEATED").length,
    COMPLETED:  events.filter((e) => e.status === "COMPLETED").length,
    LEFT_EARLY: events.filter((e) => e.status === "LEFT_EARLY").length,
    NO_SHOW:    events.filter((e) => e.status === "NO_SHOW").length,
  };

  if (!sessionId) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>No session selected</div>
        <div style={{ fontSize: 13 }}>Use the check-in scanner to log arrivals, then select a session here.</div>
      </div>
    );
  }

  return (
    <div>
      {/* KPI Row */}
      <div style={{ display: "flex", gap: 12, padding: "16px 20px", overflowX: "auto" }}>
        {Object.entries(counts).map(([status, count]) => {
          const c = STATUS_COLORS[status];
          return (
            <button key={status} onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
              style={{ flexShrink: 0, background: statusFilter === status ? c.bg : "white", border: `1.5px solid ${statusFilter === status ? c.text : "#e2e8f0"}`, borderRadius: 10, padding: "10px 16px", cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: c.text }}>{count}</div>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{c.label}</div>
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>
          Auto-refresh 10s · {new Date(lastRefresh).toLocaleTimeString()}
        </div>
      </div>

      {/* Feed */}
      {loading && (
        <div style={{ padding: "40px", textAlign: "center" }}>
          <div className="loading-spinner" style={{ margin: "0 auto" }} />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎟️</div>
          <div>No arrivals recorded yet.</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ padding: "0 20px 24px" }}>
          {filtered.map((ev) => {
            const colors = STATUS_COLORS[ev.status] ?? STATUS_COLORS.ARRIVED;
            const guestName = ev.ticket?.attendeeName ?? ev.user?.name ?? ev.user?.email ?? "Guest";
            return (
              <div key={ev.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{guestName}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: colors.bg, color: colors.text }}>
                      {colors.label}
                    </span>
                    {ev.ticket?.ticketType && (
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{ev.ticket.ticketType.name}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>✈ {timeFmt.format(new Date(ev.arrivalTime))} ({elapsed(ev.arrivalTime)})</span>
                    {ev.seatedTime && <span>🪑 {timeFmt.format(new Date(ev.seatedTime))}</span>}
                    {ev.durationMinutes && <span>⏱ {ev.durationMinutes}m</span>}
                    {ev.ticket?.code && <span style={{ fontFamily: "monospace" }}>{ev.ticket.code}</span>}
                  </div>
                  {ev.outcome && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                      {ev.outcome.outcomeType} · {ev.outcome.reasonCode.replace(/_/g, " ")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {ev.status === "ARRIVED" && (
                    <button onClick={() => markSeated(ev.id)} disabled={actioning === ev.id}
                      style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#0f172a", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {actioning === ev.id ? "…" : "Seat"}
                    </button>
                  )}
                  {(ev.status === "ARRIVED" || ev.status === "SEATED") && (
                    <button onClick={() => { setShowOutcomeModal(ev); setOutcomeType("LEFT_EARLY"); }}
                      style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Outcome
                    </button>
                  )}
                  {ev.status === "COMPLETED" && !ev.outcome && (
                    <button onClick={() => setShowOutcomeModal(ev)}
                      style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#374151", fontSize: 12, cursor: "pointer" }}>
                      + Note
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Outcome Modal */}
      {showOutcomeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "white", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 500, margin: "0 auto" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>
              Record Outcome — {showOutcomeModal.ticket?.attendeeName ?? showOutcomeModal.user?.name ?? "Guest"}
            </h3>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Outcome</label>
            <select value={outcomeType} onChange={(e) => setOutcomeType(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
              <option value="COMPLETED">Completed</option>
              <option value="LEFT_EARLY">Left Early</option>
              <option value="DISSATISFIED">Dissatisfied</option>
              <option value="NO_SHOW">No Show</option>
            </select>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Reason</label>
            <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
              <option value="UNKNOWN">Unknown</option>
              <option value="WAIT_TIME">Wait Time</option>
              <option value="SERVICE">Service</option>
              <option value="PRICE">Price</option>
              <option value="EXPERIENCE">Experience</option>
            </select>

            <textarea value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)}
              placeholder="Optional notes…"
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 16, fontSize: 14, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} rows={2} />

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowOutcomeModal(null)}
                style={{ flex: 1, padding: "12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={submitOutcome} disabled={!!actioning}
                style={{ flex: 2, padding: "12px", borderRadius: 8, border: "none", background: "#0f172a", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                {actioning ? "…" : "Save Outcome"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
