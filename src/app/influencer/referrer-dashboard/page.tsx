/**
 * EVENT-REFERRER DASHBOARD — Converged with the shared referral feed (Task #151)
 *
 * This surface now uses the SHARED referral feed (`GET /api/v1/me/referrals`)
 * filtered to `source=TICKET_PURCHASE` rows, which are grouped by
 * `eventReferrerAssignmentId` to preserve the per-assignment card UX.
 *
 * CONVERGENCE PATH STATUS (all 4 steps now complete):
 *   Step 1 ✓ — Ticket purchases write an AttributionSession (source=TICKET_PURCHASE)
 *               via writeTicketAttributionSession in checkout/confirm.
 *   Step 2 ✓ — Sub-commission accrual is surfaced via the shared feed's
 *               ReferralRow.ticket.commissionEarnedCents / commissionPendingCents,
 *               sourced from InfluencerSubCommissionLedger on the order.
 *   Step 3 ✓ — This page now calls GET /api/v1/me/referrals instead of
 *               GET /api/v1/event-referrers/my-assignments.
 *   Step 4 ✓ — InfluencerSubCommissionLedger rows carry payoutBatchId once
 *               included in a PayoutBatch; payoutBatchService includes them.
 *
 * DOUBLE-COUNTING GUARD: The shared feed's myReferralsWhere explicitly uses
 * source=TICKET_PURCHASE for the ticket branch so actor ids from the bridge
 * can never match walk-in sessions.
 *
 * NOTE: Historical sub-commission data (from before Task #151, when ticket
 * purchases did NOT write AttributionSession rows) will NOT appear here until
 * a backfill migration is run for those old orders. Those rows remain in
 * InfluencerSubCommissionLedger and are still visible to the payout batch
 * service for reconciliation.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { ReferralRow, MyReferralsResult } from "@/server/referrals/myReferralsSource";

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function whatsAppHref(referralUrl: string, eventTitle: string | null): string {
  const text = eventTitle ? `Join me at ${eventTitle}: ${referralUrl}` : referralUrl;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

type AssignmentGroup = {
  assignmentId: string;
  displayName: string;
  referralCode: string | null;
  referralUrl: string | null;
  isCommissionEligible: boolean;
  eventTitle: string | null;
  eventSlug: string | null;
  totalTickets: number;
  totalRevenueCents: number;
  totalEarnedCents: number;
  pendingPayoutCents: number;
  rows: ReferralRow[];
};

function groupByAssignment(rows: ReferralRow[]): AssignmentGroup[] {
  const ticketRows = rows.filter((r) => r.source === "TICKET_PURCHASE" && r.ticket);
  const byId = new Map<string, AssignmentGroup>();

  for (const row of ticketRows) {
    const t = row.ticket!;
    const key = t.eventReferrerAssignmentId ?? `__actor_${row.referredByActorId ?? "unknown"}`;
    const g = byId.get(key) ?? {
      assignmentId: key,
      displayName: t.assignmentDisplayName ?? row.referredByName ?? "Assignment",
      referralCode: t.referralCode,
      referralUrl: t.referralUrl,
      isCommissionEligible: t.isCommissionEligible,
      eventTitle: t.eventTitle,
      eventSlug: t.eventSlug,
      totalTickets: 0,
      totalRevenueCents: 0,
      totalEarnedCents: 0,
      pendingPayoutCents: 0,
      rows: [],
    };
    g.totalTickets += t.ticketCount;
    g.totalRevenueCents += t.revenueCents;
    g.totalEarnedCents += t.commissionEarnedCents;
    g.pendingPayoutCents += t.commissionPendingCents;
    g.rows.push(row);
    byId.set(key, g);
  }

  return Array.from(byId.values()).sort(
    (a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? "")
  );
}

export default function EventReferrerDashboard() {
  const [result, setResult] = useState<MyReferralsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/v1/me/referrals")
      .then((r) => r.json())
      .then((d: MyReferralsResult & { error?: string }) => {
        if (d.error) setError(d.error);
        else setResult(d);
      })
      .catch(() => setError("Failed to load referral data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 120_000);

  const allRows = [
    ...(result?.active ?? []),
    ...(result?.history ?? []),
  ];
  const assignments = groupByAssignment(allRows);

  const totalEarned = assignments.reduce((s, a) => s + a.totalEarnedCents, 0);
  const pendingTotal = assignments.reduce((s, a) => s + a.pendingPayoutCents, 0);
  const totalTickets = assignments.reduce((s, a) => s + a.totalTickets, 0);

  const copyLink = (url: string, code: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

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
          <p className="text-secondary">Share your link, capture sales, then check your earnings.</p>
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
            {/* ── 1. ASSIGNMENT CARDS — ACTION-FIRST ───────────────── */}
            <div style={{ display: "grid", gap: 20 }}>
              {assignments.map((a) => {
                const fullUrl = a.referralUrl || (typeof window !== "undefined"
                  ? `${window.location.origin}/${a.eventSlug ? `series/${a.eventSlug}` : "series"}?ref=${a.referralCode ?? ""}`
                  : `/series?ref=${a.referralCode ?? ""}`);

                return (
                  <div key={a.assignmentId} className="card">
                    {/* Title row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600 }}>
                        {a.eventTitle || a.displayName || "All Series Events"}
                      </span>
                    </div>

                    {/* PRIMARY ACTION ROW: WhatsApp + Copy Link */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      {a.referralUrl && (
                        <a
                          href={whatsAppHref(fullUrl, a.eventTitle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn"
                          style={{
                            flex: "1 1 180px",
                            background: "#25D366",
                            color: "#0b1f17",
                            fontWeight: 700,
                            textDecoration: "none",
                            textAlign: "center",
                          }}
                        >
                          💬 Share on WhatsApp
                        </a>
                      )}
                      {a.referralCode && (
                        <button
                          className={`btn ${copiedCode === a.referralCode ? "btn-success" : "btn-primary"}`}
                          style={{ flex: "1 1 140px" }}
                          onClick={() => copyLink(fullUrl, a.referralCode!)}
                        >
                          {copiedCode === a.referralCode ? "✓ Copied" : "Copy Link"}
                        </button>
                      )}
                      {a.referralUrl && (
                        <a
                          href={a.referralUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ flex: "1 1 140px", textDecoration: "none", textAlign: "center" }}
                        >
                          Open Ticket Link
                        </a>
                      )}
                    </div>

                    {/* Read-only link display */}
                    {a.referralCode && (
                      <div style={{ marginBottom: 16 }}>
                        <input
                          className="form-input"
                          readOnly
                          value={fullUrl}
                          style={{ width: "100%", fontSize: 12, fontFamily: "var(--font-body)" }}
                        />
                        <div className="text-sm text-muted mt-1">
                          Code: <span className="font-mono" style={{ color: "var(--color-primary)" }}>{a.referralCode}</span>
                          {" · "}
                          <span style={{ color: a.isCommissionEligible ? "var(--color-success)" : "var(--color-text-muted)" }}>
                            {a.isCommissionEligible ? "Commission eligible" : "Attribution only — no payout"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Stats row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      <div style={{ background: "var(--color-bg-secondary, #f8f5f3)", borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{a.totalTickets}</div>
                        <div className="text-sm text-muted">Tickets</div>
                      </div>
                      <div style={{ background: "var(--color-bg-secondary, #f8f5f3)", borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(a.totalEarnedCents)}</div>
                        <div className="text-sm text-muted">Earned</div>
                      </div>
                      <div style={{ background: a.pendingPayoutCents > 0 ? "rgba(196,30,58,0.05)" : "var(--color-bg-secondary, #f8f5f3)", borderRadius: 8, padding: "10px 14px", border: a.pendingPayoutCents > 0 ? "1px solid rgba(196,30,58,0.2)" : "none" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: a.pendingPayoutCents > 0 ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                          {fmt(a.pendingPayoutCents)}
                        </div>
                        <div className="text-sm text-muted">Pending</div>
                      </div>
                    </div>

                    {!a.isCommissionEligible && (
                      <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(0,0,0,0.03)", borderRadius: 8, borderLeft: "3px solid var(--color-border)" }}>
                        <div className="text-sm text-muted">
                          This is a non-compensated referrer role. You receive attribution analytics but no monetary payout for this assignment.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── 2. GLOBAL TOTALS ───────────────────────────────────── */}
            <div className="stat-grid" style={{ marginTop: 32 }}>
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
          </>
        )}
      </div>
    </div>
  );
}
