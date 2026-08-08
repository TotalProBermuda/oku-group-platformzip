// Audit anomaly orchestrator.
//
// Wraps `detectAuditAnomalies` with:
//   1. Dedupe — a signal whose `signalKey` already produced an
//      `audit.anomaly.alert` row inside the dedupe window is skipped, so a
//      situation does not page on every 15-minute scan.
//   2. Paging — every new signal is sent through `captureMessage`, the same
//      sink Sentry alerts use (see `src/server/errorReporting.ts`). The
//      DPO + engineering on-call subscribe to that channel per the runbook.
//   3. Evidence trail — every alert writes an `audit.anomaly.alert`
//      AuditLog row carrying the source-row ids, so triage can jump
//      straight to the rows that triggered detection.
//
// Triggered every 15 minutes by `worker/jobs/audit-anomaly-scan.ts`. Also
// safe to invoke synchronously (admin "scan now" button, tests).

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { captureMessage } from "@/server/errorReporting";
import {
  detectAuditAnomalies,
  type AnomalySignal,
  type DetectorWindows,
} from "./anomalyDetector";

// Once a signal has paged, suppress duplicates for this many ms. 6h is long
// enough to cover a typical on-call response without re-paging, and short
// enough that an unresolved situation re-fires within the same shift.
const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;

const SCAN_ACTOR_ID = "system:audit-anomaly-scan";

export interface ScanResult {
  startedAt: string;
  finishedAt: string;
  signalsDetected: number;
  signalsAlerted: number;
  signalsSuppressed: number;
  alertedKeys: string[];
}

export async function runAuditAnomalyScan(
  windows: DetectorWindows = {},
): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const signals = await detectAuditAnomalies(windows);

  let alerted = 0;
  let suppressed = 0;
  const alertedKeys: string[] = [];

  for (const sig of signals) {
    if (await wasRecentlyAlerted(sig.signalKey)) {
      suppressed++;
      continue;
    }
    await emitAlert(sig);
    alerted++;
    alertedKeys.push(sig.signalKey);
  }

  const finishedAt = new Date().toISOString();
  return {
    startedAt,
    finishedAt,
    signalsDetected: signals.length,
    signalsAlerted: alerted,
    signalsSuppressed: suppressed,
    alertedKeys,
  };
}

async function wasRecentlyAlerted(signalKey: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const existing = await prisma.auditLog.findFirst({
    where: {
      action: "audit.anomaly.alert",
      createdAt: { gte: since },
      // Postgres JSONB equality on a single key.
      metadata: { path: ["signalKey"], equals: signalKey },
    },
    select: { id: true },
  });
  return !!existing;
}

async function emitAlert(sig: AnomalySignal): Promise<void> {
  // 1. Page through the same sink as Sentry alerts. Payload is run through
  //    scrubLogPayload by captureMessage — but our `details` are
  //    deliberately non-secret (counts, actor ids, timestamps, IPs).
  captureMessage(`[audit-anomaly] ${sig.summary}`, {
    source: "audit-anomaly-detector",
    tags: {
      pattern: sig.pattern,
      severity: sig.severity,
    },
    extras: {
      signalKey: sig.signalKey,
      sourceAuditIds: sig.sourceAuditIds,
      details: sig.details,
      windowStart: sig.windowStart,
      windowEnd: sig.windowEnd,
      // Triage entry-point: each id is a row in the AuditLog table.
      triageHint:
        "Look up sourceAuditIds in AuditLog (e.g. SELECT * FROM \"AuditLog\" WHERE id = ANY($ids))",
    },
  });

  // 2. Evidence row. This is what `recentPaymentAudits`-style admin
  //    dashboards read to show "alerts fired in the last N hours".
  try {
    const metadata: Prisma.InputJsonValue = {
      signalKey: sig.signalKey,
      pattern: sig.pattern,
      severity: sig.severity,
      summary: sig.summary,
      sourceAuditIds: sig.sourceAuditIds,
      details: sig.details as Prisma.InputJsonValue,
      windowStart: sig.windowStart,
      windowEnd: sig.windowEnd,
    };
    await prisma.auditLog.create({
      data: {
        actorId: SCAN_ACTOR_ID,
        action: "audit.anomaly.alert",
        metadata,
      },
    });
  } catch (e) {
    // Audit failure must not abort other alerts in the same scan.
    console.error("[audit-anomaly] failed to write evidence row", sig.signalKey, e);
  }
}
