import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/adminAudit";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { PartnerCommerceRole } from "@prisma/client";

const COMMERCE_ROLES = new Set(Object.values(PartnerCommerceRole));

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminRoles(request, ["SUPERADMIN"]);
    const partnerId = request.nextUrl.searchParams.get("partnerId");
    if (!partnerId) {
      const partners = await prisma.partnerProfile.findMany({
        // The support directory must remain available even when the commerce
        // migration is pending or a brand-new partner has no commerce rows.
        // Counts are loaded only after the operator opens a specific profile.
        select: { id: true, name: true, approved: true, user: { select: { email: true, name: true } } },
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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminRoles(request, ["SUPERADMIN"]);
    const body = await request.json() as Record<string, unknown>;
    const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const commercialRole = typeof body.commercialRole === "string" ? body.commercialRole : "";
    if (!partnerId || !displayName || !email.includes("@") || !COMMERCE_ROLES.has(commercialRole as PartnerCommerceRole)) {
      return NextResponse.json({ error: "Enter a name, valid email, and commercial role" }, { status: 400 });
    }
    const seat = await prisma.partnerCommerceSeat.create({
      data: { partnerId, createdByUserId: auth.userId, displayName, email, commercialRole: commercialRole as PartnerCommerceRole, status: "DRAFT" },
      select: { id: true, displayName: true, email: true, commercialRole: true, status: true },
    });
    return NextResponse.json({ seat }, { status: 201 });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save seller draft" }, { status });
  }
}
