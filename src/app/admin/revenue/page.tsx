"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import { AlertTriangle, RefreshCw } from "lucide-react";

type DatePreset = "today" | "7d" | "30d" | "custom";

interface TrustSummary {
  tableSessionCount: number;
  invuVerifiedCount: number;
  manualCount: number;
  grossRevenueCents: number;
  netCommissionableCents: number;
  pendingObligationsCents: number;
  approvedUnpaidCents: number;
  paidCents: number;
  exceptionCount: number;
  attributedReservationsCount: number;
  lastSyncRun: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    matchedCount: number;
    unmatchedCount: number;
    errorCount: number;
  } | null;
}

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function minutesAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

const SYNC_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  SUCCESS: { bg: "#e8f5e9", color: "#1b5e20" },
  PARTIAL_FAILURE: { bg: "#fff3e0", color: "#e65100" },
  FAILED: { bg: "#fef2f2", color: "#991b1b" },
  STARTED: { bg: "#e3f2fd", color: "#0d47a1" },
};

export default function RevenueDashboardPage() {
  const t = useTranslation();
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [data, setData] = useState<TrustSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/v1/admin/revenue/trust-summary?preset=${preset}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData(d.data);
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  const PRESETS: { key: DatePreset; label: string }[] = [
    { key: "today", label: t("admin", "today") || "Today" },
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
  ];

  const isEmpty = !loading && !error && data?.tableSessionCount === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 500, margin: 0 }}>
            {t("admin", "revenue.dashboard.title") || "Revenue Trust Dashboard"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
            {t("admin", "revenue.dashboard.subtitle") || "INVU-verified table sessions, commission obligations & trust metrics"}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={preset === p.key ? "btn btn-primary" : "btn btn-ghost"}
              style={{ fontSize: 13, padding: "6px 14px" }}
            >
              {p.label}
            </button>
          ))}
          <button onClick={load} className="btn btn-ghost" style={{ padding: "6px 10px" }} title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-strip alert-strip-error">
          <AlertTriangle size={15} style={{ marginRight: 6 }} />
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-muted)" }}>
          {t("admin", "loading") || "Loading…"}
        </div>
      )}

      {isEmpty && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
            {t("admin", "revenue.emptyState.noSessions") || "No table sessions have been synced yet."}
          </div>
          <p style={{ color: "var(--color-text-muted)", marginBottom: 20, maxWidth: 420, margin: "0 auto 20px" }}>
            {t("admin", "revenue.emptyState.goToInvu") || "Go to INVU Integration to trigger your first sync."}
          </p>
          <Link href="/admin/integrations/invu" className="btn btn-primary">
            {t("admin", "revenue.emptyState.invuButton") || "Go to INVU Integration"}
          </Link>
        </div>
      )}

      {!loading && !error && data && data.tableSessionCount > 0 && (
        <>
          <div className="kpi-grid">
            <MetricTile
              label={t("admin", "revenue.dashboard.attributedReservations") || "Attributed Reservations"}
              value={data.attributedReservationsCount}
              sub={<Link href="/admin/revenue/sessions" style={{ fontSize: 12, color: "var(--color-primary)" }}>{t("admin", "revenue.dashboard.viewSessions") || "View sessions →"}</Link>}
            />
            <MetricTile
              label={t("admin", "revenue.dashboard.closedSessions") || "Closed Table Sessions"}
              value={data.tableSessionCount}
              sub={`${data.invuVerifiedCount} ${t("admin", "revenue.sourceLabel.invuVerified") || "INVU-Verified"} · ${data.manualCount} ${t("admin", "revenue.sourceLabel.manual") || "Manual"}`}
            />
            <MetricTile
              label={t("admin", "revenue.dashboard.grossRevenue") || "Gross Revenue"}
              value={fmt(data.grossRevenueCents)}
            />
            <MetricTile
              label={t("admin", "revenue.dashboard.netCommissionable") || "Net Commissionable Revenue"}
              value={fmt(data.netCommissionableCents)}
            />
            <MetricTile
              label={t("admin", "revenue.dashboard.pendingObligations") || "Pending Obligations"}
              value={fmt(data.pendingObligationsCents)}
              accent="amber"
            />
            <MetricTile
              label={t("admin", "revenue.dashboard.approvedUnpaid") || "Approved Unpaid"}
              value={fmt(data.approvedUnpaidCents)}
            />
            <MetricTile
              label={t("admin", "revenue.dashboard.paid") || "Paid"}
              value={fmt(data.paidCents)}
              accent="green"
            />
            <MetricTile
              label={t("admin", "revenue.dashboard.exceptions") || "Exceptions"}
              value={data.exceptionCount}
              accent={data.exceptionCount > 0 ? "red" : undefined}
              sub={<Link href="/admin/revenue/review" style={{ fontSize: 12, color: "var(--color-primary)" }}>{t("admin", "revenue.dashboard.reviewExceptions") || "Review →"}</Link>}
            />
          </div>

          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 10 }}>
              {t("admin", "revenue.dashboard.invuSyncHealth") || "INVU Sync Health"}
            </div>
            {data.lastSyncRun ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <SyncStatusBadge status={data.lastSyncRun.status} />
                <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  {minutesAgo(data.lastSyncRun.startedAt)}
                </span>
                <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  {data.lastSyncRun.matchedCount} matched · {data.lastSyncRun.unmatchedCount} unmatched · {data.lastSyncRun.errorCount} errors
                </span>
                <Link href="/admin/integrations/invu" style={{ fontSize: 13, color: "var(--color-primary)", marginLeft: "auto" }}>
                  {t("admin", "revenue.dashboard.manageSync") || "Manage sync →"}
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  {t("admin", "revenue.dashboard.noSyncYet") || "No sync runs recorded."}
                </span>
                <Link href="/admin/integrations/invu" style={{ fontSize: 13, color: "var(--color-primary)", marginLeft: "auto" }}>
                  {t("admin", "revenue.dashboard.triggerSync") || "Trigger sync →"}
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetricTile({ label, value, sub, accent }: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  accent?: "green" | "amber" | "red";
}) {
  const accentColors: Record<string, { bg: string; color: string }> = {
    green: { bg: "#e8f5e9", color: "#1b5e20" },
    amber: { bg: "#fef9ec", color: "#92700a" },
    red: { bg: "#fef2f2", color: "#991b1b" },
  };
  const ac = accent ? accentColors[accent] : null;

  return (
    <div className="card" style={{ padding: "18px 20px", background: ac?.bg, borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: ac?.color ?? "var(--color-text-muted)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: ac?.color ?? "var(--color-text)", lineHeight: 1.1, marginBottom: sub ? 6 : 0 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  const style = SYNC_STATUS_COLORS[status] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, background: style.bg, color: style.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      {status}
    </span>
  );
}
