import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/adminAudit";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(request: NextRequest, { params }: { params: Promise<{ seatId: string }> }) {
  try {
    const auth = await requireAdminRoles(request, ["SUPERADMIN"]);
    const { seatId } = await params;
    const seat = await prisma.partnerCommerceSeat.findUnique({
      where: { id: seatId },
      select: {
        id: true,
        displayName: true,
        commercialRole: true,
        status: true,
        provisionedUserId: true,
        referralLinkId: true,
        partner: { select: { name: true, userId: true } },
      },
    });
    if (!seat) return NextResponse.json({ error: "Seller seat not found" }, { status: 404 });

    const link = seat.referralLinkId
      ? await prisma.referralLink.findUnique({
          where: { id: seat.referralLinkId },
          select: { code: true, url: true, isActive: true, clickCount: true },
        })
      : null;

    await logAdminAction({
      targetUserId: seat.provisionedUserId ?? seat.partner.userId,
      performedByUserId: auth.userId,
      action: "PARTNER_SUPPORT_VIEWED",
      summary: `Read-only seller experience preview opened for ${seat.displayName} under ${seat.partner.name}`,
      reason: "Superadmin seller support preview",
      newValue: { seatId: seat.id, supportMode: true },
    });

    return NextResponse.json({
      seller: { displayName: seat.displayName, commercialRole: seat.commercialRole, status: seat.status },
      partner: { name: seat.partner.name },
      channel: link,
      supportMode: true,
      permissions: { canManageTeam: false, canViewPartnerTotals: false, canManagePayouts: false },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: status === 500 ? "Unable to load seller preview" : "Unauthorized" }, { status });
  }
}
