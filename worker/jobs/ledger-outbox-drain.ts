/**
 * Ledger Event Outbox Drain
 *
 * Drains PENDING LedgerEventOutbox rows and calls emitLedgerEvent. The full
 * state machine is:
 *
 *   PENDING → PROCESSING → EMITTED
 *   PENDING → PROCESSING → PENDING  (on transient failure, attempt < MAX_ATTEMPTS)
 *   PENDING → PROCESSING → FAILED_REVIEW  (after MAX_ATTEMPTS)
 *
 * Correctness properties:
 *
 *   1. Atomic claiming — rows are claimed in a single
 *      UPDATE … WHERE status='PENDING' … FOR UPDATE SKIP LOCKED
 *      so concurrent drain jobs never process the same row.
 *
 *   2. Stale-PROCESSING recovery — at the start of every invocation, rows
 *      that have been PROCESSING for longer than STALE_THRESHOLD_MS are
 *      returned to PENDING. This handles worker crashes between claiming
 *      and completing, ensuring rows are never permanently stuck.
 *
 *   3. Idempotent emit — emitLedgerEvent deduplicates on idempotencyKey,
 *      so re-processing a row that previously succeeded just increments
 *      LedgerEvent.duplicateCount and returns the existing ID.
 */

import type { Job } from "bullmq";
import { prisma } from "../../src/lib/prisma";
import { emitLedgerEvent } from "../../src/server/services/ledger/ledgerEventService";
import type { LedgerEventType, ConfidenceClass, LedgerEventOutbox } from "@prisma/client";

const MAX_ATTEMPTS = 5;
/** Maximum rows to claim per job invocation. */
const BATCH_SIZE = 50;
/** Rows stuck in PROCESSING longer than this are returned to PENDING. */
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function handleLedgerOutboxDrainJob(job: Job): Promise<unknown> {
  console.log("[ledger-outbox-drain] starting", job.id, job.name);

  // ── Step 1: Recover stale PROCESSING rows ──────────────────────────────
  // A worker crash after claiming but before completing leaves rows in
  // PROCESSING indefinitely. Reset them to PENDING so they get retried.
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
  const staleReset = await prisma.ledgerEventOutbox.updateMany({
    where: {
      status: "PROCESSING",
      lastAttemptAt: { lt: staleThreshold },
    },
    data: { status: "PENDING" },
  });
  if (staleReset.count > 0) {
    console.warn("[ledger-outbox-drain] reset stale PROCESSING rows", { count: staleReset.count });
  }

  // ── Step 2: Atomically claim a batch of PENDING rows ───────────────────
  // Uses FOR UPDATE SKIP LOCKED so concurrent drain jobs never race on the
  // same rows. The UPDATE is atomic — only rows that are still PENDING at
  // the moment of the UPDATE are claimed.
  //
  // Ownership token: the claim sets "lastAttemptAt" = now (unique per
  // invocation to millisecond precision). Terminal writes (EMITTED /
  // FAILED_REVIEW / retry-PENDING) filter on:
  //
  //   status = 'PROCESSING' AND lastAttemptAt = claimTimestamp
  //
  // This prevents a later manual-retry that resets the row to PENDING (and
  // a subsequent drain that re-claims it with a different lastAttemptAt) from
  // having its result overwritten by an older in-flight drain invocation. If
  // the predicate does not match (count = 0), the update is a no-op and a
  // warning is logged — the correct invocation owns the terminal write.
  const now = new Date();
  // Alias for clarity in the ownership predicate below.
  const claimTimestamp = now;
  type ClaimedRow = Pick<LedgerEventOutbox,
    "id" | "eventType" | "sourceSystem" | "sourceConnector" | "sourceRecordId" |
    "idempotencyKey" | "confidenceClass" | "payload" |
    "attributionSessionId" | "reservationId" | "capacityHoldId" |
    "commissionAllocationId" | "paymentIntentId" | "attemptCount"
  >;

  const claimed = await prisma.$queryRaw<ClaimedRow[]>`
    UPDATE "LedgerEventOutbox"
    SET    status = 'PROCESSING',
           "lastAttemptAt" = ${now}
    WHERE  id IN (
      SELECT id
      FROM   "LedgerEventOutbox"
      WHERE  status = 'PENDING'
      ORDER  BY "createdAt" ASC
      LIMIT  ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      "eventType",
      "sourceSystem",
      "sourceConnector",
      "sourceRecordId",
      "idempotencyKey",
      "confidenceClass",
      payload,
      "attributionSessionId",
      "reservationId",
      "capacityHoldId",
      "commissionAllocationId",
      "paymentIntentId",
      "attemptCount"
  `;

  if (!claimed.length) {
    console.log("[ledger-outbox-drain] nothing to drain");
    return { processed: 0, emitted: 0, failed: 0, escalated: 0 };
  }

  // ── Step 3: Emit each claimed row ──────────────────────────────────────
  let emitted = 0;
  let failed = 0;
  let escalated = 0;

  for (const row of claimed) {
    try {
      const result = await emitLedgerEvent({
        eventType: row.eventType as LedgerEventType,
        source: {
          system:    row.sourceSystem,
          connector: row.sourceConnector,
          recordId:  row.sourceRecordId,
        },
        confidenceClass:        row.confidenceClass as ConfidenceClass,
        idempotencyKey:         row.idempotencyKey,
        payload:                (row.payload as Record<string, unknown> | null) ?? null,
        attributionSessionId:   row.attributionSessionId,
        reservationId:          row.reservationId,
        capacityHoldId:         row.capacityHoldId,
        commissionAllocationId: row.commissionAllocationId,
        paymentIntentId:        row.paymentIntentId,
      });

      // Ownership predicate: match status=PROCESSING AND lastAttemptAt=claimTimestamp.
      // If a manual retry reset this row to PENDING and a second drain re-claimed
      // it (writing a different lastAttemptAt), our predicate won't match and we
      // skip the write (count=0). The second drain owns the terminal transition.
      const { count: updatedEmit } = await prisma.ledgerEventOutbox.updateMany({
        where: { id: row.id, status: "PROCESSING", lastAttemptAt: claimTimestamp },
        data: {
          status:               "EMITTED",
          emittedLedgerEventId: result.id,
          attemptCount:         { increment: 1 },
          lastAttemptAt:        new Date(),
          lastError:            null,
        },
      });
      if (updatedEmit === 0) {
        console.warn(
          "[ledger-outbox-drain] ownership predicate missed — row reclaimed by a concurrent drain or deleted; skipping terminal write",
          row.id,
        );
      }
      emitted++;
    } catch (err) {
      const newAttemptCount = Number(row.attemptCount) + 1;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isExhausted = newAttemptCount >= MAX_ATTEMPTS;

      // Ownership predicate: same as success path — only update if we still own
      // the claim (status=PROCESSING AND lastAttemptAt=claimTimestamp).
      const { count: updatedFail } = await prisma.ledgerEventOutbox.updateMany({
        where: { id: row.id, status: "PROCESSING", lastAttemptAt: claimTimestamp },
        data: {
          status:        isExhausted ? "FAILED_REVIEW" : "PENDING",
          attemptCount:  { increment: 1 },
          lastAttemptAt: new Date(),
          lastError:     errorMessage,
        },
      });
      if (updatedFail === 0) {
        console.warn(
          "[ledger-outbox-drain] ownership predicate missed — row reclaimed by a concurrent drain or deleted; skipping terminal write",
          row.id,
        );
      }

      if (isExhausted) {
        escalated++;
        console.error("[ledger-outbox-drain] row escalated to FAILED_REVIEW", {
          outboxId:       row.id,
          eventType:      row.eventType,
          idempotencyKey: row.idempotencyKey,
          attempts:       newAttemptCount,
          err:            errorMessage,
        });
      } else {
        failed++;
        console.warn("[ledger-outbox-drain] row failed, will retry", {
          outboxId:  row.id,
          eventType: row.eventType,
          attempt:   newAttemptCount,
          err:       errorMessage,
        });
      }
    }
  }

  const summary = { processed: claimed.length, emitted, failed, escalated };
  console.log("[ledger-outbox-drain] finished", summary);
  return summary;
}
