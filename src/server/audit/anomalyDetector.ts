// Audit-log anomaly detector.
//
// Pure read/transform layer over `AuditLog`. Given a "now" timestamp and a
// lookback window, returns the set of anomaly signals documented in
// `docs/privacy/incident-response/RUNBOOK.md` §1.2:
//
//   A. payment.gateway.{authnet,cybersource}.test.failed clusters
//      (≥ AUTHNET_TEST_FAILURE_THRESHOLD in 1h)
//   B. payment.gateway.active.changed.rejected followed within 24h by a
//      successful payment.gateway.active.changed from a *different* actor.
//   C. beneficiary.status.transition to REJECTED/ON_HOLD by the same actor
//      on > BENEFICIARY_TRANSITION_THRESHOLD profiles in 24h.
//   D. admin.tickets.export with metadata.rowCount > LARGE_EXPORT_THRESHOLD.
//   E. admin.beneficiary.search emitting bank-field values
//      (any occurrence — RESTRICTED_COMPLIANCE).
//   F. auth.admin.denied clusters (≥ ADMIN_DENIED_PER_IP_THRESHOLD from a
//      single IP in 10m, or ≥ ADMIN_DENIED_GLOBAL_THRESHOLD globally in 10m).
//
// The detector is deliberately stateless. The orchestrator
// (`anomalyAlerter.ts`) is responsible for dedupe, alert emission, and
// writing the resulting `audit.anomaly.alert` audit row.

import { prisma } from "@/lib/prisma";

export type AnomalySeverity = "info" | "warn" | "critical";

export interface AnomalySignal {
  /** Stable identifier used for dedupe. Same situation → same key. */
  signalKey: string;
  /** Pattern letter from RUNBOOK §1.2 (A–F). */
  pattern: "A" | "B" | "C" | "D" | "E" | "F";
  severity: AnomalySeverity;
  /** Human-readable summary, safe to put in an alert body. */
  summary: string;
  /** AuditLog row ids that triggered the signal — link target for triage. */
  sourceAuditIds: string[];
  /** Non-secret structured details for the alert payload. */
  details: Record<string, unknown>;
  /** Earliest source-row timestamp considered. */
  windowStart: string;
  /** Latest source-row timestamp considered. */
  windowEnd: string;
}

// Thresholds — tuned conservatively to favor signal over noise. Override
// via env where useful.
const AUTHNET_TEST_FAILURE_THRESHOLD = numEnv(
  "ALERT_PAYMENT_TEST_FAILURE_THRESHOLD",
  5,
);
const BENEFICIARY_TRANSITION_THRESHOLD = numEnv(
  "ALERT_BENEFICIARY_BULK_REJECT_THRESHOLD",
  5,
);
const LARGE_EXPORT_THRESHOLD = numEnv(
  "ALERT_TICKET_EXPORT_ROW_THRESHOLD",
  1000,
);
const ADMIN_DENIED_PER_IP_THRESHOLD = numEnv(
  "ALERT_ADMIN_DENIED_PER_IP_THRESHOLD",
  10,
);
const ADMIN_DENIED_GLOBAL_THRESHOLD = numEnv(
  "ALERT_ADMIN_DENIED_GLOBAL_THRESHOLD",
  30,
);

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface DetectorWindows {
  /** End of the scanning window. Defaults to `new Date()`. */
  now?: Date;
  /** Lookback for short clusters (test failures, denied access). */
  shortMs?: number;
  /** Lookback for daily clusters (transitions, active-gateway flips). */
  longMs?: number;
}

const DEFAULT_SHORT_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_LONG_MS = 24 * 60 * 60 * 1000; // 24 hours
const DENIED_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Run all detectors against AuditLog rows in the given windows. Returns the
 * union of every signal found. Does NOT write anything.
 */
export async function detectAuditAnomalies(
  windows: DetectorWindows = {},
): Promise<AnomalySignal[]> {
  const now = windows.now ?? new Date();
  const shortStart = new Date(now.getTime() - (windows.shortMs ?? DEFAULT_SHORT_MS));
  const longStart = new Date(now.getTime() - (windows.longMs ?? DEFAULT_LONG_MS));
  const deniedStart = new Date(now.getTime() - DENIED_WINDOW_MS);

  const signals: AnomalySignal[] = [];

  signals.push(...(await detectGatewayTestFailures(shortStart, now)));
  signals.push(...(await detectActiveGatewayConflict(longStart, now)));
  signals.push(...(await detectBulkBeneficiaryReject(longStart, now)));
  signals.push(...(await detectLargeTicketExport(longStart, now)));
  signals.push(...(await detectBankFieldSearchLeak(longStart, now)));
  signals.push(...(await detectAdminDeniedClusters(deniedStart, now)));

  return signals;
}

// ─── A. Gateway test-failure clusters ──────────────────────────────────────

async function detectGatewayTestFailures(
  windowStart: Date,
  now: Date,
): Promise<AnomalySignal[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          "payment.gateway.authnet.test.failed",
          "payment.gateway.cybersource.test.failed",
        ],
      },
      createdAt: { gte: windowStart, lte: now },
    },
    select: { id: true, action: true, actorId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length < AUTHNET_TEST_FAILURE_THRESHOLD) return [];

  const byProvider = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byProvider.get(r.action) ?? [];
    arr.push(r);
    byProvider.set(r.action, arr);
  }

  const out: AnomalySignal[] = [];
  for (const [action, group] of byProvider) {
    if (group.length < AUTHNET_TEST_FAILURE_THRESHOLD) continue;
    const provider = action.includes("cybersource") ? "cybersource" : "authnet";
    out.push({
      signalKey: `A:${provider}:${windowBucket(now, DEFAULT_SHORT_MS)}`,
      pattern: "A",
      severity: "warn",
      summary: `${group.length} ${provider} test-connection failures in the last hour (threshold ${AUTHNET_TEST_FAILURE_THRESHOLD}). Possible credential/key compromise or vendor outage.`,
      sourceAuditIds: group.map((r) => r.id),
      details: {
        provider,
        count: group.length,
        threshold: AUTHNET_TEST_FAILURE_THRESHOLD,
        distinctActors: new Set(group.map((r) => r.actorId)).size,
      },
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    });
  }
  return out;
}

// ─── B. Active-gateway rejected-then-changed by different actor ───────────

async function detectActiveGatewayConflict(
  windowStart: Date,
  now: Date,
): Promise<AnomalySignal[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          "payment.gateway.active.changed",
          "payment.gateway.active.changed.rejected",
        ],
      },
      createdAt: { gte: windowStart, lte: now },
    },
    select: { id: true, action: true, actorId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const out: AnomalySignal[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.action !== "payment.gateway.active.changed.rejected") continue;
    const next = rows
      .slice(i + 1)
      .find(
        (x) =>
          x.action === "payment.gateway.active.changed" &&
          x.actorId !== r.actorId,
      );
    if (next) {
      out.push({
        signalKey: `B:${r.id}:${next.id}`,
        pattern: "B",
        severity: "critical",
        summary: `Active-gateway change was rejected for actor ${r.actorId} but then succeeded under a different actor (${next.actorId}). Possible permission-escalation or insider workaround.`,
        sourceAuditIds: [r.id, next.id],
        details: {
          rejectedAt: r.createdAt.toISOString(),
          rejectedActor: r.actorId,
          succeededAt: next.createdAt.toISOString(),
          succeededActor: next.actorId,
        },
        windowStart: r.createdAt.toISOString(),
        windowEnd: next.createdAt.toISOString(),
      });
    }
  }
  return out;
}

// ─── C. Bulk beneficiary REJECTED/ON_HOLD by same actor ────────────────────

async function detectBulkBeneficiaryReject(
  windowStart: Date,
  now: Date,
): Promise<AnomalySignal[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "beneficiary.status.transition",
      createdAt: { gte: windowStart, lte: now },
    },
    select: { id: true, actorId: true, metadata: true, createdAt: true },
  });

  const byActor = new Map<
    string,
    { ids: string[]; targets: Set<string>; firstAt: Date; lastAt: Date }
  >();
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as {
      after?: string;
      targetUserId?: string;
    };
    if (meta.after !== "REJECTED" && meta.after !== "ON_HOLD") continue;
    if (!meta.targetUserId) continue;
    const cur = byActor.get(r.actorId) ?? {
      ids: [],
      targets: new Set<string>(),
      firstAt: r.createdAt,
      lastAt: r.createdAt,
    };
    cur.ids.push(r.id);
    cur.targets.add(meta.targetUserId);
    if (r.createdAt < cur.firstAt) cur.firstAt = r.createdAt;
    if (r.createdAt > cur.lastAt) cur.lastAt = r.createdAt;
    byActor.set(r.actorId, cur);
  }

  const out: AnomalySignal[] = [];
  for (const [actorId, agg] of byActor) {
    if (agg.targets.size <= BENEFICIARY_TRANSITION_THRESHOLD) continue;
    out.push({
      signalKey: `C:${actorId}:${windowBucket(now, DEFAULT_LONG_MS)}`,
      pattern: "C",
      severity: "critical",
      summary: `Actor ${actorId} transitioned ${agg.targets.size} beneficiaries to REJECTED/ON_HOLD in 24h (threshold ${BENEFICIARY_TRANSITION_THRESHOLD}). Possible account takeover or rogue admin.`,
      sourceAuditIds: agg.ids,
      details: {
        actorId,
        distinctBeneficiaries: agg.targets.size,
        threshold: BENEFICIARY_TRANSITION_THRESHOLD,
        firstAt: agg.firstAt.toISOString(),
        lastAt: agg.lastAt.toISOString(),
      },
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    });
  }
  return out;
}

// ─── D. Large ticket export ────────────────────────────────────────────────

async function detectLargeTicketExport(
  windowStart: Date,
  now: Date,
): Promise<AnomalySignal[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "admin.tickets.export",
      createdAt: { gte: windowStart, lte: now },
    },
    select: { id: true, actorId: true, metadata: true, createdAt: true },
  });

  const out: AnomalySignal[] = [];
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as { rowCount?: number };
    const rowCount = typeof meta.rowCount === "number" ? meta.rowCount : 0;
    if (rowCount <= LARGE_EXPORT_THRESHOLD) continue;
    out.push({
      signalKey: `D:${r.id}`,
      pattern: "D",
      severity: "warn",
      summary: `Ticket export of ${rowCount} rows by actor ${r.actorId} (threshold ${LARGE_EXPORT_THRESHOLD}). Confirm legitimate business need.`,
      sourceAuditIds: [r.id],
      details: {
        actorId: r.actorId,
        rowCount,
        threshold: LARGE_EXPORT_THRESHOLD,
        at: r.createdAt.toISOString(),
      },
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    });
  }
  return out;
}

// ─── E. Beneficiary search returning bank fields ───────────────────────────

async function detectBankFieldSearchLeak(
  windowStart: Date,
  now: Date,
): Promise<AnomalySignal[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "admin.beneficiary.search",
      createdAt: { gte: windowStart, lte: now },
    },
    select: { id: true, actorId: true, metadata: true, createdAt: true },
  });

  const out: AnomalySignal[] = [];
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as {
      matchedBankField?: boolean;
      bankFieldHit?: boolean;
    };
    if (!(meta.matchedBankField === true || meta.bankFieldHit === true)) continue;
    out.push({
      signalKey: `E:${r.id}`,
      pattern: "E",
      severity: "critical",
      summary: `Beneficiary search returned bank-field values (RESTRICTED_COMPLIANCE). Should be impossible — treat as a confirmed indicator.`,
      sourceAuditIds: [r.id],
      details: {
        actorId: r.actorId,
        at: r.createdAt.toISOString(),
      },
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    });
  }
  return out;
}

// ─── F. Admin-access denial clusters (credential stuffing signal) ─────────

async function detectAdminDeniedClusters(
  windowStart: Date,
  now: Date,
): Promise<AnomalySignal[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "auth.admin.denied",
      createdAt: { gte: windowStart, lte: now },
    },
    select: { id: true, ip: true, createdAt: true },
  });

  if (rows.length === 0) return [];

  const out: AnomalySignal[] = [];

  // Per-IP cluster
  const byIp = new Map<string, string[]>();
  for (const r of rows) {
    const ip = r.ip ?? "unknown";
    const arr = byIp.get(ip) ?? [];
    arr.push(r.id);
    byIp.set(ip, arr);
  }
  for (const [ip, ids] of byIp) {
    if (ids.length < ADMIN_DENIED_PER_IP_THRESHOLD) continue;
    out.push({
      signalKey: `F:ip:${ip}:${windowBucket(now, DENIED_WINDOW_MS)}`,
      pattern: "F",
      severity: "warn",
      summary: `${ids.length} unauthenticated admin requests from IP ${ip} in 10m (threshold ${ADMIN_DENIED_PER_IP_THRESHOLD}). Possible credential stuffing.`,
      sourceAuditIds: ids,
      details: { ip, count: ids.length, threshold: ADMIN_DENIED_PER_IP_THRESHOLD },
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    });
  }

  // Global cluster (catches distributed attacks)
  if (rows.length >= ADMIN_DENIED_GLOBAL_THRESHOLD) {
    out.push({
      signalKey: `F:global:${windowBucket(now, DENIED_WINDOW_MS)}`,
      pattern: "F",
      severity: "warn",
      summary: `${rows.length} unauthenticated admin requests across all IPs in 10m (threshold ${ADMIN_DENIED_GLOBAL_THRESHOLD}). Possible distributed credential stuffing.`,
      sourceAuditIds: rows.map((r) => r.id),
      details: {
        count: rows.length,
        threshold: ADMIN_DENIED_GLOBAL_THRESHOLD,
        distinctIps: byIp.size,
      },
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    });
  }

  return out;
}

/**
 * Bucket "now" into a window-aligned slot so the same situation observed by
 * two consecutive scans produces the same `signalKey` (cheap dedupe).
 */
function windowBucket(now: Date, windowMs: number): number {
  return Math.floor(now.getTime() / windowMs);
}
