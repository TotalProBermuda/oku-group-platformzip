import { NextRequest, NextResponse } from "next/server";
import { PartnerAuthError, requireSeriesPartnerOnly } from "@/lib/partnerAuth";
import { getSeatById, revokeSeat } from "@/server/partnerSeats/service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; seatId: string }> }
) {
  try {
    const { id: seriesId, seatId } = await ctx.params;
    const auth = await requireSeriesPartnerOnly(seriesId);
    const seat = await getSeatById(seatId);
    if (!seat || (seat.seriesId !== seriesId && seat.session?.seriesId !== seriesId)) {
      return NextResponse.json({ error: "Seat not found on series" }, { status: 404 });
    }
    await revokeSeat(seatId, auth.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PartnerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
