import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  handleFounderApplicationStatusEmail,
  handleMembershipWelcomeEmail,
} from "@/server/jobs/commerceHandlers";

function isAdmin(roles: string[]) {
  return roles.some((r) => ["SUPERADMIN", "FB_DIRECTOR"].includes(r));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = (session.user as any).roles ?? [];
  if (!isAdmin(roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { status, reviewNotes } = body;

  if (!["UNDER_REVIEW", "APPROVED", "DECLINED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const application = await prisma.founderMembershipApplication.update({
    where: { id },
    data: {
      status,
      reviewNotes: reviewNotes ?? null,
      reviewedByUserId: session.user.id,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (status === "APPROVED" && application.userId) {
    const plan = await prisma.membershipPlanConfig.findUnique({ where: { tier: "FOUNDER" } });
    const benefits = (plan?.benefitsJson as any) ?? {};
    const now = new Date();
    const renewsAt = new Date(now.getTime() + 365 * 86400000);

    const existing = await prisma.membership.findUnique({ where: { userId: application.userId } });
    if (existing) {
      await prisma.membership.update({
        where: { userId: application.userId },
        data: { tier: "FOUNDER", status: "ACTIVE", startsAt: now, renewsAt, priceAnnualCents: plan?.priceAnnualCents, benefitsJson: benefits, approvedByUserId: session.user.id },
      });
    } else {
      await prisma.membership.create({
        data: { userId: application.userId, tier: "FOUNDER", status: "ACTIVE", startsAt: now, renewsAt, priceAnnualCents: plan?.priceAnnualCents ?? 0, avacaContributionBps: 1500, benefitsJson: benefits, approvedByUserId: session.user.id },
      });
    }
    // Send membership welcome email to newly approved Founder
    if (application.user?.email) {
      const now2 = new Date();
      const renewsAt2 = new Date(now2.getTime() + 365 * 86400000);
      handleMembershipWelcomeEmail({
        userEmail: application.user.email,
        userName: application.user.name ?? null,
        tier: "FOUNDER",
        renewsAt: renewsAt2,
      }).catch((e) => console.error("[email] founder welcome failed:", e));
    }
  }

  // Send status notification for all transitions
  if (application.user?.email) {
    handleFounderApplicationStatusEmail({
      userEmail: application.user.email,
      userName: application.user.name ?? null,
      status: status as "APPROVED" | "DECLINED" | "UNDER_REVIEW",
      reviewNotes: reviewNotes ?? null,
    }).catch((e) => console.error("[email] founder status email failed:", e));
  }

  return NextResponse.json({ application });
}
