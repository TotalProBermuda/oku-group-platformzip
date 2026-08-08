import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleMembershipWelcomeEmail } from "@/server/jobs/commerceHandlers";

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
  const { tier, status, renewsAt, cancelAtPeriodEnd } = body;

  const data: any = {};
  if (tier) data.tier = tier;
  if (status) data.status = status;
  if (renewsAt) data.renewsAt = new Date(renewsAt);
  if (typeof cancelAtPeriodEnd === "boolean") data.cancelAtPeriodEnd = cancelAtPeriodEnd;

  if (status === "ACTIVE" && tier === "FOUNDER") {
    data.approvedByUserId = session.user.id;
  }

  const updated = await prisma.membership.update({
    where: { id },
    data,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  // Send welcome email when membership is activated
  if (status === "ACTIVE" && updated.user?.email) {
    const resolvedRenewsAt = updated.renewsAt ?? new Date(Date.now() + 365 * 86400000);
    handleMembershipWelcomeEmail({
      userEmail: updated.user.email,
      userName: updated.user.name ?? null,
      tier: updated.tier,
      renewsAt: resolvedRenewsAt,
    }).catch((e) => console.error("[email] membership welcome failed:", e));
  }

  return NextResponse.json({ membership: updated });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: _id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = (session.user as any).roles ?? [];
  if (!isAdmin(roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action, userId, tier } = body;

  if (action === "grant") {
    if (!userId || !tier) return NextResponse.json({ error: "userId and tier required" }, { status: 400 });

    const existing = await prisma.membership.findUnique({ where: { userId } });
    const plan = await prisma.membershipPlanConfig.findUnique({ where: { tier } });
    const benefits = (plan?.benefitsJson as any) ?? {};
    const now = new Date();
    const renewsAt = new Date(now.getTime() + 365 * 86400000);

    let membership;
    if (existing) {
      membership = await prisma.membership.update({
        where: { userId },
        data: { tier, status: "ACTIVE", startsAt: now, renewsAt, priceAnnualCents: plan?.priceAnnualCents, benefitsJson: benefits, approvedByUserId: session.user.id },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    } else {
      membership = await prisma.membership.create({
        data: { userId, tier, status: "ACTIVE", startsAt: now, renewsAt, priceAnnualCents: plan?.priceAnnualCents ?? 0, avacaContributionBps: 1500, benefitsJson: benefits, approvedByUserId: session.user.id },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    }

    // Send welcome email after granting membership
    if (membership.user?.email) {
      handleMembershipWelcomeEmail({
        userEmail: membership.user.email,
        userName: membership.user.name ?? null,
        tier: membership.tier,
        renewsAt,
      }).catch((e) => console.error("[email] membership welcome failed:", e));
    }

    return NextResponse.json({ membership });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
