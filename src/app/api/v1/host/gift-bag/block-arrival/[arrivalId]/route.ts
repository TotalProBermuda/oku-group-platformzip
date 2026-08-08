import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { getEffectiveScanConfig } from "@/server/streetside/getScanConfig";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ arrivalId: string }> }) {
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

    // Enforce server-side scan-config: block gift-bag requires canScanReservationBlocks
    if (!roles.includes("SUPERADMIN")) {
      const config = await getEffectiveScanConfig(userId);
      if (!config.canScanReservationBlocks) {
        return NextResponse.json({ ok: false, error: "Reservation block scan is not enabled for your account" }, { status: 403 });
      }
    }

    const { arrivalId } = await params;

    const arrival = await prisma.reservationBlockArrival.findUnique({
      where: { id: arrivalId },
      select: {
        id: true,
        blockId: true,
        partySize: true,
        block: {
          select: {
            giftBagEnabled: true,
            sessionId: true,
            session: { select: { giftBagEnabled: true } },
            series: { select: { venueId: true } },
          },
        },
      },
    });

    if (!arrival) {
      return NextResponse.json({ ok: false, error: "Arrival not found" }, { status: 404 });
    }

    // Venue-scoping: reject cross-venue access with a non-enumerating 404.
    if (supervisorVenueId && arrival.block.series?.venueId !== supervisorVenueId) {
      return NextResponse.json({ ok: false, error: "Arrival not found" }, { status: 404 });
    }

    // Enforce event-level gift-bag enablement: block OR session must have gift bag enabled
    const effectiveGiftBagEnabled =
      arrival.block.giftBagEnabled || (arrival.block.session?.giftBagEnabled ?? false);
    if (!roles.includes("SUPERADMIN") && !effectiveGiftBagEnabled) {
      return NextResponse.json({ ok: false, error: "Gift bag mode is not enabled for this block/event" }, { status: 403 });
    }

    // Check for duplicate (also guarded by DB unique constraint)
    const existing = await prisma.giftBagLog.findFirst({ where: { blockArrivalId: arrivalId } });
    if (existing) {
      return NextResponse.json({ ok: false, error: "Gift bag already recorded for this arrival" }, { status: 409 });
    }

    // Use partySize as quantity so gift-bag totals map to guests, not just arrival records
    const log = await prisma.giftBagLog.create({
      data: {
        blockArrivalId: arrivalId,
        sessionId: arrival.block.sessionId ?? null,
        givenByUserId: userId,
        quantity: arrival.partySize,
      },
    });

    return NextResponse.json({ ok: true, data: log });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ ok: false, error: "Gift bag already recorded for this arrival" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
