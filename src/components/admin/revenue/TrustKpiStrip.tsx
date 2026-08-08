"use client";
import { useEffect, useState } from "react";

interface TrustKpis {
  sessionCount: number;
  matchedCount: number;
  pendingReviewCount: number;
  disputedSessionCount: number;
  disputedAllocationCount: number;
  exceptionCount: number;
  grossCents: number;
  commissionableCents: number;
  pendingObligationCents: number;
  approvedUnpaidCents: number;
  paidCents: number;
  disputedCents: number;
  reversedCents: number;
  lastSync: {
    id: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    errorCount: number;
    matchedCount: number;
    unmatchedCount: number;
  } | null;
}

interface Props {
  venueId?: string;
  dateFrom?: string;
  dateTo?: string;
}

function cents(n: number): string {
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function TrustKpiStrip({ venueId, dateFrom, dateTo }: Props) {
  const [data, setData] = useState<TrustKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (venueId) params.set("venueId", venueId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    fetch(`/api/v1/admin/revenue/trust-kpis?${params}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setData(j.data);
        else setError(j.error ?? "Error");
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [venueId, dateFrom, dateTo]);

  const tile: React.CSSProperties = {
    background: "var(--layer-1)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    padding: "12px 14px",
    minWidth: 130,
    flex: "1 1 130px",
  };
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" };
  const value: React.CSSProperties = { fontSize: 18, fontWeight: 700, marginTop: 4, fontFamily: "var(--font-heading)" };

  if (loading) {
    return <div style={{ padding: 12, color: "var(--color-text-muted)", fontSize: 12 }}>Loading trust KPIs…</div>;
  }
  if (error) {
    return <div style={{ padding: 12, color: "#ef4444", fontSize: 12 }}>KPI error: {error}</div>;
  }
  if (!data) return null;

  if (data.sessionCount === 0) {
    return (
      <div style={{
        background: "var(--layer-1)",
        border: "1px dashed var(--color-border)",
        borderRadius: 12,
        padding: "16px 18px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>No table sessions synced yet</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
            Trust KPIs appear after the first INVU sync run.
          </div>
        </div>
        <a href="/admin/integrations/invu" className="btn btn-primary" style={{ fontSize: 12 }}>
          Open INVU Integration →
        </a>
      </div>
    );
  }

  const syncStatusColor =
    !data.lastSync ? "#6b7280" :
    data.lastSync.status === "COMPLETED" || data.lastSync.status === "SUCCESS" ? "#10b981" :
    data.lastSync.status === "FAILED" ? "#ef4444" :
    "#f59e0b";

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={tile}>
          <div style={label}>Gross Revenue</div>
          <div style={value}>{cents(data.grossCents)}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>{data.sessionCount} session{data.sessionCount === 1 ? "" : "s"}</div>
        </div>
        <div style={tile}>
          <div style={label}>Net Commissionable</div>
          <div style={value}>{cents(data.commissionableCents)}</div>
        </div>
        <div style={tile}>
          <div style={label}>Pending Obligation</div>
          <div style={{ ...value, color: "#f59e0b" }}>{cents(data.pendingObligationCents)}</div>
        </div>
        <div style={tile}>
          <div style={label}>Approved Unpaid</div>
          <div style={{ ...value, color: "#3b82f6" }}>{cents(data.approvedUnpaidCents)}</div>
        </div>
        <div style={tile}>
          <div style={label}>Paid</div>
          <div style={{ ...value, color: "#10b981" }}>{cents(data.paidCents)}</div>
        </div>
        <div style={tile}>
          <div style={label}>Exceptions</div>
          <div style={{ ...value, color: data.exceptionCount > 0 ? "#ef4444" : "var(--color-text)" }}>{data.exceptionCount}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
            {data.pendingReviewCount} pending · {data.disputedAllocationCount} disputed
          </div>
        </div>
        <div style={tile}>
          <div style={label}>INVU Sync</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: syncStatusColor, display: "inline-block" }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{data.lastSync?.status ?? "—"}</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
            {timeAgo(data.lastSync?.finishedAt ?? data.lastSync?.startedAt ?? null)}
          </div>
        </div>
      </div>
    </div>
  );
}
