/**
 * Reads the most recent launch-readiness alert audit rows for the
 * "Recent alerts" panel on /admin/launch-readiness (Task #136).
 *
 * Returns sanitized, operator-safe rows only — recipient EMAIL ADDRESSES
 * are never returned, only counts. This keeps the panel safe to render
 * for any SUPERADMIN without exposing PII unnecessarily.
 */
import { prisma } from "@/lib/prisma";

const ALERT_ACTIONS = [
  "launch.readiness.alert.sent",
  "launch.readiness.alert.resolved",
  "launch.readiness.alert.skipped",
] as const;

export type RecentLaunchReadinessAlert = {
  id: string;
  action: (typeof ALERT_ACTIONS)[number];
  createdAt: string;
  /** "GO" | "NO_GO" — verdict that triggered this row (when recorded). */
  verdict: "GO" | "NO_GO" | null;
  /** Verdict that came before this transition, when recorded. */
  previousVerdict: "GO" | "NO_GO" | null;
  /** True if this row records a retry to previously-failed recipients. */
  isRetry: boolean;
  /** Total recipients targeted in this run (delivered + failed). 0 if unknown. */
  recipientCount: number;
  /** Subset of recipientCount that actually received the email. */
  deliveredCount: number;
  /** Subset of recipientCount whose send failed. */
  failedCount: number;
  /** Operator-readable reason when row is `skipped` (e.g. "no_active_superadmin_recipients"). */
  skippedReason: string | null;
  /** Sanitized short error message when send failed. Truncated to keep panel readable. */
  errorMessage: string | null;
};

function asVerdict(v: unknown): "GO" | "NO_GO" | null {
  return v === "GO" || v === "NO_GO" ? v : null;
}

function asCount(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function truncate(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export async function getRecentLaunchReadinessAlerts(
  limit = 5,
): Promise<RecentLaunchReadinessAlert[]> {
  const rows = await prisma.auditLog
    .findMany({
      where: { action: { in: [...ALERT_ACTIONS] } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, action: true, createdAt: true, metadata: true },
    })
    .catch((err) => {
      console.warn(
        "[launch-readiness-alerts-panel] failed to read recent alerts:",
        err instanceof Error ? err.message : err,
      );
      return [] as Array<{
        id: string;
        action: string;
        createdAt: Date;
        metadata: unknown;
      }>;
    });

  return rows.map((r) => {
    const md = (r.metadata ?? {}) as Record<string, unknown>;
    const delivered = asCount(md.delivered);
    const failed = asCount(md.failed);
    const recipients = asCount(md.recipients);
    // Prefer the explicit recipients[] length; fall back to delivered+failed
    // when older rows didn't record it.
    const recipientCount = recipients > 0 ? recipients : delivered + failed;
    const reason = typeof md.reason === "string" ? md.reason : null;
    const rawError = typeof md.error === "string" ? md.error : null;
    return {
      id: r.id,
      action: r.action as RecentLaunchReadinessAlert["action"],
      createdAt: r.createdAt.toISOString(),
      verdict: asVerdict(md.verdict),
      previousVerdict: asVerdict(md.previousVerdict),
      isRetry: md.isRetry === true,
      recipientCount,
      deliveredCount: delivered,
      failedCount: failed,
      skippedReason: reason,
      errorMessage: rawError ? truncate(rawError) : null,
    };
  });
}
