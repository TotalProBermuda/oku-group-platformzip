import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issuePasswordlessToken } from "@/server/auth/passwordless";
import { logAdminAction } from "@/lib/adminAudit";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function POST(request: NextRequest, context: { params: Promise<{ partnerId: string }> }) {
  try {
    const auth = await requireAdminRoles(request, ["SUPERADMIN"]);
    const { partnerId } = await context.params;
    const partner = await prisma.partnerProfile.findUnique({ where: { id: partnerId }, include: { user: true } });
    if (!partner || partner.user.status !== "ACTIVE") return NextResponse.json({ error: "Active partner account not found" }, { status: 404 });
    const issued = await issuePasswordlessToken({ email: partner.user.email, callbackUrl: "/partner/dashboard", requireExistingUserId: partner.userId });
    if (!issued.issued) throw new Error("Secure sign-in email could not be issued");
    await logAdminAction({ targetUserId: partner.userId, performedByUserId: auth.userId, action: "PARTNER_COMMERCE_INVITED", summary: `Issued Partner Commerce sign-in invitation for ${partner.name}`, reason: "Superadmin-approved partner onboarding" });
    return NextResponse.json({ ok: true, email: partner.user.email });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to issue invitation" }, { status: (error as { status?: number }).status ?? 500 });
  }
}
