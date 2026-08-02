import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitLedgerEvent } from "@/server/services/ledger/ledgerEventService";

/**
 * Commission minting for the deterministic INVU trust chain.
 *
 * Mints `CommissionAllocation` rows from a closed, AUTO-matched TableSession.
 * Earner identity is resolved in priority order:
 *
 *   HOST:
 *     1. AttributionSession.hostProfileId (preferred — explicit profile id)
 *     2. AttributionSession.hostUserId    (look up Profile via AccountProfileLink)
 *     3. Reservation.assignedRestaurantHostId (legacy / Tier-3 path)
 *
 *   REFERRER:
 *     1. AttributionSession.referralActorId
 *     2. AttributionSession.legacyReferrerId
 *     3. Reservation.attributions[0].referrerId (legacy)
 *
 * The function is fully idempotent: it will not create a duplicate
 * allocation for the same (tableSessionId, earnerType, earnerRefId)
 * regardless of how many times it is invoked. Callers that update the
 * commissionable amount on a TableSession should NOT use this function to
 * back-edit existing allocations — that requires an explicit recompute /
 * reverse-and-re-mint flow handled in the admin revenue surface.
 *
 * Tier-3 (heuristic) matches MUST NOT mint here. Only AUTO_MATCHED with
 * Tier-1 or Tier-2 trust is eligible. The caller (aggregation pipeline)
 * is responsible for that gating.
 */

const FALLBACK_COMMISSION_PCT = 5;

type EarnerResolution = {
  earnerType: "HOST" | "REFERRER";
  earnerRefId: string;
  pct: number;
  planSource: "compensation_plan" | "fallback";
};

async function resolveProfileIdForUser(userId: string): Promise<string | null> {
  const link = await prisma.accountProfileLink.findFirst({
    where: { userId },
    select: { profileId: true },
  });
  return link?.profileId ?? null;
}

async function lookupCompensationPctForProfile(
  profileId: string | null
): Promise<number | null> {
  if (!profileId) return null;
  const settings = await prisma.profileCompensationSettings.findUnique({
    where: { profileId },
    select: { compensationPlanId: true },
  });
  if (!settings?.compensationPlanId) return null;
  const plan = await prisma.compensationPlan.findUnique({
    where: { id: settings.compensationPlanId },
    select: { commissionPercent: true, isActive: true },
  });
  if (!plan?.isActive || plan.commissionPercent == null) return null;
  return Number(plan.commissionPercent);
}

async function lookupCompensationPctForReferrer(
  referrerId: string
): Promise<number | null> {
  // The earnerRefId can be EITHER a legacy Referrer.id OR a modern
  // ReferralActor.id (the auto-mint resolver above prefers
  // AttributionSession.referralActorId, which is a ReferralActor id).
  // Try the modern path first — it covers host-link referrers (e.g. a
  // streetside host's RAFNH01 EventReferrerAssignment) that have NO
  // legacy Referrer + CompensationPlan at all. If we don't find one
  // there, fall back to the legacy Referrer.compensationPlan path.
  const actor = await prisma.referralActor
    .findUnique({
      where: { id: referrerId },
      select: {
        assignments: {
          where: { isActive: true, isCommissionEligible: true },
          select: { rateBps: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        legacyEventReferrerAssignment: {
          select: { commissionShareBps: true, isCommissionEligible: true },
        },
        legacyReferrer: {
          select: { compensationPlan: { select: { commissionPercent: true, isActive: true } } },
        },
      },
    })
    .catch(() => null);
  if (actor) {
    const a = actor.assignments?.[0];
    if (a?.rateBps && a.rateBps > 0) return a.rateBps / 100;
    const era = actor.legacyEventReferrerAssignment;
    if (era?.isCommissionEligible && era.commissionShareBps && era.commissionShareBps > 0) {
      return era.commissionShareBps / 100;
    }
    const lp = actor.legacyReferrer?.compensationPlan;
    if (lp?.isActive && lp.commissionPercent != null) return Number(lp.commissionPercent);
    // Found the actor row but no rate — that's an explicit "configured but
    // 0%" state. Returning null lets the caller fall back to the platform
    // default rate, which matches legacy behavior for an unconfigured plan.
    return null;
  }

  const referrer = await prisma.referrer
    .findUnique({
      where: { id: referrerId },
      select: { compensationPlan: { select: { commissionPercent: true, isActive: true } } },
    })
    .catch(() => null);
  const plan = referrer?.compensationPlan;
  if (!plan?.isActive || plan.commissionPercent == null) return null;
  return Number(plan.commissionPercent);
}

export type MintResult = {
  minted: Array<{ earnerType: "HOST" | "REFERRER"; earnerRefId: string; amountCents: number }>;
  skipped: Array<{ earnerType: "HOST" | "REFERRER"; earnerRefId: string; reason: string }>;
};

export async function mintCommissionsForTableSession(
  tableSessionId: string
): Promise<MintResult> {
  const session = await prisma.tableSession.findUnique({
    where: { id: tableSessionId },
    select: {
      id: true,
      commissionableCents: true,
      commissionEligibility: true,
      matchStatus: true,
      matchTier: true,
      attributionSession: {
        select: {
          id: true,
          status: true,
          hostProfileId: true,
          hostUserId: true,
          referralActorId: true,
          legacyReferrerId: true,
        },
      },
      reservation: {
        select: {
          assignedRestaurantHostId: true,
          attributions: {
            select: { referrerId: true },
            take: 1,
          },
        },
      },
    },
  });

  const result: MintResult = { minted: [], skipped: [] };

  if (!session) return result;

  // Hard guard: only AUTO matches with eligible status produce automatic
  // commission. Review-pending / unmatched / override paths must go through
  // explicit admin action. The attribution session MUST exist AND have
  // reached VERIFIED_POS_SALE — this is the explicit "loop closed" gate
  // that the INVU match step flips at the same time it sets
  // matchStatus=AUTO_MATCHED. Requiring the session to be present (not just
  // checking status when it happens to exist) closes a contract leak: a
  // legacy TableSession with no attached AttributionSession has no proven
  // attribution chain and must NOT auto-mint — those rows require explicit
  // admin reconciliation through the revenue surface.
  if (
    session.matchStatus !== "AUTO_MATCHED" ||
    session.commissionEligibility !== "ELIGIBLE_AUTO" ||
    !session.commissionableCents ||
    session.commissionableCents <= 0 ||
    !session.attributionSession ||
    session.attributionSession.status !== "VERIFIED_POS_SALE"
  ) {
    return result;
  }

  // Resolve HOST earner
  let hostEarnerRefId: string | null = null;
  if (session.attributionSession?.hostProfileId) {
    hostEarnerRefId = session.attributionSession.hostProfileId;
  } else if (session.attributionSession?.hostUserId) {
    hostEarnerRefId = await resolveProfileIdForUser(session.attributionSession.hostUserId);
  } else if (session.reservation?.assignedRestaurantHostId) {
    hostEarnerRefId = session.reservation.assignedRestaurantHostId;
  }

  // Resolve REFERRER earner
  let referrerEarnerRefId: string | null = null;
  if (session.attributionSession?.referralActorId) {
    referrerEarnerRefId = session.attributionSession.referralActorId;
  } else if (session.attributionSession?.legacyReferrerId) {
    referrerEarnerRefId = session.attributionSession.legacyReferrerId;
  } else if (session.reservation?.attributions?.[0]?.referrerId) {
    referrerEarnerRefId = session.reservation.attributions[0].referrerId;
  }

  const earners: EarnerResolution[] = [];

  if (hostEarnerRefId) {
    const planPct = await lookupCompensationPctForProfile(hostEarnerRefId);
    earners.push({
      earnerType: "HOST",
      earnerRefId: hostEarnerRefId,
      pct: planPct ?? FALLBACK_COMMISSION_PCT,
      planSource: planPct != null ? "compensation_plan" : "fallback",
    });
  }

  if (referrerEarnerRefId) {
    const planPct = await lookupCompensationPctForReferrer(referrerEarnerRefId);
    earners.push({
      earnerType: "REFERRER",
      earnerRefId: referrerEarnerRefId,
      pct: planPct ?? FALLBACK_COMMISSION_PCT,
      planSource: planPct != null ? "compensation_plan" : "fallback",
    });
  }

  if (earners.length === 0) {
    return result;
  }

  for (const earner of earners) {
    const amountCents = Math.round((session.commissionableCents * earner.pct) / 100);
    if (amountCents <= 0) {
      result.skipped.push({ earnerType: earner.earnerType, earnerRefId: earner.earnerRefId, reason: "zero_amount" });
      continue;
    }

    // Idempotency: skip if a non-REVERSED allocation already exists for this
    // (session, earner) pair. Re-mints for revenue corrections must be
    // handled by an explicit reverse-and-remint flow, not here.
    const existing = await prisma.commissionAllocation.findFirst({
      where: {
        tableSessionId: session.id,
        earnerType: earner.earnerType,
        earnerRefId: earner.earnerRefId,
        status: { not: "REVERSED" },
      },
      select: { id: true },
    });
    if (existing) {
      result.skipped.push({ earnerType: earner.earnerType, earnerRefId: earner.earnerRefId, reason: "already_exists" });
      continue;
    }

    let created: { id: string; amountCents: number };
    try {
      created = await prisma.commissionAllocation.create({
        data: {
          tableSessionId: session.id,
          earnerType: earner.earnerType,
          earnerRefId: earner.earnerRefId,
          amountCents,
          currency: "USD",
          status: "PENDING",
          commissionRuleSnapshot: {
            commissionPercent: earner.pct,
            planSource: earner.planSource,
            source: "invu_auto_match",
            matchTier: session.matchTier ?? null,
            commissionableCents: session.commissionableCents,
            mintedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
        select: { id: true, amountCents: true },
      });
    } catch (err) {
      // P2002 = unique constraint violation. Means a concurrent invocation
      // (e.g. parallel sync run, retry after a recoverable failure) won the
      // race and already created the allocation. Treat as a successful no-op.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        result.skipped.push({
          earnerType: earner.earnerType,
          earnerRefId: earner.earnerRefId,
          reason: "race_already_exists",
        });
        continue;
      }
      throw err;
    }

    // Audit (best-effort; never block the mint)
    try {
      await prisma.auditLog.create({
        data: {
          actorId: "system",
          action: "INVU_COMMISSION_AUTOMINT",
          metadata: {
            tableSessionId: session.id,
            allocationId: created.id,
            earnerType: earner.earnerType,
            earnerRefId: earner.earnerRefId,
            amountCents: created.amountCents,
            commissionPercent: earner.pct,
            planSource: earner.planSource,
            matchTier: session.matchTier ?? null,
          },
        },
      });
    } catch {
      // swallow
    }

    // Emit a canonical LedgerEvent for the minted commission.
    // Event type: POS_CHECK_CLOSED — the allocation was produced by an
    // AUTO-matched INVU POS close. This is a financial/POS event, NOT an
    // attribution lifecycle event; ATTRIBUTION_ANCHOR_RESOLVED is reserved
    // for when the attribution session itself is linked to a check, which
    // happens in a separate step.
    // Confidence class: VERIFIED_POS_EVENT — sourced directly from INVU.
    // Best-effort: never block the mint result on an emitter failure.
    try {
      const idempotencyKey = `commission_allocation:${created.id}:minted`;
      await emitLedgerEvent({
        eventType: "POS_CHECK_CLOSED",
        source: {
          system: "commission_minting",
          connector: "invu_auto_match",
          recordId: null, // internal event — no external source record ID
        },
        confidenceClass: "VERIFIED_POS_EVENT",
        idempotencyKey,
        commissionAllocationId: created.id,
        attributionSessionId: session.attributionSession?.id ?? null,
        payload: {
          tableSessionId: session.id,
          allocationId: created.id,
          earnerType: earner.earnerType,
          earnerRefId: earner.earnerRefId,
          amountCents: created.amountCents,
          commissionPercent: earner.pct,
          planSource: earner.planSource,
          matchTier: session.matchTier ?? null,
        },
      });
    } catch (emitErr) {
      console.error(
        "[commissionMintingService] emitLedgerEvent failed (non-blocking)",
        { allocationId: created.id, err: emitErr }
      );
    }

    result.minted.push({
      earnerType: earner.earnerType,
      earnerRefId: earner.earnerRefId,
      amountCents: created.amountCents,
    });
  }

  return result;
}
