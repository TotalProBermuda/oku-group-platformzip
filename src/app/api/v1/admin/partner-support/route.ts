import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/adminAudit";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminRoles(request, ["SUPERADMIN"]);
    const partnerId = request.nextUrl.searchParams.get("partnerId");
    if (!partnerId) {
      const partners = await prisma.partnerProfile.findMany({
        select: { id: true, name: true, approved: true, user: { select: { email: true, name: true } }, _count: { select: { commerceChannels: true, commerceSeats: true } } },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ partners });
    }
    const partner = await prisma.partnerProfile.findUnique({
      where: { id: partnerId },
      select: {
        id: true, name: true, approved: true, userId: true, user: { select: { name: true, email: true } },
        commerceChannels: { select: { id: true, label: true, status: true, referralActorId: true, referralLinkId: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        commerceSeats: { select: { id: true, displayName: true, email: true, commercialRole: true, status: true, requestedScopeJson: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    await logAdminAction({ targetUserId: partner.userId, performedByUserId: auth.userId, action: "PARTNER_SUPPORT_VIEWED", summary: `Partner support workspace viewed for ${partner.name}`, reason: "Primary support console read-only review" });
    return NextResponse.json({ partner });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: status === 500 ? "Unable to load partner support" : "Unauthorized" }, { status });
  }
}
