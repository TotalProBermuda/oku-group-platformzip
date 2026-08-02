"use client";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

interface ReferrerAssignment {
  id: string;
  displayName: string;
  referralCode: string;
  referralUrl: string | null;
  scopeType: string;
  series: { id: string; slug: string; title: string; venue: string | null } | null;
  status: string;
  isCommissionEligible: boolean;
  commissionMode: string;
  commissionShareBps: number | null;
  ticketsAttributed: number;
  revenueAttributedCents: number;
  totalEarnedCents: number;
  pendingPayoutCents: number;
}

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: "badge badge-success",
    INVITED: "badge badge-warning",
    REVOKED: "badge badge-danger",
    ARCHIVED: "badge badge-neutral",
  };
  return map[status] || "badge badge-neutral";
}

export default function EventReferrerDashboard() {
  const [assignments, setAssignments] = useState<ReferrerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/v1/event-referrers/my-assignments")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAssignments(d.data);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Failed to load referrer assignments"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 120_000);

  const copyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const totalEarned = assignments.reduce((s, a) => s + a.totalEarnedCents, 0);
  const pendingTotal = assignments.reduce((s, a) => s + a.pendingPayoutCents, 0);
  const totalTickets = assignments.reduce((s, a) => s + a.ticketsAttributed, 0);

  return (
    <div>
      <div style={{ background: "#f8f5f3", borderBottom: "1px solid var(--color-border)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 }}>
            Event Referrer Portal
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 4 }}>
            My Referrer Assignments
          </h1>
          <p className="text-secondary">Events and series you have been assigned to refer attendees for.</p>
        </div>
      </div>

      <div className="page-container">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        ) : error ? (
          <div className="alert alert-danger">{error}</div>
        ) : assignments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎫</div>
            <div className="empty-state-title">No referrer assignments yet</div>
            <p className="text-secondary">Contact an influencer host to be assigned as an event referrer.</p>
          </div>
        ) : (
          <>
            <div className="stat-grid" style={{ marginBottom: 32 }}>
              <div className="stat-card">
                <div className="stat-value">{assignments.length}</div>
                <div className="stat-label">Active Assignments</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{totalTickets}</div>
                <div className="stat-label">Tickets Attributed</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{fmt(totalEarned)}</div>
                <div className="stat-label">Total Earned</div>
              </div>
              <div className="stat-card" style={{ borderColor: pendingTotal > 0 ? "rgba(196,30,58,0.2)" : "var(--color-border)" }}>
                <div className="stat-value" style={{ color: pendingTotal > 0 ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                  {fmt(pendingTotal)}
                </div>
                <div className="stat-label">Pending Payout</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 20 }}>
              {assignments.map((a) => (
                <div key={a.id} className="card">
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600 }}>
                          {a.series?.title || "All Series Events"}
                        </span>
                        <span className={statusBadge(a.status)}>{a.status}</span>
                        {a.scopeType === "SERIES" && <span className="badge badge-neutral">Series-wide</span>}
                      </div>
                      {a.series?.venue && (
                        <span className="text-sm text-muted">{a.series.venue} venue</span>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="text-sm text-muted">Commission</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>
                        {a.isCommissionEligible
                          ? a.commissionMode === "PERCENT_OF_INFLUENCER_COMMISSION"
                            ? `${((a.commissionShareBps ?? 0) / 100).toFixed(0)}% of host commission`
                            : "Commission eligible"
                          : (
                            <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                              Attribution only — no payout
                            </span>
                          )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                    <div style={{ background: "var(--color-bg-secondary, #f8f5f3)", borderRadius: 8, padding: "12px 16px" }}>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{a.ticketsAttributed}</div>
                      <div className="text-sm text-muted">Tickets</div>
                    </div>
                    <div style={{ background: "var(--color-bg-secondary, #f8f5f3)", borderRadius: 8, padding: "12px 16px" }}>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(a.totalEarnedCents)}</div>
                      <div className="text-sm text-muted">Earned</div>
                    </div>
                    <div style={{ background: a.pendingPayoutCents > 0 ? "rgba(196,30,58,0.05)" : "var(--color-bg-secondary, #f8f5f3)", borderRadius: 8, padding: "12px 16px", border: a.pendingPayoutCents > 0 ? "1px solid rgba(196,30,58,0.2)" : "none" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: a.pendingPayoutCents > 0 ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                        {fmt(a.pendingPayoutCents)}
                      </div>
                      <div className="text-sm text-muted">Pending</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Your referral link</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        className="form-input"
                        readOnly
                        value={a.referralUrl || `${typeof window !== "undefined" ? window.location.origin : ""}/series?ref=${a.referralCode}`}
                        style={{ flex: 1, fontSize: 13, fontFamily: "var(--font-body)" }}
                      />
                      <button
                        className={`btn btn-sm ${copiedId === a.id ? "btn-success" : "btn-primary"}`}
                        onClick={() => copyLink(a.referralUrl || a.referralCode, a.id)}
                      >
                        {copiedId === a.id ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="text-sm text-muted mt-1">
                      Code: <span className="font-mono" style={{ color: "var(--color-primary)" }}>{a.referralCode}</span>
                    </div>
                  </div>

                  {!a.isCommissionEligible && (
                    <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(0,0,0,0.03)", borderRadius: 8, borderLeft: "3px solid var(--color-border)" }}>
                      <div className="text-sm text-muted">
                        This is a non-compensated referrer role. You receive attribution analytics but no monetary payout for this assignment.
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
