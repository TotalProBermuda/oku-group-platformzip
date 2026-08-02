import { NextResponse } from "next/server";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";
import { getMyReferrals, type ReferralRow } from "@/server/referrals/myReferralsSource";
import type { Prisma } from "@prisma/client";

/**
 * Map a reservation status to the legacy `conversionStage` vocabulary the
 * referrer dashboard front-end still reads. The UI keys primarily off
 * `reservationStatus`; this keeps `conversionStage` consistent for the few
 * branches that fall back to it.
 */
function conversionStageFromReservation(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "PATRONIZED";
    case "SEATED":
    case "ARRIVED":
      return "ARRIVED";
    case "NO_SHOW":
      return "NO_SHOW";
    case "CANCELLED":
      return "LOST";
    default:
      return "INITIATED";
  }
}

/**
 * Build a CommissionEntry where clause for an actor that has no legacy
 * Referrer row. CommissionEntry.referrerId is required in the schema, so
 * actor-only rows (minted after v2 launch) carry referralActorId but may
 * have a placeholder referrerId. Querying by referralActorId alone is the
 * safe path here — there are no legacy rows to double-count.
 */
function commissionWhereForActorOnly(
  actorId: string,
): Prisma.CommissionEntryWhereInput {
  return { referralActorId: actorId };
}

export async function GET() {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Referrer-capable roles — mirrors the /referrer prefix allowed list in
  // src/middleware.ts (keep in sync; Edge runtime cannot import this set).
  const REFERRER_CAPABLE_ROLES = new Set([
    "SUPERADMIN", "REFERRER",
    "TAXI_DRIVER", "HOTEL_CONCIERGE", "CONCIERGE", "TOUR_GUIDE",
    "PROMOTER", "PRIVATE_NETWORK", "INFLUENCER_SUB_REFERRER",
    "INFLUENCER", "PARTNER",
  ]);
  const hasReferrerCapableRole = auth.roles.some((r) => REFERRER_CAPABLE_ROLES.has(r));
  // Capture here so the nested async helper inherits a narrowed (non-null) string.
  const currentUserId: string = auth.userId;

  // Helper: find actor IDs approved by admin via merge-conflict "Link to existing"
  // for this user. Used as fallback when ReferralActor.userId !== currentUserId.
  async function findAdminLinkedActorIds(): Promise<string[]> {
    const rows = await prisma.auditLog.findMany({
      where: {
        action: "referral.actor.admin_identity_link",
        metadata: { path: ["linkedUserId"], equals: currentUserId },
      },
      select: { actorId: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => r.actorId);
  }

  if (!hasReferrerCapableRole) {
    // Check DB: allow if they have a linked actor, legacy referrer, or admin-approved link.
    const [actorCount, legacyCount, adminLinkedIds] = await Promise.all([
      prisma.referralActor.count({ where: { userId: auth.userId } }),
      prisma.referrer.count({ where: { userId: auth.userId } }),
      findAdminLinkedActorIds(),
    ]);
    if (actorCount === 0 && legacyCount === 0 && adminLinkedIds.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // ── Actor-first lookup (v2 path) ─────────────────────────────────────────
  // Try direct userId match first; if the actor is owned by another user but
  // an admin approved a link via the merge-conflict resolution workflow, fall
  // back to the first admin-linked actor id so the incoming user can access
  // their referrer dashboard/profile/feed.
  const ACTOR_INCLUDE = {
    links: { where: { isActive: true }, orderBy: { createdAt: "asc" as const }, take: 1 },
    legacyReferrer: { include: { compensationPlan: true } },
  } as const;

  let actor = await prisma.referralActor.findUnique({
    where: { userId: auth.userId },
    include: ACTOR_INCLUDE,
  });

  if (!actor) {
    const linkedIds = await findAdminLinkedActorIds();
    if (linkedIds.length > 0) {
      actor = await prisma.referralActor.findUnique({
        where: { id: linkedIds[0] },
        include: ACTOR_INCLUDE,
      }) ?? null;
    }
  }

  // ── Legacy fallback ───────────────────────────────────────────────────────
  const legacyReferrer =
    actor?.legacyReferrer ??
    (actor
      ? null
      : await prisma.referrer.findUnique({
          where: { userId: auth.userId },
          include: { compensationPlan: true },
        }));

  if (!actor && !legacyReferrer) {
    return NextResponse.json(
      { error: "No referrer profile linked to this account" },
      { status: 404 },
    );
  }

  // ── Normalised identity fields ────────────────────────────────────────────
  const profileSource: "actor" | "legacy" = actor ? "actor" : "legacy";
  const firstLink = actor?.links[0] ?? null;

  const referrerPayload = actor
    ? {
        id: actor.id,
        fullName: actor.displayName,
        referrerType: actor.actorTypeCode ?? actor.actorType,
        actorTypeCode: actor.actorTypeCode ?? null,
        referralCode: firstLink?.code ?? null,
        organizationName: actor.organizationName ?? null,
        phone: actor.phone ?? null,
        isActive: actor.status === "ACTIVE",
        compensationPlan: legacyReferrer?.compensationPlan
          ? {
              name: legacyReferrer.compensationPlan.name,
              modelType: legacyReferrer.compensationPlan.modelType,
              flatPerCoverCents: legacyReferrer.compensationPlan.flatPerCoverCents,
              flatPerPartyCents: legacyReferrer.compensationPlan.flatPerPartyCents,
              commissionPercent: legacyReferrer.compensationPlan.commissionPercent,
            }
          : null,
        profileSource,
      }
    : {
        id: legacyReferrer!.id,
        fullName: legacyReferrer!.fullName,
        referrerType: legacyReferrer!.referrerType,
        actorTypeCode: null,
        referralCode: legacyReferrer!.referralCode,
        organizationName: legacyReferrer!.organizationName ?? null,
        phone: legacyReferrer!.phone ?? null,
        isActive: legacyReferrer!.isActive,
        compensationPlan: legacyReferrer!.compensationPlan
          ? {
              name: legacyReferrer!.compensationPlan.name,
              modelType: legacyReferrer!.compensationPlan.modelType,
              flatPerCoverCents: legacyReferrer!.compensationPlan.flatPerCoverCents,
              flatPerPartyCents: legacyReferrer!.compensationPlan.flatPerPartyCents,
              commissionPercent: legacyReferrer!.compensationPlan.commissionPercent,
            }
          : null,
        profileSource,
      };

  // ── Referral feed ─────────────────────────────────────────────────────────
  // Comes from the ONE shared "my referrals" source, keyed off
  // AttributionSession — NOT the legacy ReservationAttribution table.
  const myReferrals = await getMyReferrals(auth.userId);
  const referralRows: ReferralRow[] = [...myReferrals.active, ...myReferrals.history];

  // ── Commission totals ─────────────────────────────────────────────────────
  const now = new Date();
  const sixMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // Build earner where: actor path first, fall back to legacy-referrer path.
  let earnerWhere: Prisma.CommissionEntryWhereInput;
  if (legacyReferrer) {
    const earnerScope = await resolveEarnerScopeForReferrer(legacyReferrer.id);
    if (earnerScope) {
      earnerWhere = commissionWhereForEarner(earnerScope);
    } else if (actor) {
      // Legacy referrer exists but earner scope unresolved — fall back to actor.
      earnerWhere = commissionWhereForActorOnly(actor.id);
    } else {
      // True legacy-only (no ReferralActor): query commissions by referrerId directly
      // rather than crashing on actor!.id which is null in this branch.
      earnerWhere = { referrerId: legacyReferrer.id };
    }
  } else {
    // Actor exists, no legacy Referrer row — actor path.
    earnerWhere = commissionWhereForActorOnly(actor!.id);
  }

  const [commissions, trendCommissions] = await Promise.all([
    prisma.commissionEntry.findMany({
      where: earnerWhere,
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.commissionEntry.findMany({
      where: {
        ...earnerWhere,
        status: { in: ["APPROVED", "PAID"] },
        createdAt: { gte: sixMonthStart },
      },
      select: { amountCents: true, createdAt: true },
    }),
  ]);

  // Bucket trendCommissions into 6 monthly buckets keyed YYYY-MM.
  const monthlyBuckets: { key: string; cents: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyBuckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      cents: 0,
    });
  }
  const monthlyIdx = new Map(monthlyBuckets.map((b, i) => [b.key, i]));
  for (const c of trendCommissions) {
    const k = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const i = monthlyIdx.get(k);
    if (i != null) monthlyBuckets[i].cents += c.amountCents;
  }

  const pendingCents = commissions
    .filter((c) => c.status === "PENDING")
    .reduce((s, c) => s + c.amountCents, 0);
  const approvedCents = commissions
    .filter((c) => c.status === "APPROVED")
    .reduce((s, c) => s + c.amountCents, 0);
  const paidCents = commissions
    .filter((c) => c.status === "PAID")
    .reduce((s, c) => s + c.amountCents, 0);
  const totalEarnedCents = commissions.reduce((s, c) => s + c.amountCents, 0);

  const reservationRows = referralRows.filter((r) => r.source !== "TICKET_PURCHASE");
  const totalReferrals = reservationRows.length;
  const seatedCount = reservationRows.filter(
    (r) => r.reservationStatus === "COMPLETED",
  ).length;
  const arrivedCount = reservationRows.filter(
    (r) =>
      r.reservationStatus != null &&
      ["ARRIVED", "SEATED", "COMPLETED"].includes(r.reservationStatus),
  ).length;

  const toAttribution = (r: ReferralRow, bucket: "active" | "history") => ({
    id: r.attributionSessionId,
    reservationId: r.reservationId,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    partySize: r.partySize,
    conceptRequested: r.conceptRequested,
    reservationDate: r.reservationDate ?? r.ticketPurchaseDate,
    reservationStatus: r.reservationStatus,
    conversionStage: conversionStageFromReservation(r.reservationStatus ?? ""),
    lossReason: null,
    createdAt: r.reservationDate ?? r.ticketPurchaseDate,
    attributionKind: r.attributionKind,
    tableTotalCents: r.money.contributionCents,
    commissionAmountCents: r.money.commissionCents,
    commissionState: r.money.commissionState,
    bucket,
  });

  return NextResponse.json({
    referrer: referrerPayload,
    stats: {
      totalReferrals,
      arrivedCount,
      seatedCount,
      pendingCents,
      approvedCents,
      paidCents,
      totalEarnedCents,
    },
    monthlyEarnings: monthlyBuckets,
    commissions: commissions.map((c) => ({
      id: c.id,
      amountCents: c.amountCents,
      status: c.status,
      reservationId: c.reservationId,
      covers: c.covers,
      createdAt: c.createdAt,
    })),
    attributions: [
      ...myReferrals.active.map((r) => toAttribution(r, "active")),
      ...myReferrals.history.map((r) => toAttribution(r, "history")),
    ],
  });
}
