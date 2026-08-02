"use client";

import { useCallback, useState } from "react";
import type {
  AlertPattern,
  AlertSeverity,
  AlertSummary,
  SecurityAlertRow,
} from "@/server/security/listSecurityAlerts";

interface Props {
  initialAlerts: SecurityAlertRow[];
  initialSummary: AlertSummary;
  lookbackHours: number;
}

const PATTERN_LABEL: Record<AlertPattern, string> = {
  A: "Gateway test failures",
  B: "Active-gateway escalation",
  C: "Bulk beneficiary REJECT/HOLD",
  D: "Large ticket export",
  E: "Bank-field search leak",
  F: "Admin denial cluster",
};

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  info: "badge badge-neutral",
  warn: "badge badge-warning",
  critical: "badge badge-danger",
};

export default function SecurityAlertsPanel({
  initialAlerts,
  initialSummary,
  lookbackHours,
}: Props) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [summary, setSummary] = useState(initialSummary);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(
        `/api/v1/admin/security/alerts?lookbackHours=${lookbackHours}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      if (!j.ok) {
        setError(j.error || "Failed to refresh alerts.");
        return;
      }
      setAlerts(j.alerts || []);
      setSummary(j.summary);
    } catch (e: unknown) {
      setError((e as Error).message || "Network error.");
    }
  }, [lookbackHours]);

  const scanNow = useCallback(async () => {
    setScanning(true);
    setScanMsg(null);
    setError(null);
    try {
      const r = await fetch("/api/v1/admin/security/scan", { method: "POST" });
      const j = await r.json();
      if (!j.ok) {
        setError(j.error || "Scan failed.");
      } else {
        setScanMsg(
          `Detected ${j.signalsDetected} · alerted ${j.signalsAlerted} · suppressed ${j.signalsSuppressed}`,
        );
        await refresh();
      }
    } catch (e: unknown) {
      setError((e as Error).message || "Network error.");
    } finally {
      setScanning(false);
    }
  }, [refresh]);

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 16,
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Security alerts</h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Audit-anomaly signals detected in the last {Math.round(lookbackHours / 24)} days.
            Each row links back to its source audit ids — start triage there per the incident-response runbook.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={refresh}
            disabled={scanning}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={scanNow}
            disabled={scanning}
          >
            {scanning ? "Scanning…" : "Scan now"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      {scanMsg && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          {scanMsg}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <SummaryTile label="Total" value={summary.total} />
        <SummaryTile label="Critical" value={summary.bySeverity.critical} tone="danger" />
        <SummaryTile label="Warn" value={summary.bySeverity.warn} tone="warning" />
        <SummaryTile label="Info" value={summary.bySeverity.info} />
      </div>

      {alerts.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--color-text-muted)",
            border: "1px dashed var(--color-border)",
            borderRadius: 8,
          }}
        >
          No alerts in the lookback window. The 15-minute BullMQ scan job is the primary detection path; use “Scan now” to re-run on demand.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Fired (UTC)</th>
                <th>Severity</th>
                <th>Pattern</th>
                <th>Summary</th>
                <th>Source audit ids</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {formatTime(a.firedAt)}
                  </td>
                  <td>
                    <span
                      className={
                        a.severity in SEVERITY_BADGE
                          ? SEVERITY_BADGE[a.severity as AlertSeverity]
                          : "badge badge-neutral"
                      }
                    >
                      {a.severity}
                    </span>
                  </td>
                  <td>
                    <strong>{a.pattern}</strong>
                    {a.pattern in PATTERN_LABEL && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {PATTERN_LABEL[a.pattern as AlertPattern]}
                      </div>
                    )}
                  </td>
                  <td style={{ maxWidth: 520 }}>{a.summary}</td>
                  <td>
                    <code
                      style={{
                        fontSize: 11,
                        wordBreak: "break-all",
                        color: "var(--color-text-muted)",
                      }}
                      title={a.sourceAuditIds.join(", ")}
                    >
                      {a.sourceAuditIds.length === 0
                        ? "—"
                        : a.sourceAuditIds.length === 1
                          ? a.sourceAuditIds[0]
                          : `${a.sourceAuditIds[0]} +${a.sourceAuditIds.length - 1} more`}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning";
}) {
  const accent =
    tone === "danger"
      ? "var(--color-danger, #c0392b)"
      : tone === "warning"
        ? "var(--color-warning, #b8860b)"
        : "var(--color-text)";
  return (
    <div
      style={{
        padding: 16,
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--layer-1)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: accent }}>{value}</div>
    </div>
  );
}

function formatTime(iso: string): string {
  // Stable UTC display. Avoids browser-locale drift between server and
  // client renders (which would trip Next.js hydration warnings).
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}
