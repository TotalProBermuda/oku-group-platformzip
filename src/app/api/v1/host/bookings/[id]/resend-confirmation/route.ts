import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { getCurrentRoles } from "@/server/auth/currentRoles";
import { deliverReservationStateEmail } from "@/server/reservations/reservationNotificationService";
import type { RoleKey } from "@/types/roles";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  let roles: RoleKey[];
  try {
    const session = await requireSession();
    userId = session.userId;
    roles = await getCurrentRoles(userId);
    requirePermission(roles, "host:reservations:checkin");
  } catch (error) {
    const err = error as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }

  const { id } = await params;
  const reservation = await prisma.reservation.findUnique({
    where: { id }, select: { venueId: true },
  });
  if (!reservation) return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });

  if (!roles.includes("SUPERADMIN")) {
    const profile = await prisma.restaurantHostProfile.findUnique({ where: { userId }, select: { venueId: true } });
    if (!profile?.venueId || profile.venueId !== reservation.venueId) {
      return NextResponse.json({ ok: false, error: "Forbidden: reservation belongs to a different venue" }, { status: 403 });
    }
  }

  try {
    const result = await deliverReservationStateEmail(id, "CONFIRMATION", { force: true });
    if (!result.sent) {
      return NextResponse.json(
        { ok: false, error: result.reason ?? "Confirmation email was rejected by the email provider" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Confirmation email failed" },
      { status: 502 },
    );
  }
}
