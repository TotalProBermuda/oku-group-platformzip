import { prisma } from "@/lib/prisma";
import { enqueueLedgerEvent } from "@/server/services/ledger/ledgerOutboxService";
import { reservationArchiveBlockReason } from "@/server/host/reservationArchivePolicy";

function archiveError(message: string, status = 409) {
  return Object.assign(new Error(message), { status });
}

/**
 * Soft-archive a host-confirmed test/demo reservation. This intentionally
 * cancels the record (and releases capacity) while preserving status history,
 * attribution, and all payment/POS evidence. It is never a hard delete.
 */
export async function archiveTestReservationAsCancelled(args: {
  reservationId: string;
  actorId: string;
  reason: string;
}) {
  const reason = args.reason.trim();
  if (reason.length < 8 || reason.length > 500) {
    throw archiveError("Explain why this is test/demo data (8–500 characters).", 400);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${args.reservationId}))`;
    const reservation = await tx.reservation.findUnique({
      where: { id: args.reservationId },
      select: {
        id: true,
        venueId: true,
        status: true,
        actualRevenueCents: true,
        attributionSession: {
          select: {
            tableSession: { select: { openedInvuOrderId: true } },
            bindings: { select: { invuOrderId: true }, take: 1 },
          },
        },
        paymentIntent: { select: { id: true, status: true, cybersourceTransactionId: true } },
      },
    });
    if (!reservation) throw archiveError("Reservation not found.", 404);
    const boundOrderId = reservation.attributionSession?.tableSession?.openedInvuOrderId
      ?? reservation.attributionSession?.bindings[0]?.invuOrderId
      ?? null;
    const blockedReason = reservationArchiveBlockReason({
      status: reservation.status,
      actualRevenueCents: reservation.actualRevenueCents,
      boundInvuOrderId: boundOrderId,
      hasPaymentIntent: Boolean(reservation.paymentIntent),
    });
    if (blockedReason) throw archiveError(blockedReason);

    const changed = await tx.reservation.updateMany({
      where: { id: reservation.id, status: reservation.status },
      data: { status: "CANCELLED" },
    });
    if (changed.count !== 1) throw archiveError("Reservation changed while this action was being confirmed. Refresh and review it again.");

    const log = await tx.reservationStatusLog.create({
      data: {
        reservationId: reservation.id,
        fromStatus: reservation.status,
        toStatus: "CANCELLED",
        changedByUserId: args.actorId,
        lossReason: "OTHER",
        lossReasonNotes: `TEST_DEMO_ARCHIVE: ${reason}`,
        notes: `Archived from active host queue as test/demo data. ${reason}`,
      },
      select: { id: true },
    });
    await tx.reservationAttribution.updateMany({
      where: { reservationId: reservation.id },
      data: { lossReason: "OTHER", lossReasonNotes: `TEST_DEMO_ARCHIVE: ${reason}` },
    });
    const holds = await tx.capacityHold.findMany({
      where: { reservationId: reservation.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (holds.length) {
      await tx.capacityHold.updateMany({
        where: { id: { in: holds.map((hold) => hold.id) }, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });
    }
    await tx.reservationHandoff.updateMany({
      where: { reservationId: reservation.id, handoffStatus: { notIn: ["CLOSED", "CANCELLED"] } },
      data: { handoffStatus: "CANCELLED" },
    });
    await enqueueLedgerEvent(tx, {
      eventType: "RESERVATION_CANCELLED",
      source: { system: "host_test_data_review" },
      confidenceClass: "PARTNER_REPORTED_EVENT",
      idempotencyKey: `reservation:${reservation.id}:test-demo-archive:${log.id}`,
      reservationId: reservation.id,
      payload: {
        fromStatus: reservation.status,
        toStatus: "CANCELLED",
        actorId: args.actorId,
        reason: "TEST_DEMO_ARCHIVE",
        releasedCapacityHoldIds: holds.map((hold) => hold.id),
      },
    });
    return { id: reservation.id, venueId: reservation.venueId, status: "CANCELLED" as const };
  });
}
