import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

// POST /api/v1/host/bookings/[id]/comp-drink
// Logs a complimentary beverage offered to waiting guests.
// Stored as a ReservationStatusLog so no schema change is needed.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Operational reservation control — restaurant hosts / admins only. Also
  // closes a pre-existing hole where any logged-in user could log a comp drink
  // against any reservation.
  let userId: string;
  try {
    const s = await requireSession();
    userId = s.userId;
    requirePermission(s.roles, "host:reservations:checkin");
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }
  const { drinkType } = await req.json(); // "ALCOHOLIC" | "NON_ALCOHOLIC"

  const allowed = ["ALCOHOLIC", "NON_ALCOHOLIC"];
  if (!allowed.includes(drinkType)) {
    return NextResponse.json({ ok: false, error: "Invalid drinkType" }, { status: 400 });
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  });

  if (!reservation) {
    return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });
  }

  const label = drinkType === "ALCOHOLIC" ? "🥂 Alcoholic beverage" : "🍹 Non-alcoholic beverage";

  await prisma.reservationStatusLog.create({
    data: {
      reservationId: params.id,
      fromStatus: reservation.status as any,
      toStatus: reservation.status as any,
      changedByUserId: userId,
      changedByLabel: "COMP_DRINK",
      notes: `Complimentary ${label} offered to waiting guests`,
    },
  });

  return NextResponse.json({ ok: true, drinkType, label });
}
