import { NextResponse } from "next/server";
import { getHostQueue } from "@/server/host/hostService";
import { requireHostBookingAccess } from "@/server/auth/hostChatGuard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const access = await requireHostBookingAccess();
    const venueId = access.venueId ?? (await prisma.venue.findFirst({ select: { id: true } }))?.id;
    if (!venueId) return NextResponse.json({ ok: true, data: { reservations: [], waitlist: [], zones: [] } });
    const data = await getHostQueue(venueId);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }
}
