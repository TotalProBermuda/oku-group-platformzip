import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

export async function GET() {
  try {
    const { userId, roles } = await requireSession();

    const isHost = roles.some((r) => ["STREETSIDE_HOST", "RESTAURANT_SUPERVISOR", "SUPERADMIN"].includes(r));
    if (!isHost) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Try user-specific config first, then global default
    let config = await prisma.streetsideScanConfig.findUnique({ where: { userId } });

    if (!config) {
      config = await prisma.streetsideScanConfig.findFirst({ where: { isGlobalDefault: true } });
    }

    // If no config at all, return sensible defaults
    const result = config ?? {
      canScanMembers: true,
      canScanTickets: false,
      canScanReservationBlocks: false,
    };

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
