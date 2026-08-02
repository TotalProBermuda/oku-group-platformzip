// Read-only surface over `audit.anomaly.alert` rows for the admin
// security dashboard (#117). Pure transform — no mutation, no paging
// through external sinks. Every field returned here is already
// non-secret by construction (counts, signal keys, actor ids,
// timestamps, IPs); the alerter never persists raw subject data.

import { prisma } from "@/lib/prisma";

export type AlertSeverity = "info" | "warn" | "critical";
export type AlertPattern = "A" | "B" | "C" | "D" | "E" | "F";

export interface SecurityAlertRow {
  id: string;
  signalKey: string;
  pattern: AlertPattern | "?";
  severity: AlertSeverity | "?";
  summary: string;
  sourceAuditIds: string[];
  details: Record<string, unknown>;
  windowStart: string | null;
  windowEnd: string | null;
  firedAt: string;
}

export interface ListAlertsInput {
  /** Lookback window in milliseconds. Defaults to 7 days. */
  lookbackMs?: number;
  /** Optional filter by severity. */
  severity?: AlertSeverity;
  /** Optional filter by pattern letter. */
  pattern?: AlertPattern;
  /** Hard cap on rows returned. Defaults to 200, max 500. */
  limit?: number;
}

const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function listSecurityAlerts(
  input: ListAlertsInput = {},
): Promise<SecurityAlertRow[]> {
  const since = new Date(
    Date.now() - (input.lookbackMs ?? DEFAULT_LOOKBACK_MS),
  );
  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const rows = await prisma.auditLog.findMany({
    where: {
      action: "audit.anomaly.alert",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, metadata: true, createdAt: true },
  });

  const out: SecurityAlertRow[] = [];
  for (const r of rows) {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const severity = (typeof m.severity === "string" ? m.severity : "?") as
      | AlertSeverity
      | "?";
    const pattern = (typeof m.pattern === "string" ? m.pattern : "?") as
      | AlertPattern
      | "?";
    if (input.severity && severity !== input.severity) continue;
    if (input.pattern && pattern !== input.pattern) continue;
    out.push({
      id: r.id,
      signalKey: typeof m.signalKey === "string" ? m.signalKey : "",
      pattern,
      severity,
      summary: typeof m.summary === "string" ? m.summary : "",
      sourceAuditIds: Array.isArray(m.sourceAuditIds)
        ? (m.sourceAuditIds as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [],
      details:
        m.details && typeof m.details === "object" && !Array.isArray(m.details)
          ? (m.details as Record<string, unknown>)
          : {},
      windowStart: typeof m.windowStart === "string" ? m.windowStart : null,
      windowEnd: typeof m.windowEnd === "string" ? m.windowEnd : null,
      firedAt: r.createdAt.toISOString(),
    });
  }
  return out;
}

export interface AlertSummary {
  total: number;
  bySeverity: Record<AlertSeverity, number>;
  byPattern: Record<AlertPattern, number>;
}

export function summarizeAlerts(rows: SecurityAlertRow[]): AlertSummary {
  const bySeverity: Record<AlertSeverity, number> = {
    info: 0,
    warn: 0,
    critical: 0,
  };
  const byPattern: Record<AlertPattern, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
    F: 0,
  };
  for (const r of rows) {
    if (r.severity in bySeverity) bySeverity[r.severity as AlertSeverity]++;
    if (r.pattern in byPattern) byPattern[r.pattern as AlertPattern]++;
  }
  return { total: rows.length, bySeverity, byPattern };
}
