import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getVenueSpaceUtilisation } from "@/server/spaces/capacityService";
import { findBlockingOccupancy } from "@/server/events/eventOccupancyService";
import { getCurrentRoles } from "@/server/auth/currentRoles";

/**
 * GET /api/v1/host/spaces/utilisation
 *
 * Returns per-space utilisation for the current service window using the
 * overlap-aware CapacityHold query.
 *
 * Authorization:
 *   - Requires host:reservations:checkin.
 *   - Non-SUPERADMIN callers MUST have a RestaurantHostProfile with a non-null
 *     venueId — callers without a profile are rejected with 403. SUPERADMIN
 *     bypasses profile-scoping and falls back to the first venue.
 */
export async function GET(req: NextRequest) {
  let userId: string;
  let roles: string[];
  try {
    const s = await requireSession();
    userId = s.userId;
    roles = await getCurrentRoles(userId);
    requirePermission(roles as any, "host:reservations:checkin");
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }

  let venueId: string | null = null;

  if (roles.includes("SUPERADMIN")) {
    // SUPERADMIN: fall back to first venue (admin/dev usage)
    const venue = await prisma.venue.findFirst({ select: { id: true } });
    venueId = venue?.id ?? null;
  } else {
    // Non-SUPERADMIN (RESTAURANT_HOST, RESTAURANT_SUPERVISOR, etc.): MUST have a
    // RestaurantHostProfile with a venueId. This is the venue-scoping security boundary —
    // do NOT infer a venue from findFirst() or any other fallback.
    // An admin must provision/associate the profile before the supervisor can use
    // venue-scoped endpoints.
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
    venueId = profile.venueId;
  }

  if (!venueId) return NextResponse.json({ ok: true, data: [] });

  const { searchParams } = new URL(req.url);
  const startValue = searchParams.get("startAt");
  const endValue = searchParams.get("endAt");
  const reservationId = searchParams.get("reservationId") ?? undefined;
  const startAt = startValue ? new Date(startValue) : null;
  const endAt = endValue ? new Date(endValue) : null;
  if ((startValue || endValue) && (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt)) {
    return NextResponse.json({ ok: false, error: "A valid startAt/endAt window is required" }, { status: 400 });
  }
  if (startAt && endAt && endAt.getTime() - startAt.getTime() > 12 * 60 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: "Availability windows cannot exceed 12 hours" }, { status: 400 });
  }

  const utilisation = await getVenueSpaceUtilisation(
    venueId,
    startAt && endAt ? { startAt, endAt, excludeReservationId: reservationId } : undefined,
  );
  if (!startAt || !endAt) return NextResponse.json({ ok: true, data: utilisation });

  const data = await Promise.all(utilisation.map(async (space) => {
    const conflict = await findBlockingOccupancy(prisma, { venueId: venueId!, spaceId: space.id, startAt, endAt });
    return { ...space, eventConflict: conflict?.card ?? null };
  }));
  return NextResponse.json({ ok: true, data, startAt: startAt.toISOString(), endAt: endAt.toISOString() });
}
