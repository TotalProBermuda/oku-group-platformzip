import { NextResponse } from "next/server";
import { getHostQueue } from "@/server/host/hostService";
import { requireHostBookingAccess } from "@/server/auth/hostChatGuard";
import { prisma } from "@/lib/prisma";
import { parseQueueSelection } from "@/server/host/queueSelection";

export async function GET(request: Request) {
  try {
    const access = await requireHostBookingAccess();
    const params = new URL(request.url).searchParams;
    const selection = parseQueueSelection({ date: params.get("date"), reservationId: params.get("reservationId") });
    const linkedVenue = access.isSuperadmin && selection.reservationId
      ? await prisma.reservation.findUnique({ where: { id: selection.reservationId }, select: { venueId: true } })
      : null;
    const venueId = access.venueId ?? linkedVenue?.venueId ?? (await prisma.venue.findFirst({ select: { id: true } }))?.id;
    if (!venueId) return NextResponse.json({ ok: true, data: { reservations: [], waitlist: [], zones: [] } });
    const data = await getHostQueue(venueId, selection);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }
}
