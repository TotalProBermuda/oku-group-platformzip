import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { transitionStatus } from "@/server/host/hostService";
import { prisma } from "@/lib/prisma";
import { getCurrentRoles } from "@/server/auth/currentRoles";
import type { ReservationStatus } from "@prisma/client";
import type { RoleKey } from "@/types/roles";
import { EventOccupancyConflictError } from "@/server/events/eventOccupancyService";

const VALID_STATUSES: ReservationStatus[] = [
  "PENDING", "PENDING_APPROVAL", "CONFIRMED", "WAITLISTED", "ACKNOWLEDGED",
  "ARRIVED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Status transitions are operational reservation control: only restaurant
  // hosts / admins (host:reservations:checkin) may change a booking's status.
  // This also closes a pre-existing hole where ANY logged-in user could mutate
  // ANY reservation's status. Referral-only roles (STREETSIDE_HOST) are
  // read-only here.
  let userId: string;
  let roles: RoleKey[];
  try {
    const s = await requireSession();
    userId = s.userId;
    // Role claims inside a browser JWT can outlive a role correction. Final
    // host-control authorization must use current database assignments.
    roles = await getCurrentRoles(userId);
    requirePermission(roles, "host:reservations:checkin");
  } catch (e) {
    const err = e as { message?: string; status?: number };
    const status = err.status ?? 503;
    return NextResponse.json(
      { ok: false, error: status === 503 ? "Authorization state could not be verified" : err.message ?? "Unauthorized" },
      { status },
    );
  }
  const { id } = await params;

  // Restaurant hosts and supervisors may approve only their own venue's
  // requests. SUPERADMIN retains cross-venue operational access.
  if (!roles!.includes("SUPERADMIN")) {
    const [profile, target] = await Promise.all([
      prisma.restaurantHostProfile.findUnique({ where: { userId }, select: { venueId: true } }),
      prisma.reservation.findUnique({ where: { id }, select: { venueId: true } }),
    ]);
    if (!target) return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });
    if (!profile?.venueId || profile.venueId !== target.venueId) {
      return NextResponse.json({ ok: false, error: "Forbidden: reservation belongs to a different venue" }, { status: 403 });
    }
  }
  const body = await req.json();

  const { status, tableLabel, assignedSpaceId, confirmedReservationDate, lossReason, lossReasonNotes, internalNotes, arrivedHeadcount } = body;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Sanity-check arrivedHeadcount: must be a positive integer if provided.
  // Bigger-than-partySize is allowed (host might add a +1 the booking didn't
  // know about) — that's a UX nuance, not a data integrity violation.
  let parsedHeadcount: number | undefined;
  if (arrivedHeadcount !== undefined && arrivedHeadcount !== null) {
    const n = Number(arrivedHeadcount);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "arrivedHeadcount must be a positive integer" }, { status: 400 });
    }
    parsedHeadcount = n;
  }

  try {
    const reservation = await transitionStatus(id, status as ReservationStatus, userId, {
      tableLabel,
      assignedSpaceId,
      reservationDate: confirmedReservationDate,
      lossReason,
      lossReasonNotes,
      internalNotes,
      arrivedHeadcount: parsedHeadcount,
    });
    return NextResponse.json({ ok: true, data: reservation });
  } catch (e: unknown) {
    if (e instanceof EventOccupancyConflictError) {
      return NextResponse.json(
        { ok: false, code: "EVENT_UNAVAILABLE", error: e.card.message, eventConflict: e.card },
        { status: 409 },
      );
    }
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
