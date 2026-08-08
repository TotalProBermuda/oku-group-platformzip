/**
 * ProofPay — Canonical Ledger Event Writer
 *
 * `emitLedgerEvent` is the single entrypoint for writing LedgerEvent rows.
 * It provides nullable-safe deduplication backed by two DB-level constraints:
 *
 *   1. Standard unique index on (sourceRecordId, idempotencyKey) — deduplicates
 *      external-source events. PostgreSQL's NULL != NULL semantics mean two rows
 *      with sourceRecordId=NULL are NOT caught here (by design).
 *
 *   2. Partial unique index on (idempotencyKey) WHERE sourceRecordId IS NULL —
 *      deduplicates internal app events. Both constraints raise P2002 on
 *      concurrent duplicate emits, caught by the race-handler below.
 *
 * Deduplication behavior:
 *   - When BOTH `sourceRecordId` and `idempotencyKey` are present, deduplicate
 *     on the (sourceRecordId, idempotencyKey) unique pair.
 *   - When `sourceRecordId` is null (internal app events), deduplicate on
 *     `idempotencyKey` alone via the partial index.
 *   - On duplicate: increment `duplicateCount`, set `lastDuplicateAt`, return
 *     the existing event. No separate error row is written.
 *
 * Idempotency semantics:
 *   - Each (sourceRecordId, idempotencyKey) pair or (null-source, idempotencyKey)
 *     maps to exactly one LedgerEvent row.
 *   - For reservation lifecycle transitions, callers anchor the idempotency key
 *     to the ReservationStatusLog row ID. This makes each recorded host action
 *     map to exactly one event — NOT retry-idempotent at the transition level.
 *     If the same semantic transition is invoked twice (creating two log rows),
 *     two LedgerEvents are emitted, which is correct: two distinct actions occurred.
 *
 * Deterministic key convention for internal events (no external sourceRecordId):
 *   reservation:{reservationId}:status_log:{statusLogId}   — reservation lifecycle
 *   commission_allocation:{allocationId}:minted             — commission minting
 *   attribution_session:{sessionId}:anchor_pending          — attribution anchor
 *   capacity_hold:{holdId}:created                          — capacity lifecycle
 *
 * This function is best-effort at the call site — callers should catch and
 * log but NOT let emitter failures block the primary operation.
 */

import { prisma } from "@/lib/prisma";
import type { LedgerEventType, ConfidenceClass } from "@prisma/client";

export type LedgerEventSource = {
  /** e.g. "invu", "reservations_api", "host_ops", "commission_minting" */
  system: string;
  /** e.g. "invu_v2", null for internal sources */
  connector?: string | null;
  /** External ID from the originating system — null for internal app events */
  recordId?: string | null;
};

export type LedgerEventInput = {
  eventType: LedgerEventType;
  source: LedgerEventSource;
  confidenceClass: ConfidenceClass;
  /** ISO string or Date of when the event actually occurred (not when it was received) */
  occurredAt?: Date | string;
  /** Deterministic idempotency key — callers MUST provide this */
  idempotencyKey: string;
  /** Raw payload snapshot stored alongside the event for dispute resolution */
  payload?: Record<string, unknown> | null;
  /** External blob/storage reference for large raw payloads */
  rawPayloadRef?: string | null;
  /** Cross-system correlation ID (e.g. X-Request-ID) */
  auditTraceId?: string | null;
  // Optional FK bindings — set whichever apply to this event
  attributionSessionId?: string | null;
  reservationId?: string | null;
  commissionAllocationId?: string | null;
  /** Reserved for future CapacityHold model */
  capacityHoldId?: string | null;
  /** Payments P215 — links the event to a PaymentIntent for audit trail queries */
  paymentIntentId?: string | null;
};

export type EmitResult = {
  id: string;
  isDuplicate: boolean;
  duplicateCount: number;
};

/**
 * Emit a canonical ledger event with idempotent deduplication.
 *
 * Returns the created (or existing, on duplicate) LedgerEvent id.
 * Never throws — any database error is re-thrown so the caller can decide
 * whether to swallow or propagate.
 */
export async function emitLedgerEvent(input: LedgerEventInput): Promise<EmitResult> {
  const occurredAt = input.occurredAt
    ? typeof input.occurredAt === "string"
      ? new Date(input.occurredAt)
      : input.occurredAt
    : new Date();

  const sourceRecordId = input.source.recordId ?? null;
  const idempotencyKey = input.idempotencyKey;

  // ── Deduplication lookup ────────────────────────────────────────────────
  // When sourceRecordId is present, use the unique (sourceRecordId, idempotencyKey) index.
  // When sourceRecordId is null, we can only deduplicate on idempotencyKey alone
  // because the unique constraint is on the pair. We fall back to a findFirst
  // scan on idempotencyKey which is indexed.
  let existing: { id: string; duplicateCount: number } | null = null;

  if (sourceRecordId !== null) {
    existing = await prisma.ledgerEvent.findUnique({
      where: {
        LedgerEvent_dedup_key: {
          sourceSystem: input.source.system,
          sourceRecordId,
          idempotencyKey,
        },
      },
      select: { id: true, duplicateCount: true },
    });
  } else {
    // Internal events: idempotency key must be globally unique per event.
    // Callers are responsible for minting deterministic keys that include
    // enough context (entity ID + state) to avoid cross-entity collisions.
    existing = await prisma.ledgerEvent.findFirst({
      where: { idempotencyKey, sourceRecordId: null },
      select: { id: true, duplicateCount: true },
    });
  }

  if (existing) {
    // Duplicate — increment counter in-place and return early
    await prisma.ledgerEvent.update({
      where: { id: existing.id },
      data: {
        duplicateCount: { increment: 1 },
        lastDuplicateAt: new Date(),
      },
    });
    return {
      id: existing.id,
      isDuplicate: true,
      duplicateCount: existing.duplicateCount + 1,
    };
  }

  // ── Create new event ────────────────────────────────────────────────────
  // Use upsert to handle the race between the findFirst/findUnique above
  // and the create below (two concurrent emits for the same event).
  // For sourceRecordId-present events we can use the unique constraint;
  // for null-sourceRecordId events we use a try/catch on the create and
  // re-query on P2002 (unique key constraint on idempotencyKey is also
  // guaranteed to fire if two concurrent requests hit the null branch).
  try {
    const created = await prisma.ledgerEvent.create({
      data: {
        eventType: input.eventType,
        sourceSystem: input.source.system,
        sourceConnector: input.source.connector ?? null,
        sourceRecordId,
        idempotencyKey,
        occurredAt,
        confidenceClass: input.confidenceClass,
        rawPayloadRef: input.rawPayloadRef ?? null,
        auditTraceId: input.auditTraceId ?? null,
        payload: (input.payload ?? undefined) as import("@prisma/client").Prisma.InputJsonValue | undefined,
        attributionSessionId: input.attributionSessionId ?? null,
        reservationId: input.reservationId ?? null,
        commissionAllocationId: input.commissionAllocationId ?? null,
        capacityHoldId: input.capacityHoldId ?? null,
        paymentIntentId: input.paymentIntentId ?? null,
        duplicateCount: 0,
      },
      select: { id: true, duplicateCount: true },
    });
    return { id: created.id, isDuplicate: false, duplicateCount: 0 };
  } catch (err: unknown) {
    // P2002 = unique constraint violation from a concurrent emitter racing
    // on the same (sourceRecordId, idempotencyKey) pair. Treat as duplicate.
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const race = sourceRecordId !== null
        ? await prisma.ledgerEvent.findUnique({
            where: {
              LedgerEvent_dedup_key: {
                sourceSystem: input.source.system,
                sourceRecordId,
                idempotencyKey,
              },
            },
            select: { id: true, duplicateCount: true },
          })
        : await prisma.ledgerEvent.findFirst({
            where: { idempotencyKey, sourceRecordId: null },
            select: { id: true, duplicateCount: true },
          });

      if (race) {
        await prisma.ledgerEvent.update({
          where: { id: race.id },
          data: {
            duplicateCount: { increment: 1 },
            lastDuplicateAt: new Date(),
          },
        });
        return { id: race.id, isDuplicate: true, duplicateCount: race.duplicateCount + 1 };
      }
    }
    throw err;
  }
}
