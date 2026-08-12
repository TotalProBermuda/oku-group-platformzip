import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;

    // NOTE: nested `commissions` include intentionally REMOVED — Prisma
    // relation includes can only filter by the legacy `referrerId` FK and
    // would silently UNDER-COUNT rows attributed via `referralActorId`
    // alone. We re-attach commissions below using the canonical
    // earner-scope helper. Same goes for `_count.commissions`: we count
    // via the OR-clause query.
    const referrerBase = await prisma.referrer.findUnique({
      where: { userId: id },
      include: {
        compensationPlan: true,
        attributions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: { select: { attributions: true } },
      },
    });

    let referrer:
      | (typeof referrerBase & {
          commissions: Awaited<ReturnType<typeof prisma.commissionEntry.findMany>>;
          _count: { attributions: number; commissions: number };
        })
      | null = null;
    if (referrerBase) {
      const earnerScope = (await resolveEarnerScopeForReferrer(referrerBase.id))!;
      const earnerWhere = commissionWhereForEarner(earnerScope);
      const [commissions, commissionsCount] = await Promise.all([
        prisma.commissionEntry.findMany({
          where: earnerWhere,
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { reservation: { select: { id: true, partySize: true, reservationDate: true } } },
        }),
        prisma.commissionEntry.count({ where: earnerWhere }),
      ]);
      referrer = {
        ...referrerBase,
        commissions,
        _count: { ...referrerBase._count, commissions: commissionsCount },
      } as typeof referrer;
    }

    const influencerProfile = await prisma.influencerProfile.findUnique({
      where: { userId: id },
      include: {
        ledgerEntries: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        _count: { select: { ledgerEntries: true } },
      },
    });

    const commissionTotals = referrer
      ? {
          pending: referrer.commissions.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amountCents, 0),
          approved: referrer.commissions.filter((c) => c.status === "APPROVED").reduce((s, c) => s + c.amountCents, 0),
          paid: referrer.commissions.filter((c) => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0),
        }
      : null;

    const ledgerTotals = influencerProfile
      ? {
          earned: influencerProfile.ledgerEntries.filter((l) => l.type === "COMMISSION_EARNED").reduce((s, l) => s + l.amountCents, 0),
          paid:   influencerProfile.ledgerEntries.filter((l) => l.type === "COMMISSION_PAID").reduce((s, l) => s + l.amountCents, 0),
        }
      : null;

    const plans = await prisma.compensationPlan.findMany({
      where: { isActive: true },
      select: { id: true, name: true, modelType: true, appliesToType: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      ok: true,
      data: {
        referrer,
        commissionTotals,
        influencerProfile: influencerProfile
          ? { ...influencerProfile, ledger: influencerProfile.ledgerEntries }
          : null,
        ledgerTotals,
        plans,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId: actorId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const { compensationPlanId } = await req.json();

    const referrer = await prisma.referrer.findUniqueOrThrow({ where: { userId: id } });
    const previousPlanId = referrer.compensationPlanId ?? null;

    await prisma.referrer.update({
      where: { id: referrer.id },
      data:  { compensationPlanId: compensationPlanId ?? null },
    });

    await logAdminAction({
      targetUserId:      id,
      performedByUserId: actorId,
      action:            "USER_UPDATED",
      summary:           compensationPlanId
        ? "Compensation plan changed"
        : "Compensation plan removed",
      previousValue: { compensationPlanId: previousPlanId },
      newValue:      { compensationPlanId: compensationPlanId ?? null },
    });

    return NextResponse.json({ ok: true, message: "Compensation plan updated" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId: actorId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const body = await req.json();

    const { referrerId } = body;

    // Snapshot the currently-linked referrer (if any) so we can record
    // before/after for both link, change, and unlink operations.
    const previouslyLinked = await prisma.referrer.findFirst({
      where:  { userId: id },
      select: { id: true, referralCode: true, referrerType: true, fullName: true },
    });

    if (referrerId === null) {
      if (!previouslyLinked) {
        // Nothing to unlink — keep the operation idempotent and skip the audit row.
        return NextResponse.json({ ok: true, message: "Commercial persona unlinked" });
      }
      await prisma.referrer.updateMany({
        where: { userId: id },
        data:  { userId: null },
      });
      await logAdminAction({
        targetUserId:      id,
        performedByUserId: actorId,
        action:            "USER_UPDATED",
        summary:           "Commercial persona unlinked",
        previousValue:     { referrer: previouslyLinked },
        newValue:          { referrer: null },
      });
      return NextResponse.json({ ok: true, message: "Commercial persona unlinked" });
    }

    const referrer = await prisma.referrer.findUniqueOrThrow({
      where: { id: referrerId },
      select: { id: true, userId: true, referralCode: true, referrerType: true, fullName: true },
    });

    if (referrer.userId && referrer.userId !== id) {
      return NextResponse.json({ ok: false, error: "This referrer profile is already linked to another user" }, { status: 400 });
    }

    // No-op if already linked to the same user — keep idempotent.
    if (referrer.userId === id && previouslyLinked?.id === referrer.id) {
      return NextResponse.json({ ok: true, message: "Commercial persona linked" });
    }

    // If switching from one referrer to another, free the previous link first
    // so the unique-by-userId invariant on Referrer holds during the swap.
    if (previouslyLinked && previouslyLinked.id !== referrer.id) {
      await prisma.referrer.update({
        where: { id: previouslyLinked.id },
        data:  { userId: null },
      });
    }

    await prisma.referrer.update({
      where: { id: referrerId },
      data:  { userId: id },
    });

    await logAdminAction({
      targetUserId:      id,
      performedByUserId: actorId,
      action:            "USER_UPDATED",
      summary:           previouslyLinked
        ? "Commercial persona changed"
        : "Commercial persona linked",
      previousValue:     { referrer: previouslyLinked ?? null },
      newValue:          { referrer: { id: referrer.id, referralCode: referrer.referralCode, referrerType: referrer.referrerType, fullName: referrer.fullName } },
    });

    return NextResponse.json({ ok: true, message: previouslyLinked ? "Commercial persona changed" : "Commercial persona linked" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
