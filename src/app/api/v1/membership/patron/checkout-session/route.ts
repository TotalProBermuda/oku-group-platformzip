import { NextResponse } from "next/server";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { handlePatronPendingApprovalEmail } from "@/server/jobs/commerceHandlers";

export async function POST() {
  const auth = await getOptionalSession();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const existing = await prisma.membership.findUnique({
    where: { userId: auth.userId },
  });

  if (existing?.status === "ACTIVE") {
    return NextResponse.json({ error: "ALREADY_MEMBER", tier: existing.tier }, { status: 409 });
  }

  if (existing?.status === "PENDING_APPROVAL") {
    return NextResponse.json({ error: "ALREADY_PENDING" }, { status: 409 });
  }

  const plan = await prisma.membershipPlanConfig.findUnique({
    where: { tier: "PATRON" },
  });

  if (!plan) {
    return NextResponse.json({ error: "Patron plan not configured" }, { status: 500 });
  }

  // Patron tier uses a manual approval flow: the request is recorded as
  // PENDING_APPROVAL and the team completes enrolment (and any annual card
  // capture, processed via Authorize.Net) out of band. We do not run an
  // automated checkout for the Patron tier today.
  const membership = await prisma.membership.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      tier: "PATRON",
      status: "PENDING_APPROVAL",
      priceAnnualCents: plan.priceAnnualCents,
      currency: plan.currency,
      avacaContributionBps: plan.avacaContributionBps,
    },
    update: {
      tier: "PATRON",
      status: "PENDING_APPROVAL",
      priceAnnualCents: plan.priceAnnualCents,
      currency: plan.currency,
    },
  });

  // Notify user their request is pending
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { name: true, email: true },
  });
  if (user?.email) {
    handlePatronPendingApprovalEmail({
      userEmail: user.email,
      userName: user.name ?? null,
    }).catch((e) => console.error("[email] patron pending failed:", e));
  }

  return NextResponse.json({
    status: "PENDING_APPROVAL",
    membershipId: membership.id,
    plan: {
      tier: plan.tier,
      displayName: plan.displayName,
      priceAnnualCents: plan.priceAnnualCents,
      currency: plan.currency,
    },
  });
}
