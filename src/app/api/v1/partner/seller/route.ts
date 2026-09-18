import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

export async function GET() {
  try {
    const { userId } = await requireSession();
    const seat = await prisma.partnerCommerceSeat.findFirst({
      where: { provisionedUserId: userId, status: { not: "REVOKED" } },
      include: { partner: { select: { name: true } } },
    });
    if (!seat) return NextResponse.json({ error: "No partner seller seat is assigned to this account" }, { status: 403 });
    const link = seat.referralLinkId
      ? await prisma.referralLink.findUnique({ where: { id: seat.referralLinkId }, select: { code: true, url: true, isActive: true, clickCount: true } })
      : null;
    return NextResponse.json({
      seller: { displayName: seat.displayName, commercialRole: seat.commercialRole, status: seat.status },
      partner: seat.partner,
      channel: link,
      permissions: { canManageTeam: false, canViewPartnerTotals: false, canManagePayouts: false },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: status === 500 ? "Unable to load seller channel" : "Unauthorized" }, { status });
  }
}
