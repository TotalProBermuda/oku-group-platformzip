import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { assignSpace, CapacityExceededError, SpaceAssignmentError, getAvailableCovers } from "@/server/spaces/capacityService";
import { prisma } from "@/lib/prisma";

const DEFAULT_DURATION_MINUTES = 120;

/**
 * PATCH /api/v1/host/bookings/[id]/assign-space
 *
 * Two-phase protocol for safe space assignment:
 *
 * Phase 1 — preflight (pure read, no writes):
 *   Body: { spaceId }
 *   If available covers ≥ partySize → proceeds to assignment immediately.
 *   If insufficient → returns HTTP 409 { needsConfirmation: true, warning }.
 *   Nothing is written. The host must explicitly confirm.
 *
 * Phase 2 — confirmed write:
 *   Body: { spaceId, confirmOverride: true }
 *   `assignSpace` runs everything in a single advisory-locked transaction:
 *   old-hold release, capacity recheck, FK update, new hold creation.
 *   If a concurrent assignment filled the space since the preflight, the
 *   in-transaction recheck still catches it and throws CapacityExceededError
 *   (→ 409) with no partial mutation.
 *
 * Authorization:
 *   - Requires host:reservations:checkin.
 *   - Non-SUPERADMIN callers MUST have a RestaurantHostProfile with venueId.
 *   - Reservation and space MUST belong to the same venue (all callers,
 *     including SUPERADMIN).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  let roles: string[];
  try {
    const s = await requireSession();
    userId = s.userId;
    roles = s.roles;
    requirePermission(roles as any, "host:reservations:checkin");
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }

  const { id: reservationId } = await params;
  const body = await req.json();
  const { spaceId, confirmOverride = false } = body as { spaceId?: string; confirmOverride?: boolean };

  if (!spaceId) {
    return NextResponse.json({ ok: false, error: "spaceId is required" }, { status: 400 });
  }

  // ── Authorization: resolve host venue ────────────────────────────────────
  let hostVenueId: string | null = null;

  if (roles.includes("SUPERADMIN")) {
    // SUPERADMIN bypasses profile scoping but venue equality is still enforced below
    hostVenueId = null;
  } else {
    const profile = await prisma.restaurantHostProfile.findUnique({
      where: { userId },
      select: { venueId: true },
    });
    if (!profile || !profile.venueId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: no host profile associated with your account" },
        { status: 403 }
      );
    }
    hostVenueId = profile.venueId;
  }

  // Fetch reservation and space in parallel
  const [reservation, space] = await Promise.all([
    prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, venueId: true, partySize: true, assignedSpaceId: true, reservationDate: true, durationMinutes: true },
    }),
    prisma.restaurantSpace.findUnique({
      where: { id: spaceId },
      select: { id: true, name: true, capacity: true, venueId: true, isActive: true },
    }),
  ]);

  if (!reservation) return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });
  if (!space)       return NextResponse.json({ ok: false, error: "Space not found" }, { status: 404 });
  if (!space.isActive) return NextResponse.json({ ok: false, error: "Space is not active" }, { status: 400 });

  // ── Venue equality: enforced for every caller including SUPERADMIN ────────
  if (reservation.venueId !== space.venueId) {
    return NextResponse.json(
      { ok: false, error: "Forbidden: reservation and space must belong to the same venue" },
      { status: 403 }
    );
  }

  // ── Non-SUPERADMIN: reservation must also belong to the host's own venue ──
  if (hostVenueId !== null && reservation.venueId !== hostVenueId) {
    return NextResponse.json(
      { ok: false, error: "Forbidden: reservation belongs to a different venue" },
      { status: 403 }
    );
  }

  // ── Phase 1: Preflight — pure read, no writes ─────────────────────────────
  // Only run the read-check when confirmOverride is false. If the check shows
  // insufficient capacity we return a 409 without touching the database.
  // Note: assignSpace will re-verify atomically inside its transaction, so
  // this preflight is purely for the UX warning loop.
  if (!confirmOverride) {
    const startAt = new Date(reservation.reservationDate);
    const endAt = new Date(
      startAt.getTime() + (reservation.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000
    );
    const { available, capacity } = await getAvailableCovers(spaceId, startAt, endAt, reservationId);
    if (reservation.partySize > available) {
      return NextResponse.json(
        {
          ok: false,
          needsConfirmation: true,
          warning: { overCapacity: true, available, capacity, partySize: reservation.partySize },
        },
        { status: 409 }
      );
    }
    // Sufficient capacity in the preflight — fall through to assignment.
    // assignSpace will re-verify atomically; if a concurrent hold was just
    // written it will re-surface the 409 below via CapacityExceededError.
  }

  // ── Phase 2: Atomic assignment ────────────────────────────────────────────
  // assignSpace wraps everything (advisory lock, hold release, capacity check,
  // FK update, hold creation) in a single transaction. Throws
  // CapacityExceededError if capacity is exhausted between preflight and write.
  try {
    const { overCapacity, available } = await assignSpace({
      reservationId,
      newSpaceId: spaceId,
      actorId: userId,
      confirmOverride,
    });

    const updated = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        assignedSpaceId: true,
        requestedSpaceId: true,
        assignedSpace: { select: { id: true, name: true, capacity: true } },
        requestedSpace: { select: { id: true, name: true, capacity: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      data: updated,
      warning: overCapacity ? { overCapacity: true, available, capacity: space.capacity } : null,
    });
  } catch (e) {
    if (e instanceof CapacityExceededError) {
      return NextResponse.json(
        {
          ok: false,
          needsConfirmation: true,
          warning: { overCapacity: true, available: e.available, capacity: e.capacity, partySize: e.partySize },
        },
        { status: 409 }
      );
    }
    if (e instanceof SpaceAssignmentError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    console.error("[PATCH /api/v1/host/bookings/[id]/assign-space]", e);
    return NextResponse.json({ ok: false, error: "Failed to assign space" }, { status: 500 });
  }
}
