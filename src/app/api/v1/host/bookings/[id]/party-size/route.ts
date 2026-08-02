import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

// PATCH /api/v1/host/bookings/[id]/party-size
// Updates the party size when guests join or leave after arrival.

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Operational reservation control — restaurant hosts / admins only. Also
  // closes a pre-existing hole where any logged-in user could change any
  // reservation's party size.
  let userId: string;
  try {
    const s = await requireSession();
    userId = s.userId;
    requirePermission(s.roles, "host:reservations:checkin");
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }
  const { partySize, notes } = await req.json();

  const size = parseInt(partySize, 10);
  if (!size || size < 1 || size > 100) {
    return NextResponse.json({ ok: false, error: "partySize must be between 1 and 100" }, { status: 400 });
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, partySize: true },
  });

  if (!reservation) {
    return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });
  }

  const prevSize = reservation.partySize;

  await prisma.reservation.update({
    where: { id: params.id },
    data: { partySize: size },
  });

  // Log the party size change
  await prisma.reservationStatusLog.create({
    data: {
      reservationId: params.id,
      fromStatus: reservation.status as any,
      toStatus: reservation.status as any,
      changedByUserId: userId,
      changedByLabel: "PARTY_SIZE_CHANGE",
      notes: `Party size updated: ${prevSize} → ${size}${notes ? ` (${notes})` : ""}`,
    },
  });

  return NextResponse.json({ ok: true, prevSize, newSize: size });
}
