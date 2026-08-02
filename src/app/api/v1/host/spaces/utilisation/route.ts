import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getVenueSpaceUtilisation } from "@/server/spaces/capacityService";

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
export async function GET() {
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

  let venueId: string | null = null;

  if (roles.includes("SUPERADMIN")) {
    // SUPERADMIN: fall back to first venue (admin/dev usage)
    const venue = await prisma.venue.findFirst({ select: { id: true } });
    venueId = venue?.id ?? null;
  } else {
    // Non-SUPERADMIN: MUST have a RestaurantHostProfile with a venueId
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

  const utilisation = await getVenueSpaceUtilisation(venueId);
  return NextResponse.json({ ok: true, data: utilisation });
}
