import { NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/adminAudit";
import { CommissionTierType } from "@prisma/client";

async function findActorForUser(id: string) {
  let actor = await prisma.referralActor.findFirst({
    where: { userId: id },
    include: {
      assignments: { where: { isActive: true } },
      links: { where: { isActive: true } },
      legacyReferrer: { select: { id: true, referralCode: true } },
    },
  });

  if (!actor) {
    const legacy = await prisma.referrer.findFirst({ where: { userId: id }, select: { id: true } });
    if (legacy) {
      actor = await prisma.referralActor.findFirst({
        where: { legacyReferrerId: legacy.id },
        include: {
          assignments: { where: { isActive: true } },
          links: { where: { isActive: true } },
          legacyReferrer: { select: { id: true, referralCode: true } },
        },
      });
    }
  }
  return actor;
}

async function effectiveRuleFor(actor: Awaited<ReturnType<typeof findActorForUser>>) {
  if (!actor?.commissionEligible) return null;
  const actorRule = await prisma.commissionRule.findFirst({
    where: { scopeType: "REFERRER_ACTOR", scopeId: actor.id, active: true },
    orderBy: { version: "desc" },
  });
  if (actorRule) return { ...actorRule, source: "Referrer override" };

  const tier = actor.commissionTier ?? "STANDARD";
  const globalRule = await prisma.commissionRule.findFirst({
    where: { scopeType: "GLOBAL", scopeId: null, tier, active: true },
    orderBy: { version: "desc" },
  });
  return globalRule ? { ...globalRule, source: `${tier.replace(/_/g, " ")} global rule` } : null;
}

/**
 * Returns the ReferralActor (and active assignments) for a user. Fall-through
 * order: direct `userId` link → legacy `Referrer.userId` → null. Used by the
 * persona surface to prefer ReferralActor over the legacy Referrer model.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(_req, ["SUPERADMIN"]);
    const { id } = await ctx.params;

    const actor = await findActorForUser(id);
    return NextResponse.json({ ok: true, actor, effectiveRule: await effectiveRuleFor(actor) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await ctx.params;
    const body = await req.json();
    const actor = await findActorForUser(id);
    if (!actor) {
      return NextResponse.json({ ok: false, error: "No ReferralActor is linked to this user" }, { status: 404 });
    }

    if (typeof body.commissionEligible !== "boolean") {
      return NextResponse.json({ ok: false, error: "commissionEligible must be a boolean" }, { status: 400 });
    }
    const tier = body.commissionTier == null ? null : String(body.commissionTier);
    if (tier !== null && !Object.values(CommissionTierType).includes(tier as CommissionTierType)) {
      return NextResponse.json({ ok: false, error: "Invalid commission tier" }, { status: 400 });
    }
    if (body.commissionEligible && !tier) {
      return NextResponse.json({ ok: false, error: "An eligible referrer must have a commission tier" }, { status: 400 });
    }

    const updated = await prisma.referralActor.update({
      where: { id: actor.id },
      data: {
        commissionEligible: body.commissionEligible,
        commissionTier: tier as CommissionTierType | null,
      },
      include: {
        assignments: { where: { isActive: true } },
        links: { where: { isActive: true } },
        legacyReferrer: { select: { id: true, referralCode: true } },
      },
    });

    await logAdminAction({
      targetUserId: id,
      performedByUserId: userId,
      action: "REFERRER_COMMISSION_PROGRAM_UPDATED",
      summary: body.commissionEligible
        ? `Commission program set to ${tier}`
        : "Commission disabled; attribution only",
      previousValue: {
        commissionEligible: actor.commissionEligible,
        commissionTier: actor.commissionTier,
      },
      newValue: {
        commissionEligible: updated.commissionEligible,
        commissionTier: updated.commissionTier,
      },
    });

    return NextResponse.json({ ok: true, actor: updated, effectiveRule: await effectiveRuleFor(updated) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
