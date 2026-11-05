import { NextRequest, NextResponse } from "next/server";
import { getHostApiErrorDetails, isUniqueConstraintError } from "@/app/api/v1/host/errorDetails";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { getEffectiveScanConfig } from "@/server/streetside/getScanConfig";
import { ticketGiftBagEntitlement } from "@/server/commerce/sessionProducts";

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const { userId, roles } = await requireSession();

    const isHost = roles.some((r) => ["STREETSIDE_HOST", "RESTAURANT_SUPERVISOR", "SUPERADMIN"].includes(r));
    if (!isHost) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // RESTAURANT_SUPERVISOR: resolve their venue boundary before the lookup.
    let supervisorVenueId: string | null = null;
    if (roles.includes("RESTAURANT_SUPERVISOR") && !roles.includes("SUPERADMIN")) {
      const profile = await prisma.restaurantHostProfile.findUnique({
        where: { userId },
        select: { venueId: true },
      });
      if (!profile?.venueId) {
        return NextResponse.json(
          { ok: false, error: "Forbidden: no host profile associated with your account" },
          { status: 403 }
        );
      }
      supervisorVenueId = profile.venueId;
    }

    // Enforce server-side scan-config: gift-bag for tickets requires canScanTickets
    if (!roles.includes("SUPERADMIN")) {
      const config = await getEffectiveScanConfig(userId);
      if (!config.canScanTickets) {
        return NextResponse.json({ ok: false, error: "Ticket scan is not enabled for your account" }, { status: 403 });
      }
    }

    const { ticketId } = await params;
    const body = await req.json();

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        entitlementSnapshot: true,
        sessionId: true,
        checkedInAt: true,
        giftBagLogs: { select: { id: true } },
        session: {
          select: {
            giftBagEnabled: true,
            streetsideEnabled: true,
            series: { select: { venueId: true } },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 });
    }

    // Venue-scoping: reject cross-venue access with a non-enumerating 404.
    if (supervisorVenueId && ticket.session?.series?.venueId !== supervisorVenueId) {
      return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 });
    }

    // Ticket must be checked in before gift-bag can be recorded
    if (!ticket.checkedInAt) {
      return NextResponse.json({ ok: false, error: "Ticket has not been checked in yet" }, { status: 422 });
    }

    // Enforce event-level gift-bag enablement (SUPERADMINs bypass)
    if (!roles.includes("SUPERADMIN") && !ticketGiftBagEntitlement(ticket)) {
      return NextResponse.json({ ok: false, error: "Gift bag mode is not enabled for this event" }, { status: 403 });
    }

    if (ticket.giftBagLogs.length > 0) {
      return NextResponse.json({ ok: false, error: "Gift bag already recorded for this ticket" }, { status: 409 });
    }

    const log = await prisma.giftBagLog.create({
      data: {
        ticketId,
        sessionId: ticket.sessionId,
        givenByUserId: userId,
        blockArrivalId: body.blockArrivalId ?? null,
      },
    });

    return NextResponse.json({ ok: true, data: log });
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) {
      return NextResponse.json({ ok: false, error: "Gift bag already recorded for this ticket" }, { status: 409 });
    }
    const error = getHostApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
