import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getCurrentRoles } from "@/server/auth/currentRoles";
import { requireSession } from "@/server/auth/session";
import { archiveTestReservationAsCancelled } from "@/server/host/archiveTestReservation";
import { reservationArchiveBlockReason } from "@/server/host/reservationArchivePolicy";

export const dynamic = "force-dynamic";

async function hostAccess() {
  const { userId } = await requireSession();
  const roles = await getCurrentRoles(userId);
  requirePermission(roles, "host:reservations:checkin");
  const mayManage = roles.some((role) => ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"].includes(role));
  if (!mayManage) throw Object.assign(new Error("Forbidden"), { status: 403 });
  const profile = roles.includes("SUPERADMIN") ? null : await prisma.restaurantHostProfile.findUnique({
    where: { userId }, select: { venueId: true },
  });
  if (!roles.includes("SUPERADMIN") && !profile?.venueId) throw Object.assign(new Error("Host venue could not be verified"), { status: 403 });
  return { userId, roles, venueId: profile?.venueId ?? null };
}

function errorResponse(error: unknown) {
  const err = error as { message?: string; status?: number };
  return NextResponse.json({ ok: false, error: err.message ?? "Host reservation review failed" }, { status: err.status ?? 500 });
}

export async function GET(request: Request) {
  try {
    const access = await hostAccess();
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") ?? "").trim();
    if (query.length < 3 || query.length > 100) {
      return NextResponse.json({ ok: false, error: "Enter at least 3 characters to search reservations." }, { status: 400 });
    }
    const venueId = params.get("venueId");
    if (!access.roles.includes("SUPERADMIN") && venueId && venueId !== access.venueId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const venueFilter = access.roles.includes("SUPERADMIN")
      ? (venueId ? { venueId } : {})
      : { venueId: access.venueId! };
    const rows = await prisma.reservation.findMany({
      where: {
        ...venueFilter,
        OR: [
          { contactName: { contains: query, mode: "insensitive" } },
          { contactEmail: { contains: query, mode: "insensitive" } },
          { contactPhone: { contains: query } },
          { contactWhatsapp: { contains: query } },
          { confirmationCode: { contains: query, mode: "insensitive" } },
          { notes: { contains: query, mode: "insensitive" } },
          { specialRequests: { contains: query, mode: "insensitive" } },
          { sourceContext: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true, venueId: true, contactName: true, contactEmail: true, contactPhone: true,
        contactWhatsapp: true, confirmationCode: true, reservationDate: true, partySize: true,
        status: true, source: true, sourceContext: true, notes: true,
        actualRevenueCents: true,
        venue: { select: { name: true } },
        attributionSession: { select: {
          tableSession: { select: { openedInvuOrderId: true } },
          bindings: { select: { invuOrderId: true }, take: 1 },
        } },
        paymentIntent: { select: { id: true, status: true } },
      },
      orderBy: [{ reservationDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    });
    const data = rows.map((row) => {
      const boundOrderId = row.attributionSession?.tableSession?.openedInvuOrderId
        ?? row.attributionSession?.bindings[0]?.invuOrderId
        ?? null;
      const archiveBlockedReason = reservationArchiveBlockReason({
        status: row.status,
        actualRevenueCents: row.actualRevenueCents,
        boundInvuOrderId: boundOrderId,
        hasPaymentIntent: Boolean(row.paymentIntent),
      });
      return { ...row, archiveBlockedReason };
    });
    return NextResponse.json({ ok: true, data, limited: rows.length === 50 });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const access = await hostAccess();
    const body = await request.json();
    const reservationId = typeof body.reservationId === "string" ? body.reservationId : "";
    const reason = typeof body.reason === "string" ? body.reason : "";
    if (!reservationId || reason.trim().length < 8) {
      return NextResponse.json({ ok: false, error: "Choose a reservation and explain why it is test/demo data." }, { status: 400 });
    }
    const target = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { venueId: true } });
    if (!target) return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });
    if (!access.roles.includes("SUPERADMIN") && target.venueId !== access.venueId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const result = await archiveTestReservationAsCancelled({ reservationId, actorId: access.userId, reason });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) { return errorResponse(error); }
}
