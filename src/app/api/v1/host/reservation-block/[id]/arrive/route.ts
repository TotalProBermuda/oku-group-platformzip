import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { getEffectiveScanConfig } from "@/server/streetside/getScanConfig";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();

    const isHost = roles.some((r) => ["STREETSIDE_HOST", "SUPERADMIN"].includes(r));
    if (!isHost) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Enforce server-side scan-config (SUPERADMINs bypass restriction)
    if (!roles.includes("SUPERADMIN")) {
      const config = await getEffectiveScanConfig(userId);
      if (!config.canScanReservationBlocks) {
        return NextResponse.json({ ok: false, error: "Reservation block scan is not enabled for your account" }, { status: 403 });
      }
    }

    const { id } = await params;
    const body = await req.json();
    const rawSize = parseInt(body.partySize, 10);
    const partySize = !isNaN(rawSize) && rawSize >= 1 && rawSize <= 200 ? rawSize : 1;

    const block = await prisma.reservationBlock.findUnique({
      where: { id },
      include: {
        arrivals: { select: { partySize: true } },
        session: { select: { id: true, streetsideEnabled: true, giftBagEnabled: true } },
      },
    });

    if (!block) {
      return NextResponse.json({ ok: false, error: "Reservation block not found" }, { status: 404 });
    }

    // Enforce event-level streetside activation (SUPERADMINs bypass)
    if (!roles.includes("SUPERADMIN") && block.session && !block.session.streetsideEnabled) {
      return NextResponse.json(
        { ok: false, error: "Streetside check-in is not enabled for this event" },
        { status: 403 }
      );
    }

    const arrival = await prisma.reservationBlockArrival.create({
      data: {
        blockId: id,
        partySize,
        scannedByUserId: userId,
      },
    });

    const totalArrived = block.arrivals.reduce((sum, a) => sum + a.partySize, 0) + partySize;

    // Effective gift-bag: block-level OR session-level (session is the primary gate)
    const effectiveGiftBagEnabled = block.giftBagEnabled || (block.session?.giftBagEnabled ?? false);

    const updatedBlock = await prisma.reservationBlock.findUnique({
      where: { id },
      include: {
        arrivals: { select: { id: true, partySize: true, arrivedAt: true } },
        session: { select: { id: true, title: true, startsAt: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        arrival,
        block: updatedBlock,
        totalArrived,
        expectedCount: block.expectedCount,
        giftBagEnabled: effectiveGiftBagEnabled,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
