/**
 * Space-aware capacity service (Task #181)
 *
 * Capacity is computed using OVERLAPPING time windows — a 7:00–9:00 and an
 * 8:00–10:00 reservation both hold covers during 8:00–9:00. Exact-match
 * logic would allow overbooking.
 *
 * Deterministic hold idempotency key convention:
 *   capacity_hold:{holdId}:created
 *   capacity_hold:{holdId}:released
 */

import { prisma } from "@/lib/prisma";
import type { CapacityHoldStatus } from "@prisma/client";
import { emitLedgerEvent } from "@/server/services/ledger/ledgerEventService";
import { assertNoBlockingOccupancy } from "@/server/events/eventOccupancyService";
import { buildReservationUpdatedSubject } from "@/server/reservations/confirmationEmail";

export const DEFAULT_DURATION_MINUTES = 120;

/**
 * Expiry sentinel for CONFIRMED reservation holds.
 *
 * A CONFIRMED hold must remain ACTIVE for the reservation's full active
 * lifecycle (CONFIRMED → ARRIVED → SEATED → COMPLETED). It is released only
 * when the reservation reaches a terminal state (CANCELLED, NO_SHOW,
 * COMPLETED) via `releaseCapacityHolds` or `transitionStatus`.
 *
 * Setting expiresAt far in the future means:
 *   - The time-based `expireStaleHolds` sweep never touches confirmed holds.
 *   - The `expiresAt > now` filter in availability queries always counts them.
 *
 * Contrast with PENDING_APPROVAL holds which use `endAt + 30 min` so they
 * time out automatically if the host never approves.
 */
// Year 2099 — well within PostgreSQL's timestamp range, effectively "never"
// for a restaurant reservation system. Confirmed holds are released by explicit
// terminal-state transitions long before this date is reached.
export const FAR_FUTURE_EXPIRY = new Date("2099-12-31T23:59:59.999Z");

/** Compute covers currently held in a space for an overlapping window. */
export async function getHeldCovers(
  spaceId: string,
  startAt: Date,
  endAt: Date,
  excludeReservationId?: string
): Promise<number> {
  // Two windows [A.start, A.end) and [B.start, B.end) overlap iff
  //   A.start < B.end AND A.end > B.start
  //
  // The expiresAt filter makes this query independent of sweep timing: a hold
  // whose expiry window has passed is treated as logically expired even if the
  // background sweep hasn't yet transitioned it to EXPIRED. This prevents
  // double-counting between adjacent dinner services and also protects future
  // reservations: a hold for next week has expiresAt >> now, so it is always
  // counted correctly until the reservation window has passed.
  const now = new Date();
  const holds = await prisma.capacityHold.findMany({
    where: {
      spaceId,
      status: "ACTIVE",
      expiresAt: { gt: now },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeReservationId ? { reservationId: { not: excludeReservationId } } : {}),
    },
    select: { partySize: true },
  });
  return holds.reduce((sum, h) => sum + h.partySize, 0);
}

/** Available covers in a space for the given window. */
export async function getAvailableCovers(
  spaceId: string,
  startAt: Date,
  endAt: Date,
  excludeReservationId?: string
): Promise<{ available: number; held: number; capacity: number }> {
  const space = await prisma.restaurantSpace.findUnique({
    where: { id: spaceId },
    select: { capacity: true },
  });
  if (!space) throw new Error(`RestaurantSpace ${spaceId} not found`);
  const held = await getHeldCovers(spaceId, startAt, endAt, excludeReservationId);
  return { available: space.capacity - held, held, capacity: space.capacity };
}

/** Current utilisation for a space within the next DEFAULT_DURATION_MINUTES window. */
export async function getCurrentUtilisation(spaceId: string): Promise<{
  held: number;
  capacity: number;
  available: number;
  utilPct: number;
}> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
  const { held, capacity, available } = await getAvailableCovers(spaceId, now, windowEnd);
  return { held, capacity, available, utilPct: capacity > 0 ? Math.round((held / capacity) * 100) : 0 };
}

/** Fetch per-space utilisation for the host board. */
export async function getVenueSpaceUtilisation(
  venueId: string,
  window?: { startAt: Date; endAt: Date; excludeReservationId?: string },
): Promise<
  Array<{
    id: string;
    name: string;
    capacity: number;
    held: number;
    available: number;
    utilPct: number;
    isActive: boolean;
    reservable: boolean;
  }>
> {
  const spaces = await prisma.restaurantSpace.findMany({
    where: { venueId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, capacity: true, isActive: true, reservable: true },
  });
  const now = window?.startAt ?? new Date();
  const windowEnd = window?.endAt ?? new Date(now.getTime() + DEFAULT_DURATION_MINUTES * 60_000);

  return Promise.all(
    spaces.map(async (s) => {
      const held = await getHeldCovers(s.id, now, windowEnd, window?.excludeReservationId);
      const available = s.capacity - held;
      return {
        ...s,
        held,
        available,
        utilPct: s.capacity > 0 ? Math.round((held / s.capacity) * 100) : 0,
      };
    })
  );
}

/**
 * Thrown when a space has insufficient capacity and the caller has not
 * provided an explicit `confirmOverride`. Nothing is written to the database
 * when this is thrown — the transaction rolls back completely.
 */
export class CapacityExceededError extends Error {
  constructor(
    public readonly available: number,
    public readonly capacity: number,
    public readonly partySize: number
  ) {
    super(`Capacity exceeded: ${available} available, ${partySize} requested`);
    this.name = "CapacityExceededError";
  }
}

/**
 * Create an ACTIVE capacity hold for a reservation.
 *
 * Uses a PostgreSQL advisory lock (`pg_advisory_xact_lock`) on the spaceId so
 * concurrent calls for the same space are serialized at the DB level — no two
 * transactions can both pass the availability check and write a hold
 * simultaneously, preventing write-skew overbooking.
 *
 * `confirmOverride`: when false (default) and capacity is insufficient, the
 * function throws `CapacityExceededError` and nothing is written. Pass true
 * only after the host has explicitly confirmed the override.
 */
export async function createCapacityHold(opts: {
  reservationId: string;
  spaceId: string;
  startAt: Date;
  endAt: Date;
  partySize: number;
  confirmOverride?: boolean;
}): Promise<{ holdId: string; overCapacity: boolean; available: number } | null> {
  const { reservationId, spaceId, startAt, endAt, partySize, confirmOverride = false } = opts;

  let available = 0;
  let capacity = 0;
  let overCapacity = false;

  const hold = await prisma.$transaction(async (tx) => {
    // Advisory locks in deterministic order — reservation first (category 1),
    // then space (category 2). Matches the order used in assignSpace, so no
    // deadlock is possible between concurrent createCapacityHold and assignSpace
    // calls for the same reservation/space pair. Prevents two concurrent calls
    // for the same reservation but different spaces from both creating active holds.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${reservationId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${spaceId}))`;

    const space = await tx.restaurantSpace.findUnique({
      where: { id: spaceId },
      select: { capacity: true },
    });
    capacity = space?.capacity ?? 0;

    const existing = await tx.capacityHold.findMany({
      where: {
        spaceId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        reservationId: { not: reservationId },
      },
      select: { partySize: true },
    });
    const held = existing.reduce((s, h) => s + h.partySize, 0);
    available = capacity - held;
    overCapacity = partySize > available;

    if (overCapacity && !confirmOverride) {
      throw new CapacityExceededError(available, capacity, partySize);
    }

    return tx.capacityHold.upsert({
      where: { spaceId_reservationId: { spaceId, reservationId } },
      create: {
        spaceId,
        reservationId,
        startAt,
        endAt,
        partySize,
        status: "ACTIVE",
        // Confirmed holds are never expired by the time-based sweep;
        // they are released only by terminal-state transitions (cancel/no-show/complete).
        expiresAt: FAR_FUTURE_EXPIRY,
      },
      update: {
        startAt,
        endAt,
        partySize,
        status: "ACTIVE",
        expiresAt: FAR_FUTURE_EXPIRY,
      },
    });
  });

  // Ledger events fire outside the transaction — best-effort, non-blocking
  emitLedgerEvent({
    eventType: "CAPACITY_HOLD_CREATED",
    source: { system: "capacity_service" },
    confidenceClass: "PARTNER_REPORTED_EVENT",
    idempotencyKey: `capacity_hold:${hold.id}:created`,
    capacityHoldId: hold.id,
    reservationId,
    payload: { spaceId, partySize, startAt: startAt.toISOString(), endAt: endAt.toISOString(), capacity, overCapacity },
  }).catch((e) => console.warn("[capacityService] CAPACITY_HOLD_CREATED event failed", { err: e }));

  if (overCapacity) {
    emitLedgerEvent({
      eventType: "CAPACITY_WARNING_SHOWN",
      source: { system: "capacity_service" },
      confidenceClass: "PARTNER_REPORTED_EVENT",
      idempotencyKey: `capacity_hold:${hold.id}:warning`,
      capacityHoldId: hold.id,
      reservationId,
      payload: { spaceId, partySize, available, capacity },
    }).catch((e) => console.warn("[capacityService] CAPACITY_WARNING_SHOWN event failed", { err: e }));
  }

  return { holdId: hold.id, overCapacity, available };
}

/**
 * Emit CAPACITY_OVERRIDDEN_BY_HOST when a host proceeds despite a warning.
 * Should be called from the host space-assignment handler when overCapacity=true.
 */
export async function recordCapacityOverride(holdId: string, reservationId: string, actorId: string): Promise<void> {
  try {
    await emitLedgerEvent({
      eventType: "CAPACITY_OVERRIDDEN_BY_HOST",
      source: { system: "host_ops" },
      confidenceClass: "PARTNER_REPORTED_EVENT",
      idempotencyKey: `capacity_hold:${holdId}:override:${actorId}`,
      capacityHoldId: holdId,
      reservationId,
      payload: { actorId },
    });
  } catch (e) {
    console.warn("[capacityService] CAPACITY_OVERRIDDEN_BY_HOST ledger event failed (non-blocking)", { err: e });
  }
}

/**
 * Release holds for a reservation when it is cancelled, no-showed, or completed.
 * Emits CAPACITY_HOLD_RELEASED for each hold transitioned.
 */
export async function releaseCapacityHolds(
  reservationId: string,
  toStatus: "RELEASED" | "CANCELLED"
): Promise<void> {
  const holds = await prisma.capacityHold.findMany({
    where: { reservationId, status: "ACTIVE" },
    select: { id: true },
  });

  for (const hold of holds) {
    try {
      await prisma.capacityHold.update({
        where: { id: hold.id },
        data: { status: toStatus },
      });
      await emitLedgerEvent({
        eventType: "CAPACITY_HOLD_RELEASED",
        source: { system: "capacity_service" },
        confidenceClass: "PARTNER_REPORTED_EVENT",
        idempotencyKey: `capacity_hold:${hold.id}:released`,
        capacityHoldId: hold.id,
        reservationId,
        payload: { toStatus },
      });
    } catch (e) {
      console.warn("[capacityService] releaseCapacityHolds failed for hold", { holdId: hold.id, err: e });
    }
  }
}

/**
 * Thrown when `assignSpace` is called on a terminal or otherwise ineligible
 * reservation, or when the target space is not reservable.
 */
export class SpaceAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpaceAssignmentError";
  }
}

/** Reservation statuses that permanently close a reservation. */
const TERMINAL_STATUSES = ["NO_SHOW", "CANCELLED", "COMPLETED"] as const;

/**
 * Assign a space to a reservation atomically.
 *
 * ALL mutations — old-hold release, FK update, capacity check, new-hold
 * creation — happen inside a single transaction protected by TWO PostgreSQL
 * advisory locks acquired in a deterministic order:
 *   1. Reservation lock — serializes concurrent assignments to the SAME
 *      reservation from different spaces, preventing orphan holds.
 *   2. Space lock     — serializes concurrent assignments to the SAME space,
 *      preventing write-skew overbooking.
 *
 * Invariants enforced inside the transaction:
 *   - Reservation must not be in a terminal status.
 *   - Target space must have `isActive = true` and `reservable = true`.
 *   - ALL existing active holds for the reservation are released (not just the
 *     previously assigned one), preventing orphan holds.
 *   - Capacity is rechecked under the advisory lock.
 *
 * Throws `CapacityExceededError` when over-capacity and `confirmOverride` is
 * false (nothing written). Throws `SpaceAssignmentError` for invariant
 * violations. Attribution is NEVER touched by space assignment.
 */
export async function assignSpace(opts: {
  reservationId: string;
  newSpaceId: string;
  actorId: string;
  confirmOverride?: boolean;
  capacityOverrideReason?: string;
  guestMessage?: string;
}): Promise<{ overCapacity: boolean; available: number; moved: boolean; communicationId: string | null }> {
  const { reservationId, newSpaceId, actorId, confirmOverride = false, capacityOverrideReason, guestMessage } = opts;

  if (confirmOverride && (capacityOverrideReason?.trim().length ?? 0) < 8) {
    throw new SpaceAssignmentError("A capacity override reason of at least 8 characters is required");
  }

  let overCapacity = false;
  let available = 0;
  let capacity = 0;
  let partySize = 0;
  let holdId: string | null = null;
  let releasedHoldIds: string[] = [];
  let moved = false;
  let communicationId: string | null = null;

  await prisma.$transaction(async (tx) => {
    // ── Advisory locks in deterministic order ─────────────────────────────
    // Acquire reservation lock first (category 1), then space lock (category 2).
    // All callers follow this order, so no deadlock is possible.
    // pg_advisory_xact_lock(int4, int4): first arg = category, second = key.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${reservationId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${newSpaceId}))`;

    // ── Re-read reservation under lock ─────────────────────────────────────
    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: {
        partySize: true, assignedSpaceId: true, reservationDate: true, durationMinutes: true,
        status: true, venueId: true, contactEmail: true, confirmationCode: true,
        venue: { select: { name: true } },
        assignedSpace: { select: { name: true } },
      },
    });

    // Invariant: reservation must not be terminal
    if ((TERMINAL_STATUSES as ReadonlyArray<string>).includes(reservation.status)) {
      throw new SpaceAssignmentError(
        `Cannot assign space to a ${reservation.status} reservation`
      );
    }
    moved = reservation.status === "CONFIRMED" && Boolean(reservation.assignedSpaceId) && reservation.assignedSpaceId !== newSpaceId;
    if (moved && (guestMessage?.trim().length ?? 0) < 8) {
      throw new SpaceAssignmentError("A guest-facing move message of at least 8 characters is required");
    }

    // ── Re-read space under lock ────────────────────────────────────────────
    const space = await tx.restaurantSpace.findUnique({
      where: { id: newSpaceId },
      select: { capacity: true, isActive: true, reservable: true, name: true },
    });

    // Invariant: space must be active and reservable
    if (!space) {
      throw new SpaceAssignmentError("Space not found");
    }
    if (!space.isActive || !space.reservable) {
      throw new SpaceAssignmentError(
        "Space is not available for assignment (inactive or non-reservable)"
      );
    }

    const startAt = new Date(reservation.reservationDate);
    const endAt = new Date(
      startAt.getTime() + (reservation.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000
    );

    // Host assignment is a write path too: it must obey the same event/buyout
    // rules as public bookings, even when a manager is moving an existing guest.
    await assertNoBlockingOccupancy(tx, {
      venueId: reservation.venueId,
      spaceId: newSpaceId,
      startAt,
      endAt,
    });

    // ── Capacity check under space advisory lock ────────────────────────────
    capacity = space.capacity;
    partySize = reservation.partySize;
    const competingHolds = await tx.capacityHold.findMany({
      where: {
        spaceId: newSpaceId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        reservationId: { not: reservationId },
      },
      select: { partySize: true },
    });
    const held = competingHolds.reduce((s, h) => s + h.partySize, 0);
    available = capacity - held;
    overCapacity = reservation.partySize > available;

    if (overCapacity && !confirmOverride) {
      throw new CapacityExceededError(available, capacity, reservation.partySize);
    }

    // ── Release ALL active holds for this reservation ─────────────────────
    // Releasing ALL (not just the previously assigned space) prevents orphan
    // holds that could arise from a prior interrupted assignment. Done under
    // the reservation advisory lock, so no concurrent request can create a
    // new hold between now and the new upsert below.
    const toRelease = await tx.capacityHold.findMany({
      where: { reservationId, status: "ACTIVE" },
      select: { id: true },
    });
    releasedHoldIds = toRelease.map((h) => h.id);
    if (releasedHoldIds.length > 0) {
      await tx.capacityHold.updateMany({
        where: { id: { in: releasedHoldIds } },
        data: { status: "RELEASED" },
      });
    }

    // ── Update reservation space FK ────────────────────────────────────────
    await tx.reservation.update({
      where: { id: reservationId },
      data: { assignedSpaceId: newSpaceId },
    });

    if (moved) {
      const trimmedMessage = guestMessage!.trim();
      await tx.reservationStatusLog.create({
        data: {
          reservationId,
          fromStatus: reservation.status,
          toStatus: reservation.status,
          changedByUserId: actorId,
          notes: `Dining section moved from ${reservation.assignedSpace?.name ?? "unassigned"} to ${space.name}. Guest notification queued: ${trimmedMessage}`,
        },
      });
      const communication = await tx.reservationCommunication.create({
        data: {
          reservationId,
          type: "EMAIL",
          templateKey: "RESERVATION_UPDATED",
          recipient: reservation.contactEmail,
          subject: buildReservationUpdatedSubject({
            venueName: reservation.venue.name,
            confirmationCode: reservation.confirmationCode,
          }),
          bodySnapshot: trimmedMessage,
          status: "PENDING",
        },
        select: { id: true },
      });
      communicationId = communication.id;
    }

    // ── Create / refresh hold for new space ───────────────────────────────
    const hold = await tx.capacityHold.upsert({
      where: { spaceId_reservationId: { spaceId: newSpaceId, reservationId } },
      create: {
        spaceId: newSpaceId,
        reservationId,
        startAt,
        endAt,
        partySize: reservation.partySize,
        status: "ACTIVE",
        // Confirmed holds are not time-expired — released by terminal transitions.
        expiresAt: FAR_FUTURE_EXPIRY,
      },
      update: {
        startAt,
        endAt,
        partySize: reservation.partySize,
        status: "ACTIVE",
        expiresAt: FAR_FUTURE_EXPIRY,
      },
    });
    holdId = hold.id;
  }, { timeout: 10_000 });

  // ── Ledger events — outside the transaction, best-effort ─────────────────
  for (const oldId of releasedHoldIds) {
    emitLedgerEvent({
      eventType: "CAPACITY_HOLD_RELEASED",
      source: { system: "capacity_service" },
      confidenceClass: "PARTNER_REPORTED_EVENT",
      idempotencyKey: `capacity_hold:${oldId}:released`,
      capacityHoldId: oldId,
      reservationId,
      payload: { toStatus: "RELEASED" },
    }).catch((e) => console.warn("[capacityService] CAPACITY_HOLD_RELEASED event failed", { holdId: oldId, err: e }));
  }

  if (holdId) {
    emitLedgerEvent({
      eventType: "CAPACITY_HOLD_CREATED",
      source: { system: "capacity_service" },
      confidenceClass: "PARTNER_REPORTED_EVENT",
      idempotencyKey: `capacity_hold:${holdId}:created`,
      capacityHoldId: holdId,
      reservationId,
      payload: { spaceId: newSpaceId, available, capacity, overCapacity },
    }).catch((e) => console.warn("[capacityService] CAPACITY_HOLD_CREATED event failed", { err: e }));

    if (overCapacity) {
      // Warning shown — always emit before the override event so the audit trail
      // is complete: CAPACITY_WARNING_SHOWN → CAPACITY_OVERRIDDEN_BY_HOST.
      emitLedgerEvent({
        eventType: "CAPACITY_WARNING_SHOWN",
        source: { system: "capacity_service" },
        confidenceClass: "PARTNER_REPORTED_EVENT",
        idempotencyKey: `capacity_hold:${holdId}:warning`,
        capacityHoldId: holdId,
        reservationId,
        payload: { spaceId: newSpaceId, partySize, available, capacity },
      }).catch((e) => console.warn("[capacityService] CAPACITY_WARNING_SHOWN event failed (assignSpace)", { err: e }));

      // Override accepted: emit CAPACITY_OVERRIDDEN_BY_HOST after tx commits
      emitLedgerEvent({
        eventType: "CAPACITY_OVERRIDDEN_BY_HOST",
        source: { system: "host_ops" },
        confidenceClass: "PARTNER_REPORTED_EVENT",
        idempotencyKey: `capacity_hold:${holdId}:override:${actorId}`,
        capacityHoldId: holdId,
        reservationId,
        payload: { actorId, reason: capacityOverrideReason!.trim() },
      }).catch((e) => console.warn("[capacityService] CAPACITY_OVERRIDDEN_BY_HOST event failed", { err: e }));
    }
  }

  return { overCapacity, available, moved, communicationId };
}

/**
 * Expire holds whose expiresAt has passed without reaching a terminal status.
 * Called by a scheduled job.
 *
 * Lifecycle contract:
 *   - Holds created under the FAR_FUTURE_EXPIRY invariant (confirmed reservations
 *     after the #200 sprint) will never appear here — their expiresAt is ~2099.
 *     They are released by terminal-state transitions (cancel/no-show/complete).
 *   - Legacy holds (expiresAt = endAt + 30 min) created before the #200 sprint
 *     are correctly swept once their window passes. Sweeping them is safe because
 *     by that time the dinner service has ended and the space is naturally free.
 *   - No reservation-status filter is applied: the expiresAt timestamp alone
 *     governs the lifecycle. Adding a status exclusion would leave legacy holds
 *     permanently ACTIVE, invisible to availability queries (expiresAt > now
 *     already filters them) but unable to be reclaimed, breaking upsert and
 *     creating stale operational data.
 */
export async function expireStaleHolds(): Promise<number> {
  const now = new Date();
  const stale = await prisma.capacityHold.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lt: now },
    },
    select: { id: true, reservationId: true },
  });

  let count = 0;
  for (const hold of stale) {
    try {
      // Guard with status: "ACTIVE" so a hold released or reassigned between
      // the initial findMany and this update is not wrongly flipped to EXPIRED.
      // updateMany returns { count: 0 } when the hold was already transitioned,
      // in which case we skip the ledger event entirely.
      const { count: updated } = await prisma.capacityHold.updateMany({
        where: { id: hold.id, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
      if (updated === 0) continue; // already released/expired — skip
      await emitLedgerEvent({
        eventType: "CAPACITY_HOLD_RELEASED",
        source: { system: "capacity_expiry_job" },
        confidenceClass: "PARTNER_REPORTED_EVENT",
        idempotencyKey: `capacity_hold:${hold.id}:expired`,
        capacityHoldId: hold.id,
        reservationId: hold.reservationId,
        payload: { toStatus: "EXPIRED" },
      });
      count++;
    } catch (e) {
      console.warn("[capacityService] expireStaleHolds failed for hold", { holdId: hold.id, err: e });
    }
  }
  return count;
}
