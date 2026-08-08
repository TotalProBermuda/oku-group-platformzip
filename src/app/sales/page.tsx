"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

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

interface SalesAssignment {
  id: string;
  referralCode: string;
  referralUrl: string | null;
  displayName: string;
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

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function describeModel(c: SeatCommission | null): string {
  if (!c) return "—";
  const flat = c.flatAmountCents != null ? `$${(c.flatAmountCents / 100).toFixed(2)} per order` : null;
  const perSeat = c.perSeatAmountCents != null ? `$${(c.perSeatAmountCents / 100).toFixed(2)} per seat` : null;
  const pct = c.percentageBps != null ? `${(c.percentageBps / 100).toFixed(1)}% of ticket` : null;
  switch (c.mode) {
    case "PARTNER_FLAT_PER_ORDER": return flat ?? "Flat per order";
    case "PARTNER_PER_SEAT": return perSeat ?? "Per seat";
    case "PARTNER_PERCENT_OF_TICKET": return pct ?? "% of ticket";
    case "PARTNER_FLAT_PLUS_PER_SEAT": return [flat, perSeat].filter(Boolean).join(" + ");
    case "PARTNER_FLAT_PLUS_PERCENT": return [flat, pct].filter(Boolean).join(" + ");
    default: return c.mode.replace(/_/g, " ").toLowerCase();
  }
}

export default function SalesDashboardPage() {
  const [data, setData] = useState<SalesAssignment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/me/sales-seats")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) setErr(j.error ?? "Failed to load");
        else setData(j.data ?? []);
      })
      .catch((e) => alive && setErr(String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  function copyLink(url: string, code: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>Loading…</div>;
  }
  if (err) {
    return <div style={{ padding: 40, color: "var(--color-danger)" }}>Error: {err}</div>;
  }

  const totals = (data ?? []).reduce(
    (a, x) => ({
      tickets: a.tickets + x.ticketsSold,
      gross: a.gross + x.grossSalesCents,
      pending: a.pending + x.pendingOwedCents,
      paid: a.paid + x.paidCents,
    }),
    { tickets: 0, gross: 0, pending: 0, paid: 0 },
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "#c41e3a" }}>Your Sales</h1>
        <p style={{ color: "var(--color-text-secondary)", marginTop: 6, fontSize: 14 }}>
          Share your code or link to sell tickets. The partner pays you directly — we just keep score.
        </p>
      </div>

      {/* Totals strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 14,
        marginBottom: 28,
      }}>
        {[
          { label: "Tickets sold", value: totals.tickets.toString() },
          { label: "Gross sales", value: fmt(totals.gross) },
          { label: "Owed to you", value: fmt(totals.pending), accent: true },
          { label: "Already paid", value: fmt(totals.paid) },
        ].map((k) => (
          <div key={k.label} className="panel" style={{ padding: "16px 18px" }}>
            <div className="kpi-label" style={{ fontSize: 11 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: k.accent ? "#c41e3a" : "var(--color-text)" }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {(data ?? []).length === 0 && (
        <div className="panel" style={{ padding: 32, textAlign: "center", color: "var(--color-text-secondary)" }}>
          You don&apos;t have any active sales assignments yet. When a partner invites you to sell, it will show up here.
        </div>
      )}

      {(data ?? []).map((a) => (
        <div key={a.id} className="panel" style={{ marginBottom: 18, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{a.series?.title ?? "Series"}</div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 2 }}>
                Selling for <strong>{a.partner?.name ?? "Partner"}</strong> · {describeModel(a.seatCommission)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="kpi-label" style={{ fontSize: 11 }}>Owed</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#c41e3a" }}>{fmt(a.pendingOwedCents)}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "center" }}>
            {a.referralUrl && (
              <div style={{ background: "#fff", padding: 8, borderRadius: 6, border: "1px solid var(--color-border)" }}>
                <QRCodeSVG value={a.referralUrl} size={120} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="kpi-label" style={{ fontSize: 11, marginBottom: 4 }}>Referral code</div>
              <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 600 }}>{a.referralCode}</div>
              {a.referralUrl && (
                <>
                  <div className="kpi-label" style={{ fontSize: 11, marginTop: 12, marginBottom: 4 }}>Share link</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <code style={{
                      flex: 1,
                      fontSize: 12,
                      padding: "6px 10px",
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>{a.referralUrl}</code>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      onClick={() => copyLink(a.referralUrl!, a.referralCode)}
                    >
                      {copied === a.referralCode ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--color-border)" }}>
            <div>
              <div className="kpi-label" style={{ fontSize: 11 }}>Tickets sold</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{a.ticketsSold}</div>
            </div>
            <div>
              <div className="kpi-label" style={{ fontSize: 11 }}>Orders</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{a.ordersAttributed}</div>
            </div>
            <div>
              <div className="kpi-label" style={{ fontSize: 11 }}>Gross sales</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fmt(a.grossSalesCents)}</div>
            </div>
          </div>

          {a.recentOrders.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="kpi-label" style={{ fontSize: 11, marginBottom: 6 }}>Recent orders</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "6px 4px" }}>Date</th>
                    <th style={{ padding: "6px 4px", textAlign: "right" }}>Tickets</th>
                    <th style={{ padding: "6px 4px", textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {a.recentOrders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "6px 4px" }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>{o.qty}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>{fmt(o.subtotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <div style={{ marginTop: 20, padding: 14, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
        <strong>How payment works:</strong> Your partner pays you directly — through whatever method you&apos;ve agreed on. The platform tracks your sales and what you&apos;re owed for transparency, but does not handle the payout.
      </div>
    </div>
  );
}
