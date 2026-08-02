"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TicketDetailDrawer from "./TicketDetailDrawer";
import IssueTicketModal from "./IssueTicketModal";

interface TicketRow {
  id: string;
  code: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  ticketStatus: string;
  checkedInAt: string | null;
  createdAt: string;
  ticketType: { name: string; tierCode: string | null } | null;
  user: { id: string; name: string | null; email: string | null };
  session: {
    id: string;
    title: string | null;
    startsAt: string;
    series: { id: string; title: string; venue: string | null } | null;
  } | null;
  order: {
    id: string;
    orderNumber: string | null;
    status: string;
    orderType: string;
    channel: string;
    totalCents: number;
    currency: string;
  } | null;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "ISSUED", label: "Issued" },
  { value: "CHECKED_IN", label: "Checked-in" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "VOIDED", label: "Voided" },
];

const CHECKIN_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any check-in state" },
  { value: "yes", label: "Checked-in" },
  { value: "no", label: "Not checked-in" },
];

function statusPill(status: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    ISSUED:     { bg: "#e0f2fe", fg: "#075985" },
    CHECKED_IN: { bg: "#dcfce7", fg: "#166534" },
    CANCELLED:  { bg: "#fef3c7", fg: "#92400e" },
    REFUNDED:   { bg: "#fee2e2", fg: "#991b1b" },
    VOIDED:     { bg: "#f3f4f6", fg: "#374151" },
  };
  const c = map[status] ?? { bg: "#f3f4f6", fg: "#374151" };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      padding: "3px 8px", borderRadius: 6,
      background: c.bg, color: c.fg, textTransform: "uppercase",
    }}>{status.replace("_", " ")}</span>
  );
}

export default function AdminTicketsPanel({ canWrite }: { canWrite: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [checkedIn, setCheckedIn] = useState("");
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (checkedIn) p.set("checkedIn", checkedIn);
    p.set("limit", "100");
    return p.toString();
  }, [q, status, checkedIn]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/admin/tickets?${params}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Request failed");
        setRows(data.data ?? []);
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [params]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = async () => {
    try {
      const res = await fetch(`/api/v1/admin/tickets?${params}`);
      const data = await res.json();
      if (res.ok) setRows(data.data ?? []);
    } catch {}
  };

  const exportCsv = (sessionId: string | null | undefined) => {
    if (!sessionId) {
      showToast("Select a session in the row to export its attendee list.");
      return;
    }
    window.open(`/api/v1/admin/tickets/export?sessionId=${encodeURIComponent(sessionId)}`, "_blank");
  };

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px 64px" }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 400, margin: 0, color: "var(--color-text)" }}>
            Tickets
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
            Search website-issued tickets, review check-in state, issue comp tickets, export attendee lists.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setIssueOpen(true)}
            style={{
              padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              background: "var(--color-primary, #1a1614)", color: "white",
              fontWeight: 600, fontSize: 13, minHeight: 40,
            }}
          >
            Issue comp ticket
          </button>
        )}
      </header>

      <div style={{
        display: "grid", gap: 10, gridTemplateColumns: "minmax(220px, 2fr) 1fr 1fr",
        marginBottom: 16,
      }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search code, order #, name, or email"
          style={{
            padding: "10px 14px", border: "1px solid var(--color-border)",
            borderRadius: 8, background: "var(--color-surface)",
            color: "var(--color-text)", fontSize: 14, outline: "none",
          }}
          aria-label="Search tickets"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            padding: "10px 12px", border: "1px solid var(--color-border)",
            borderRadius: 8, background: "var(--color-surface)",
            color: "var(--color-text)", fontSize: 14,
          }}
          aria-label="Filter by ticket status"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={checkedIn}
          onChange={(e) => setCheckedIn(e.target.value)}
          style={{
            padding: "10px 12px", border: "1px solid var(--color-border)",
            borderRadius: 8, background: "var(--color-surface)",
            color: "var(--color-text)", fontSize: 14,
          }}
          aria-label="Filter by check-in state"
        >
          {CHECKIN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {error && (
        <div style={{
          padding: 12, borderRadius: 8, background: "#fee2e2",
          color: "#991b1b", marginBottom: 12, fontSize: 13,
        }}>{error}</div>
      )}

      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--color-bg)", textAlign: "left" }}>
                <th style={th}>Code</th>
                <th style={th}>Guest</th>
                <th style={th}>Order</th>
                <th style={th}>Series / Session</th>
                <th style={th}>Type</th>
                <th style={th}>Status</th>
                <th style={th}>Check-in</th>
                <th style={{ ...th, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
                  No tickets match these filters.
                </td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }}>{r.code}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: "var(--color-text)" }}>
                      {r.attendeeName ?? r.user.name ?? "—"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {r.attendeeEmail ?? r.user.email ?? ""}
                    </div>
                  </td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>
                    {r.order?.orderNumber ?? "—"}
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {r.order?.channel ?? ""}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{r.session?.series?.title ?? "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {r.session?.title ?? ""} {r.session?.startsAt && `· ${new Date(r.session.startsAt).toLocaleString()}`}
                    </div>
                  </td>
                  <td style={td}>{r.ticketType?.name ?? "Standard"}</td>
                  <td style={td}>{statusPill(r.ticketStatus)}</td>
                  <td style={td}>
                    {r.checkedInAt ? (
                      <span style={{ color: "#16a34a", fontWeight: 600 }}>
                        {new Date(r.checkedInAt).toLocaleTimeString()}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-muted)" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={() => setOpenId(r.id)}
                      style={btnGhost}
                      aria-label={`Open ticket ${r.code}`}
                    >Open</button>
                    {" "}
                    <button
                      type="button"
                      onClick={() => exportCsv(r.session?.id)}
                      style={btnGhost}
                      title="Export this session's attendees as CSV"
                    >Export session</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openId && (
        <TicketDetailDrawer
          ticketId={openId}
          onClose={() => setOpenId(null)}
        />
      )}

      {issueOpen && (
        <IssueTicketModal
          onClose={() => setIssueOpen(false)}
          onIssued={(msg) => { setIssueOpen(false); showToast(msg); refresh(); }}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--color-text)", color: "var(--color-surface)",
          padding: "10px 16px", borderRadius: 8, fontSize: 13, zIndex: 100,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        }}>{toast}</div>
      )}
    </main>
  );
}

const th: React.CSSProperties = {
  padding: "10px 12px", fontWeight: 700, fontSize: 11,
  letterSpacing: "0.06em", textTransform: "uppercase",
  color: "var(--color-text-muted)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "10px 12px", color: "var(--color-text)", verticalAlign: "top",
};
const btnGhost: React.CSSProperties = {
  padding: "6px 10px", border: "1px solid var(--color-border)",
  background: "var(--color-surface)", color: "var(--color-text)",
  borderRadius: 6, fontSize: 12, cursor: "pointer",
};
