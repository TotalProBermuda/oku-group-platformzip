/**
 * Ledger Event Outbox — Transactional Enqueue Helper
 *
 * `enqueueLedgerEvent` is the ONLY function callers need. It writes a
 * `LedgerEventOutbox` row inside the same Prisma transaction as the calling
 * business write. The BullMQ worker drains PENDING rows and calls
 * `emitLedgerEvent`, making the proof trail retryable and durable.
 *
 * Usage pattern:
 *
 *   await prisma.$transaction(async (tx) => {
 *     const record = await tx.someModel.create({ ... });
 *     await enqueueLedgerEvent(tx, {
 *       eventType: "RESERVATION_REQUESTED",
 *       source: { system: "reservations_api" },
 *       confidenceClass: "CUSTOMER_CLAIMED_EVENT",
 *       idempotencyKey: `reservation:${record.id}:status:REQUESTED`,
 *       reservationId: record.id,
 *       payload: { ... },
 *     });
 *   });
 *
 * The tx parameter may be a Prisma transaction client OR the regular `prisma`
 * singleton when the caller has no enclosing transaction (standalone writes).
 */

import type { LedgerEventType, ConfidenceClass, Prisma } from "@prisma/client";

export type LedgerOutboxInput = {
  eventType: LedgerEventType;
  source: {
    system: string;
    connector?: string | null;
    recordId?: string | null;
  };
  confidenceClass: ConfidenceClass;
  idempotencyKey: string;
  payload?: Record<string, unknown> | null;
  // Optional FK bindings — set whichever apply
  attributionSessionId?: string | null;
  reservationId?: string | null;
  capacityHoldId?: string | null;
  commissionAllocationId?: string | null;
  // Payments P215 — payment intent lifecycle events
  paymentIntentId?: string | null;
};

// Accepts any client that has a `ledgerEventOutbox.create` method —
// either the regular `prisma` singleton or a Prisma transaction client.
// Uses UncheckedCreateInput so callers can pass raw FK IDs directly
// (e.g. attributionSessionId) rather than nested relation objects.
type TxClient = {
  ledgerEventOutbox: {
    create: (args: { data: Prisma.LedgerEventOutboxUncheckedCreateInput }) => Promise<{ id: string }>;
  };
};

/**
 * Write a durable LedgerEventOutbox row. Call this INSIDE the same Prisma
 * transaction as the primary business write so the proof-intent and the
 * business action commit atomically.
 *
 * Throws on failure — any error from the outbox write propagates to the
 * caller, which rolls back the enclosing transaction. This is intentional:
 * the business action and the proof-intent must commit together or not at
 * all. Do NOT wrap this call in a silent try/catch inside a transaction.
 */
export async function enqueueLedgerEvent(
  tx: TxClient,
  input: LedgerOutboxInput
): Promise<void> {
  try {
    await tx.ledgerEventOutbox.create({
      data: {
        eventType:       input.eventType,
        sourceSystem:    input.source.system,
        sourceConnector: input.source.connector ?? null,
        sourceRecordId:  input.source.recordId  ?? null,
        idempotencyKey:  input.idempotencyKey,
        confidenceClass: input.confidenceClass,
        payload:         (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        // Raw FK fields — safe via UncheckedCreateInput
        ...(input.attributionSessionId   != null ? { attributionSessionId:   input.attributionSessionId }   : {}),
        ...(input.reservationId          != null ? { reservationId:          input.reservationId }          : {}),
        ...(input.capacityHoldId         != null ? { capacityHoldId:         input.capacityHoldId }         : {}),
        ...(input.commissionAllocationId != null ? { commissionAllocationId: input.commissionAllocationId } : {}),
        ...(input.paymentIntentId        != null ? { paymentIntentId:        input.paymentIntentId }        : {}),
        status: "PENDING",
      },
    });
  } catch (err) {
    // Outbox writes must never fail silently in a way that looks like success,
    // but they also must never abort the enclosing transaction unless the
    // tx itself throws. Log here so ops can detect systemic outbox write failures.
    console.error("[ledgerOutbox] failed to enqueue outbox row", {
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      err,
    });
    // Re-throw so the enclosing transaction rolls back — we WANT the business
    // action to succeed atomically WITH the outbox intent.
    throw err;
  }
}
