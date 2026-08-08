import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EventReferrerCommissionMode } from "@prisma/client";
import { PartnerAuthError, requireSeriesPartnerOnly } from "@/lib/partnerAuth";
import {
  getSeatById,
  updateSeatCommission,
} from "@/server/partnerSeats/service";

const PatchSchema = z.object({
  commissionMode: z.nativeEnum(EventReferrerCommissionMode),
  flatAmountCents: z.number().int().min(0).nullable().optional(),
  perSeatAmountCents: z.number().int().min(0).nullable().optional(),
  percentageBps: z.number().int().min(0).max(10000).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; seatId: string }> }
) {
  try {
    const { id: seriesId, seatId } = await ctx.params;
    const auth = await requireSeriesPartnerOnly(seriesId);

    const seat = await getSeatById(seatId);
    if (!seat || (seat.seriesId !== seriesId && seat.session?.seriesId !== seriesId)) {
      return NextResponse.json({ error: "Seat not found on series" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await updateSeatCommission(seatId, auth.userId, {
      isReferrerEnabled: true,
      commissionMode: parsed.data.commissionMode,
      flatAmountCents: parsed.data.flatAmountCents ?? null,
      perSeatAmountCents: parsed.data.perSeatAmountCents ?? null,
      percentageBps: parsed.data.percentageBps ?? null,
    });

    return NextResponse.json({ ok: true, ...result });
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
