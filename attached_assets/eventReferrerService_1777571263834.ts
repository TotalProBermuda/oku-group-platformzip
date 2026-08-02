import { prisma } from "@/lib/prisma";
import {
  EventReferrerStatus,
  EventReferrerScopeType,
  EventReferrerCommissionMode,
  ReferralActorType,
} from "@prisma/client";
import { nanoid } from "nanoid";

export interface CreateEventReferrerInput {
  parentInfluencerId: string;
  createdByInfluencerId: string;
  seriesId?: string;
  scopeType: EventReferrerScopeType;
  assignedUserId?: string;
  inviteEmail?: string;
  displayName: string;
  isCommissionEligible?: boolean;
  commissionMode?: EventReferrerCommissionMode;
  commissionShareBps?: number;
}

function generateReferralCode(prefix: string = "EVT"): string {
  return `${prefix}-${nanoid(8).toUpperCase()}`;
}

async function ensureHostReferralActor(host: {
  id: string;
  userId: string;
  displayName: string;
}, assignmentId: string) {
  const actorByAssignment = await prisma.referralActor.findUnique({
    where: { legacyEventReferrerAssignmentId: assignmentId },
    select: { id: true },
  });
  if (actorByAssignment) return actorByAssignment;

  const actorByUser = await prisma.referralActor.findUnique({
    where: { userId: host.userId },
    select: { id: true, legacyEventReferrerAssignmentId: true },
  }).catch(() => null);

  if (actorByUser && !actorByUser.legacyEventReferrerAssignmentId) {
    return prisma.referralActor.update({
      where: { id: actorByUser.id },
      data: {
        actorType: ReferralActorType.STREETSIDE_HOST,
        displayName: host.displayName,
        legacyEventReferrerAssignmentId: assignmentId,
      },
      select: { id: true },
    });
  }

  if (actorByUser) return actorByUser;

  return prisma.referralActor.create({
    data: {
      actorType: ReferralActorType.STREETSIDE_HOST,
      displayName: host.displayName,
      userId: host.userId,
      legacyEventReferrerAssignmentId: assignmentId,
    },
    select: { id: true },
  });
}

/**
 * Streetside hosts are first-class referrers, employed by the restaurant
 * rather than externally. This idempotently provisions a personal
 * commission code for a host: their own EventReferrerAssignment anchored
 * to themselves (parentHostProfileId = host.id), with the same host as
 * the recipient (assignedHostProfileId = host.id). Commission is settled
 * by the restaurant off-platform — same payout structure as
 * partner-anchored seats — so OKU only emits a reporting row when the
 * host's bookings convert.
 *
 * Called lazily from /api/v1/host/me so every host has a working QR
 * code as soon as they sign in, without an admin having to manually
 * provision one.
 */
export async function provisionHostPersonalReferrer(hostProfileId: string) {
  // Race-safe: parentHostProfileId carries a UNIQUE constraint, so the
  // database guarantees at most one row per host. We:
  //   1) look up any existing row (any status) by host
  //   2) if it's already ACTIVE/INVITED, return it
  //   3) if it exists in some other status (REVOKED etc.), reactivate
  //   4) otherwise create — concurrent inserts collide on the unique
  //      constraint and we recover by re-reading the winner's row.
  const host = await prisma.restaurantHostProfile.findUnique({
    where: { id: hostProfileId },
    select: { id: true, userId: true, displayName: true, venueId: true },
  });
  if (!host) {
    throw new Error(`Host profile not found: ${hostProfileId}`);
  }

  const existingAny = await prisma.eventReferrerAssignment.findUnique({
    where: { parentHostProfileId: hostProfileId },
    select: { id: true, referralCode: true, status: true },
  });
  if (existingAny) {
    // A host's personal code is self-anchored — there's no separate
    // party to "accept the invite" — so anything other than ACTIVE
    // (INVITED, REVOKED, EXPIRED, etc.) gets promoted. This also
    // matches the /api/v1/host/me reader which filters by
    // status=ACTIVE; without the promote, an INVITED row would be
    // returned here but invisibly filtered out downstream.
    if (existingAny.status === EventReferrerStatus.ACTIVE) {
      await ensureHostReferralActor(host, existingAny.id);
      return existingAny;
    }
    const reactivated = await prisma.eventReferrerAssignment.update({
      where: { id: existingAny.id },
      data: { status: EventReferrerStatus.ACTIVE },
      select: { id: true, referralCode: true, status: true },
    });
    await ensureHostReferralActor(host, reactivated.id);
    return reactivated;
  }

  const referralCode = generateReferralCode("HOST");
  try {
    const assignment = await prisma.eventReferrerAssignment.create({
      data: {
        parentHostProfileId: host.id,
        assignedHostProfileId: host.id,
        assignedUserId: host.userId,
        // No specific series — a streetside host's personal code is
        // venue-wide. We keep scopeType=SERIES (the existing default) +
        // null seriesId rather than introducing a new enum value, since
        // the resolver looks the code up by `referralCode` directly and
        // doesn't gate on scope.
        scopeType: EventReferrerScopeType.SERIES,
        displayName: host.displayName,
        referralCode,
        // Commission policy is set per-restaurant by admin. We default
        // to "eligible" so attribution is recorded; the actual share is
        // configured separately so OKU never assumes a payout amount.
        isCommissionEligible: true,
        commissionMode: EventReferrerCommissionMode.NONE,
        commissionPayer: "RESTAURANT",
        status: EventReferrerStatus.ACTIVE,
      },
      select: { id: true, referralCode: true, status: true },
    });
    await ensureHostReferralActor(host, assignment.id);
    return assignment;
  } catch (err: any) {
    // Concurrent /me from the same host racing us — the unique
    // constraint kicks in. Re-read and return whatever the winning
    // request just inserted instead of failing the caller.
    if (err?.code === "P2002") {
      const winner = await prisma.eventReferrerAssignment.findUnique({
        where: { parentHostProfileId: host.id },
        select: { id: true, referralCode: true, status: true },
      });
      if (winner) {
        await ensureHostReferralActor(host, winner.id);
        return winner;
      }
    }
    throw err;
  }
}

/**
 * Enforces the parent-anchor invariant on EventReferrerAssignment writes.
 * Exactly one of parentInfluencerId / parentPartnerId / parentHostProfileId
 * must be set. Streetside hosts are first-class referrers (employed by
 * the restaurant rather than externally), so they get their own anchor.
 */
export function assertReferrerParentXor(args: {
  parentInfluencerId?: string | null;
  parentPartnerId?: string | null;
  parentHostProfileId?: string | null;
}): void {
  const flags = [
    !!args.parentInfluencerId,
    !!args.parentPartnerId,
    !!args.parentHostProfileId,
  ];
  const setCount = flags.filter(Boolean).length;
  if (setCount !== 1) {
    throw new Error(
      `EventReferrerAssignment must have exactly one parent (got influencer=${flags[0]}, partner=${flags[1]}, host=${flags[2]})`
    );
  }
}

function buildReferralUrl(referralCode: string, seriesSlug?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://okuhospitality.com";
  const path = seriesSlug ? `/series/${seriesSlug}` : "/series";
  return `${base}${path}?ref=${referralCode}`;
}

export async function createEventReferrer(input: CreateEventReferrerInput) {
  assertReferrerParentXor({ parentInfluencerId: input.parentInfluencerId });
  const referralCode = generateReferralCode();

  let referralUrl: string | undefined;
  if (input.seriesId) {
    const series = await prisma.series.findUnique({
      where: { id: input.seriesId },
      select: { slug: true },
    });
    referralUrl = buildReferralUrl(referralCode, series?.slug);
  } else {
    referralUrl = buildReferralUrl(referralCode);
  }

  return prisma.eventReferrerAssignment.create({
    data: {
      parentInfluencerId: input.parentInfluencerId,
      createdByInfluencerId: input.createdByInfluencerId,
      seriesId: input.seriesId,
      scopeType: input.scopeType,
      assignedUserId: input.assignedUserId,
      inviteEmail: input.inviteEmail,
      displayName: input.displayName,
      referralCode,
      referralUrl,
      isCommissionEligible: input.isCommissionEligible ?? false,
      commissionMode: input.commissionMode ?? EventReferrerCommissionMode.NONE,
      commissionShareBps: input.commissionShareBps,
      status: input.assignedUserId
        ? EventReferrerStatus.ACTIVE
        : EventReferrerStatus.INVITED,
    },
    include: {
      series: { select: { id: true, slug: true, title: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function revokeEventReferrer(id: string) {
  return prisma.eventReferrerAssignment.update({
    where: { id },
    data: { status: EventReferrerStatus.REVOKED },
  });
}

export async function activateEventReferrer(id: string) {
  return prisma.eventReferrerAssignment.update({
    where: { id },
    data: { status: EventReferrerStatus.ACTIVE },
  });
}

export async function archiveEventReferrer(id: string) {
  return prisma.eventReferrerAssignment.update({
    where: { id },
    data: { status: EventReferrerStatus.ARCHIVED },
  });
}

export async function getEventReferrerByCode(referralCode: string) {
  return prisma.eventReferrerAssignment.findUnique({
    where: { referralCode: referralCode.toUpperCase() },
    include: {
      series: { select: { id: true, slug: true, title: true, seriesVisibilityMode: true } },
      parentInfluencer: { select: { id: true, commissionRateBps: true } },
    },
  });
}

export async function listReferrersForInfluencer(influencerId: string) {
  return prisma.eventReferrerAssignment.findMany({
    where: {
      parentInfluencerId: influencerId,
      status: { not: EventReferrerStatus.ARCHIVED },
    },
    include: {
      series: { select: { id: true, slug: true, title: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
      orders: {
        where: { status: "PAID" },
        select: { id: true, subtotalCents: true },
      },
      subCommissionLedger: {
        select: { referrerShareCents: true, payoutStatus: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInfluencerReferrerDashboardMetrics(influencerId: string) {
  const referrers = await listReferrersForInfluencer(influencerId);

  const team = referrers.map((r) => {
    const ticketsSold = r.orders.length;
    const revenueAttributedCents = r.orders.reduce(
      (sum, o) => sum + o.subtotalCents,
      0
    );
    const subCommissionOwedCents = r.subCommissionLedger
      .filter((s) => s.payoutStatus === "PENDING")
      .reduce((sum, s) => sum + s.referrerShareCents, 0);

    return {
      id: r.id,
      displayName: r.displayName,
      referralCode: r.referralCode,
      referralUrl: r.referralUrl,
      qrCodeImageUrl: r.qrCodeImageUrl,
      scopeType: r.scopeType,
      series: r.series,
      assignedUser: r.assignedUser,
      isCommissionEligible: r.isCommissionEligible,
      commissionMode: r.commissionMode,
      commissionShareBps: r.commissionShareBps,
      status: r.status,
      ticketsSold,
      revenueAttributedCents,
      subCommissionOwedCents,
    };
  });

  return { team };
}

export async function getEventReferrerDashboard(userId: string) {
  const assignments = await prisma.eventReferrerAssignment.findMany({
    where: {
      assignedUserId: userId,
      status: { in: [EventReferrerStatus.ACTIVE, EventReferrerStatus.INVITED] },
    },
    include: {
      series: { select: { id: true, slug: true, title: true, venue: true } },
      orders: {
        where: { status: "PAID" },
        select: { id: true, subtotalCents: true },
      },
      subCommissionLedger: {
        select: {
          referrerShareCents: true,
          payoutStatus: true,
          influencerRetainedCents: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return assignments.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    referralCode: a.referralCode,
    referralUrl: a.referralUrl,
    qrCodeImageUrl: a.qrCodeImageUrl,
    scopeType: a.scopeType,
    series: a.series,
    status: a.status,
    isCommissionEligible: a.isCommissionEligible,
    commissionMode: a.commissionMode,
    commissionShareBps: a.commissionShareBps,
    ticketsAttributed: a.orders.length,
    revenueAttributedCents: a.orders.reduce(
      (sum, o) => sum + o.subtotalCents,
      0
    ),
    totalEarnedCents: a.subCommissionLedger.reduce(
      (sum, s) => sum + s.referrerShareCents,
      0
    ),
    pendingPayoutCents: a.subCommissionLedger
      .filter((s) => s.payoutStatus === "PENDING")
      .reduce((sum, s) => sum + s.referrerShareCents, 0),
  }));
}
