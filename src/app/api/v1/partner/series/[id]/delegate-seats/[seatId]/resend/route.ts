import { NextRequest, NextResponse } from "next/server";
import { PartnerAuthError, requireSeriesPartnerOnly } from "@/lib/partnerAuth";
import {
  getSeatById,
  resendInvite,
} from "@/server/partnerSeats/service";
import { sendSeatInviteEmail } from "@/server/partnerSeats/email";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; seatId: string }> }
) {
  try {
    const { id: seriesId, seatId } = await ctx.params;
    const auth = await requireSeriesPartnerOnly(seriesId);

    const seat = await getSeatById(seatId);
    if (!seat || seat.seriesId !== seriesId && seat.session?.seriesId !== seriesId) {
      return NextResponse.json({ error: "Seat not found on series" }, { status: 404 });
    }

    const issued = await resendInvite(seatId, auth.userId);

    const partner = await prisma.partnerProfile.findUnique({
      where: { id: seat.partnerId },
      select: { name: true },
    });
    const scopeLabel = seat.session
      ? `${auth.series.title} — ${seat.session.title ?? new Date(seat.session.startsAt).toLocaleDateString()}`
      : auth.series.title;

    const emailResult = await sendSeatInviteEmail({
      toEmail: seat.invitedEmail,
      toName: seat.invitedName,
      rawToken: issued.rawToken,
      roleCode: seat.roleCode,
      partnerName: partner?.name ?? "OKÜ Partner",
      scopeLabel,
      expiresAt: issued.expiresAt,
    });

    return NextResponse.json({
      ok: true,
      emailSent: emailResult.sent,
      emailError: emailResult.reason ?? null,
      previewLink: emailResult.previewLink,
    });
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
