import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { activateAttributionChannel, pauseAttributionChannel, rotateAttributionChannel } from "@/server/partnerCommerce/attributionChannelService";

export async function POST(request: NextRequest, context: { params: Promise<{ seatId: string }> }) {
  try {
    const auth = await requireAdminRoles(request, ["SUPERADMIN"]);
    const { seatId } = await context.params;
    const { action } = await request.json() as { action?: string };
    const target = { kind: "seller" as const, seatId };
    if (action === "activate") return NextResponse.json({ result: await activateAttributionChannel(target, auth.userId) });
    if (action === "pause") return NextResponse.json({ result: await pauseAttributionChannel(target, auth.userId) });
    if (action === "rotate") return NextResponse.json({ result: await rotateAttributionChannel(target, auth.userId) });
    return NextResponse.json({ error: "Unknown channel action" }, { status: 400 });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update seller channel" }, { status });
  }
}
