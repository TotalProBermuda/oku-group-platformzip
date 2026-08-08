"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { CommissionEarnerActionPanel } from "@/components/referral/CommissionEarnerActionPanel";

interface SeatCommission {
  mode: string;
  flatAmountCents: number | null;
  perSeatAmountCents: number | null;
  percentageBps: number | null;
}

interface RecentOrder {
  id: string;
  subtotalCents: number;
  createdAt: string;
  qty: number;
}

interface SellerAssignment {
  id: string;
  referralCode: string;
  referralUrl: string | null;
  displayName: string | null;
  commissionMode: string;
  partner: { id: string; name: string } | null;
  series: { id: string; slug: string; title: string } | null;
  seatCommission: SeatCommission | null;
  ticketsSold: number;
  grossSalesCents: number;
  pendingOwedCents: number;
  paidCents: number;
  ordersAttributed: number;
  recentOrders: RecentOrder[];
}

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function commissionLabel(seat: SeatCommission | null, mode: string): string {
  if (!seat) {
    if (mode === "PERCENT_OF_INFLUENCER_COMMISSION") return "Share of host commission (set by partner)";
    if (mode === "FIXED_PER_TICKET" || mode === "FIXED_PER_SEAT") return "Fixed amount per ticket (set by partner)";
    return "Commission set by partner";
  }
  switch (seat.mode) {
    case "PERCENTAGE":
      return seat.percentageBps != null ? `${(seat.percentageBps / 100).toFixed(1)}% of sale` : "Percentage of sale";
    case "FIXED_PER_SEAT":
    case "FIXED_PER_TICKET":
      return seat.perSeatAmountCents != null ? `${fmt(seat.perSeatAmountCents)} per ticket` : "Fixed per ticket";
    case "FLAT":
      return seat.flatAmountCents != null ? `${fmt(seat.flatAmountCents)} flat` : "Flat amount";
    default:
      return "Commission set by partner";
  }
}

export default function PartnerSellerDashboard() {
  const [assignments, setAssignments] = useState<SellerAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/v1/me/sales-seats")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAssignments(d.data);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Failed to load seller assignments"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalTickets = assignments?.reduce((s, a) => s + a.ticketsSold, 0) ?? 0;
  const totalGross = assignments?.reduce((s, a) => s + a.grossSalesCents, 0) ?? 0;
  const totalPending = assignments?.reduce((s, a) => s + a.pendingOwedCents, 0) ?? 0;
  const totalPaid = assignments?.reduce((s, a) => s + a.paidCents, 0) ?? 0;

  return (
    <div>
      {/* Header band */}
      <div style={{ background: "#f8f5f3", borderBottom: "1px solid var(--color-border)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 }}>
            Partner Sales Portal
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 4 }}>
            Sell tickets, share your link
          </h1>
          <p className="text-secondary">Each card below is a partner who has assigned you a seller seat.</p>
        </div>
      </div>

      <div className="page-container" style={{ maxWidth: 1100 }}>
        {/* Disclaimer banner — always visible */}
        <div style={{
          background: "rgba(255,213,79,0.08)",
          border: "1px solid rgba(255,213,79,0.4)",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 24,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>ℹ️</span>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-text)" }}>
            <strong>The partner pays this seller directly.</strong> OKÜ tracks attribution and ledger only —
            commission payouts are settled between you and the partner who assigned the seat.
          </div>
        </div>

        {error ? (
          <div className="alert alert-danger">{error}</div>
        ) : assignments === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        ) : assignments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎟️</div>
            <div className="empty-state-title">No active seller seats yet</div>
            <p className="text-secondary">
              Once a partner invites you and you accept a sales seat, your referral codes and stats appear here.
            </p>
          </div>
        ) : (
          <>
            {/* ── 1. ACTION-FIRST ASSIGNMENT CARDS ──────────────────── */}
            <div style={{ display: "grid", gap: 24 }}>
              {assignments.map((a) => {
                const ticketHref = a.series ? `/series/${a.series.slug}` : null;
                return (
                  <div key={a.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    {/* Card header */}
                    <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600 }}>
                          {a.series?.title || a.displayName || "Partner Seat"}
                        </span>
                        <span className="badge badge-success">ACTIVE</span>
                      </div>
                      <div className="text-sm text-muted">
                        Partner: <strong>{a.partner?.name ?? "—"}</strong>
                        {" · "}
                        Code <span className="font-mono" style={{ color: "var(--color-primary)", fontWeight: 700 }}>{a.referralCode}</span>
                        {" · "}
                        {commissionLabel(a.seatCommission, a.commissionMode)}
                      </div>
                      {a.referralUrl && (
                        <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-muted)" }}>
                          Canonical link:{" "}
                          <a
                            href={a.referralUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono"
                            style={{ color: "var(--color-primary)", textDecoration: "underline", wordBreak: "break-all" }}
                          >
                            {a.referralUrl}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Action panel — QR, WhatsApp, copy link, ticket CTA */}
                    <div style={{ padding: "16px 20px" }}>
                      <CommissionEarnerActionPanel
                        referralCode={a.referralCode}
                        referralUrl={a.referralUrl}
                        destinationPath={a.series ? `/series/${a.series.slug}` : "/series"}
                        shareTitle={a.series?.title || "Book with OKÜ"}
                        shareText={
                          a.series?.title
                            ? `Get tickets to ${a.series.title} via my partner link.`
                            : `Book your OKÜ experience via my partner link.`
                        }
                        ticketLinks={ticketHref && a.series ? [{ label: a.series.title, href: `${ticketHref}?ref=${encodeURIComponent(a.referralCode)}` }] : undefined}
                        commissionLabel={commissionLabel(a.seatCommission, a.commissionMode)}
                      />
                    </div>

                    {/* Stats row — moved BELOW the action area */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: 0,
                      borderTop: "1px solid var(--color-border)",
                    }}>
                      <StatCell label="Tickets Sold" value={a.ticketsSold.toString()} />
                      <StatCell label="Gross Sales" value={fmt(a.grossSalesCents)} />
                      <StatCell
                        label="Pending Owed"
                        value={fmt(a.pendingOwedCents)}
                        color={a.pendingOwedCents > 0 ? "var(--color-primary)" : undefined}
                      />
                      <StatCell label="Paid" value={fmt(a.paidCents)} />
                    </div>

                    {/* Recent activity (collapsed compact list) */}
                    {a.recentOrders.length > 0 && (
                      <div style={{ padding: "14px 20px 18px", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-secondary, #fafafa)" }}>
                        <div className="text-sm text-muted" style={{ marginBottom: 8, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 11 }}>
                          Recent attributed orders
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {a.recentOrders.slice(0, 5).map((o) => (
                            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13 }}>
                              <span style={{ color: "var(--color-text-muted)" }}>
                                {fmtDate(o.createdAt)} · {o.qty} ticket{o.qty === 1 ? "" : "s"}
                              </span>
                              <span style={{ fontWeight: 600 }}>{fmt(o.subtotalCents)}</span>
                            </div>
                          ))}
                          {a.recentOrders.length > 5 && (
                            <div className="text-sm text-muted" style={{ fontStyle: "italic" }}>
                              + {a.recentOrders.length - 5} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Direct ticket page link — secondary */}
                    {ticketHref && (
                      <div style={{ padding: "12px 20px 16px", borderTop: "1px solid var(--color-border)" }}>
                        <Link
                          href={`${ticketHref}?ref=${encodeURIComponent(a.referralCode)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ textDecoration: "none", fontSize: 13, padding: "8px 14px" }}
                        >
                          Open ticket page →
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── 2. GLOBAL TOTALS — moved BELOW assignments ────────── */}
            <div className="stat-grid" style={{ marginTop: 32 }}>
              <div className="stat-card">
                <div className="stat-value">{assignments.length}</div>
                <div className="stat-label">Active Seats</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{totalTickets}</div>
                <div className="stat-label">Tickets Sold</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{fmt(totalGross)}</div>
                <div className="stat-label">Total Gross</div>
              </div>
              <div className="stat-card" style={{ borderColor: totalPending > 0 ? "rgba(196,30,58,0.2)" : "var(--color-border)" }}>
                <div className="stat-value" style={{ color: totalPending > 0 ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                  {fmt(totalPending)}
                </div>
                <div className="stat-label">Pending Owed (by partners)</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{fmt(totalPaid)}</div>
                <div className="stat-label">Paid (by partners)</div>
              </div>
            </div>

            <div style={{ marginTop: 24, padding: "14px 16px", background: "var(--color-bg-secondary, #fafafa)", borderRadius: 10, border: "1px solid var(--color-border)" }}>
              <div className="text-sm text-muted">
                <strong>Reminder:</strong> &quot;Pending Owed&quot; and &quot;Paid&quot; reflect the partner&apos;s ledger inside OKÜ.
                The partner is responsible for actually paying you. If totals look wrong, contact your partner first.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: "14px 18px", borderRight: "1px solid var(--color-border)" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || "var(--color-text)" }}>{value}</div>
      <div className="text-sm text-muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
