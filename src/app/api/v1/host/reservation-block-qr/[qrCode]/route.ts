import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { getEffectiveScanConfig } from "@/server/streetside/getScanConfig";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ qrCode: string }> }) {
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

    const { qrCode } = await params;

    const block = await prisma.reservationBlock.findUnique({
      where: { qrCode },
      include: {
        arrivals: { select: { id: true, partySize: true, arrivedAt: true } },
        session: { select: { id: true, title: true, startsAt: true, streetsideEnabled: true, giftBagEnabled: true } },
      },
    });

    if (!block) {
      return NextResponse.json({ ok: false, error: "Block not found" }, { status: 404 });
    }

    // Enforce event-level streetside activation (SUPERADMINs bypass)
    if (!roles.includes("SUPERADMIN") && block.session && !block.session.streetsideEnabled) {
      return NextResponse.json(
        { ok: false, error: "Streetside check-in is not enabled for this event" },
        { status: 403 }
      );
    }

    const totalArrived = block.arrivals.reduce((sum, a) => sum + a.partySize, 0);

    // Effective gift-bag: block-level OR session-level (session is the primary gate)
    const effectiveGiftBagEnabled = block.giftBagEnabled || (block.session?.giftBagEnabled ?? false);

    return NextResponse.json({
      ok: true,
      data: {
        block,
        totalArrived,
        expectedCount: block.expectedCount,
        giftBagEnabled: effectiveGiftBagEnabled,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
