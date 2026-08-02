import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { logAdminAction } from "@/lib/adminAudit";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";

// NOTE: nested `_count.commissions` intentionally REMOVED from the include
// below. Prisma `_count` follows the relation FK directly (here `referrerId`)
// and would silently UNDER-COUNT once writers shift to populating
// `referralActorId` instead. We re-attach the commission count via a separate
// OR-clause query (see `attachCommissionCount`) so the count honors both
// FKs uniformly with every other read surface.
//   See: src/server/commissions/earnerScope.ts
//   Smoke: scripts/commission-dedup-smoke.ts (invariant "admin users [id] route")
const USER_INCLUDE = {
  roles: { select: { roleKey: true } },
  influencer: {
    select: {
      id: true,
      handle: true,
      refCode: true,
      commissionRateBps: true,
      approved: true,
      approvalStatus: true,
      payoutCycle: true,
      minPayoutThresholdCents: true,
    },
  },
  referrer: {
    select: {
      id: true,
      fullName: true,
      referrerType: true,
      referralCode: true,
      isActive: true,
      compensationPlan: { select: { id: true, name: true, modelType: true, commissionPercent: true, flatPerCoverCents: true, flatPerPartyCents: true, hourlyRateCents: true } },
      _count: { select: { attributions: true } },
    },
  },
  auditLogs: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    include: { performedBy: { select: { id: true, name: true, email: true } } },
  },
};

type UserWithReferrer = {
  referrer: ({ id: string; _count: { attributions: number } } & Record<string, unknown>) | null;
} & Record<string, unknown>;

/**
 * Re-attach `referrer._count.commissions` via the canonical OR-clause query
 * so the count matches every other per-earner read surface during the
 * Referrer → ReferralActor migration. Mutates a shallow-cloned referrer
 * subtree; never touches the input.
 */
async function attachCommissionCount<T extends UserWithReferrer>(user: T): Promise<T> {
  if (!user.referrer) return user;
  const scope = await resolveEarnerScopeForReferrer(user.referrer.id);
  if (!scope) return user;
  const commissionsCount = await prisma.commissionEntry.count({
    where: commissionWhereForEarner(scope),
  });
  return {
    ...user,
    referrer: {
      ...user.referrer,
      _count: { ...user.referrer._count, commissions: commissionsCount },
    },
  } as T;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");
    const { id } = await params;

    const userBase = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: USER_INCLUDE,
    });
    const user = await attachCommissionCount(userBase as unknown as UserWithReferrer);

    return NextResponse.json({ ok: true, data: user });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { id } = await params;
    const body = await req.json();

    const prev = await prisma.user.findUniqueOrThrow({ where: { id } });

    const update: Record<string, unknown> = {};
    if (body.name         !== undefined) update.name          = body.name;
    if (body.email        !== undefined) update.email         = body.email;
    if (body.phone        !== undefined) update.phone         = body.phone;
    if (body.internalNotes !== undefined) update.internalNotes = body.internalNotes;
    if (body.tags         !== undefined) update.tags          = body.tags;

    const userBase = await prisma.user.update({ where: { id }, data: update, include: USER_INCLUDE });
    const user = await attachCommissionCount(userBase as unknown as UserWithReferrer);

    await logAdminAction({
      targetUserId:      id,
      performedByUserId: userId,
      action:            "USER_UPDATED",
      summary:           `User profile updated`,
      previousValue:     { name: prev.name, email: prev.email, internalNotes: prev.internalNotes },
      newValue:          update,
    });

    return NextResponse.json({ ok: true, data: user });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
