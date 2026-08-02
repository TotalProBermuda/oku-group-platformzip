"use client";
import { useCallback, useEffect, useState } from "react";

type AllocStatus = "PENDING" | "APPROVED" | "PAID" | "DISPUTED" | "REVERSED";
type EarnerType = "REFERRER" | "HOST" | "PARTNER" | "INFLUENCER" | "OTHER";

interface AllocationRow {
  id: string;
  tableSessionId: string;
  earnerType: EarnerType;
  earnerRefId: string;
  amountCents: number;
  status: AllocStatus;
  createdAt: string;
  venue: string | null;
  reservationCode: string | null;
  closedAt: string | null;
  grossCents: number;
  commissionableCents: number;
}

interface EarnerGroup {
  earnerType: EarnerType;
  earnerRefId: string;
  earnerName: string;
  sessionsCount: number;
  grossCents: number;
  commissionableCents: number;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  disputedCents: number;
  reversedCents: number;
  allocations: AllocationRow[];
}

const STATUS_COLORS: Record<AllocStatus, string> = {
  PENDING: "#f59e0b",
  APPROVED: "#3b82f6",
  PAID: "#10b981",
  DISPUTED: "#ef4444",
  REVERSED: "#6b7280",
};

function cents(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${(Math.abs(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ObligationsPanel() {
  const [groups, setGroups] = useState<EarnerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/revenue/obligations");
      const json = await res.json();
      if (json.ok) setGroups(json.data);
      else setError(json.error ?? "Error");
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const action = async (
    allocationId: string,
    kind: "approve" | "dispute" | "mark-paid" | "reverse",
  ) => {
    let body: Record<string, unknown> = {};
    if (kind === "dispute") {
      const note = window.prompt("Dispute note (required):");
      if (!note?.trim()) return;
      body = { note };
    } else if (kind === "reverse") {
      const note = window.prompt("Reversal note (required):");
      if (!note?.trim()) return;
      body = { note };
    } else {
      const verb = kind === "mark-paid" ? "mark as paid" : kind;
      if (!window.confirm(`Are you sure you want to ${verb} this allocation?`)) return;
    }

    setBusy(allocationId);
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/revenue/allocations/${allocationId}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg(`Allocation ${kind} succeeded`);
        await load();
      } else {
        setMsg(`Error: ${json.error ?? "unknown"}`);
      }
    } catch (e: unknown) {
      setMsg(`Error: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div style={{ padding: 24, color: "var(--color-text-muted)" }}>Loading INVU-verified obligations…</div>;
  if (error) return <div style={{ padding: 24, color: "#ef4444" }}>Error: {error}</div>;
  if (groups.length === 0) {
    return (
      <div style={{
        background: "var(--layer-1)",
        border: "1px dashed var(--color-border)",
        borderRadius: 12,
        padding: 32,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No INVU-verified obligations yet</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Obligations appear here after the INVU sync produces commission allocations.
        </div>
      </div>
    );
  }

  return (
    <div>
      {msg && (
        <div style={{
          background: msg.startsWith("Error") ? "#ef4444" : "#10b981",
          color: "#fff",
          padding: "10px 14px",
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 13,
        }}>
          {msg}
          <button onClick={() => setMsg(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}

      <div style={{ background: "var(--layer-1)", border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--layer-2)", borderBottom: "1px solid var(--color-border)" }}>
              {["Earner", "Type", "Sessions", "Gross", "Commissionable", "Pending", "Approved", "Paid", "Disputed", "Reversed", ""].map((h) => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const key = `${g.earnerType}::${g.earnerRefId}`;
              const isOpen = expanded.has(key);
              return (
                <>
                  <tr
                    key={key}
                    onClick={() => toggle(key)}
                    style={{ borderBottom: "1px solid rgba(128,128,128,0.1)", cursor: "pointer" }}
                  >
                    <td style={{ padding: "12px", fontWeight: 600 }}>
                      <span style={{ marginRight: 6 }}>{isOpen ? "▾" : "▸"}</span>
                      {g.earnerName}
                    </td>
                    <td style={{ padding: "12px", fontSize: 11 }}>
                      <span style={{ background: "var(--layer-2)", padding: "2px 8px", borderRadius: 4 }}>{g.earnerType}</span>
                      <span style={{ marginLeft: 6, color: "#10b981", fontSize: 10, fontWeight: 700 }}>INVU-Verified</span>
                    </td>
                    <td style={{ padding: "12px" }}>{g.sessionsCount}</td>
                    <td style={{ padding: "12px" }}>{cents(g.grossCents)}</td>
                    <td style={{ padding: "12px" }}>{cents(g.commissionableCents)}</td>
                    <td style={{ padding: "12px", color: STATUS_COLORS.PENDING }}>{cents(g.pendingCents)}</td>
                    <td style={{ padding: "12px", color: STATUS_COLORS.APPROVED }}>{cents(g.approvedCents)}</td>
                    <td style={{ padding: "12px", color: STATUS_COLORS.PAID, fontWeight: 600 }}>{cents(g.paidCents)}</td>
                    <td style={{ padding: "12px", color: STATUS_COLORS.DISPUTED }}>{g.disputedCents !== 0 ? cents(g.disputedCents) : "—"}</td>
                    <td style={{ padding: "12px", color: STATUS_COLORS.REVERSED }}>{g.reversedCents !== 0 ? cents(g.reversedCents) : "—"}</td>
                    <td style={{ padding: "12px", fontSize: 11, color: "var(--color-text-muted)" }}>{g.allocations.length} alloc.</td>
                  </tr>
                  {isOpen && (
                    <tr key={`${key}-detail`}>
                      <td colSpan={11} style={{ padding: 0, background: "var(--layer-2)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr>
                              {["Reservation", "Venue", "Closed", "Amount", "Status", "Actions"].map((h) => (
                                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 10 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {g.allocations.map((a) => (
                              <tr key={a.id} style={{ borderTop: "1px solid rgba(128,128,128,0.08)" }}>
                                <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11 }}>
                                  {a.reservationCode ?? a.tableSessionId.slice(-8)}
                                </td>
                                <td style={{ padding: "8px 12px" }}>{a.venue ?? "—"}</td>
                                <td style={{ padding: "8px 12px" }}>{fmtDate(a.closedAt)}</td>
                                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{cents(a.amountCents)}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <span style={{ background: STATUS_COLORS[a.status], color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                                    {a.status}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 12px" }}>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    {a.status === "PENDING" && (
                                      <button disabled={busy === a.id} onClick={() => action(a.id, "approve")} style={btn("#3b82f6")}>Approve</button>
                                    )}
                                    {a.status === "APPROVED" && (
                                      <button disabled={busy === a.id} onClick={() => action(a.id, "mark-paid")} style={btn("#10b981")}>Mark Paid</button>
                                    )}
                                    {(a.status === "PENDING" || a.status === "APPROVED") && (
                                      <button disabled={busy === a.id} onClick={() => action(a.id, "dispute")} style={btn("#ef4444")}>Dispute</button>
                                    )}
                                    {a.status !== "REVERSED" && (
                                      <button disabled={busy === a.id} onClick={() => action(a.id, "reverse")} style={btn("#6b7280")}>Reverse</button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return {
    background: color,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  };
}
