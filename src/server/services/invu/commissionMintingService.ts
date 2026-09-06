import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueLedgerEvent } from "@/server/services/ledger/ledgerOutboxService";
import { resolveCommissionRule } from "./commissionRuleResolver";
import { computeCommission, type FinancialSnapshot } from "./commissionCalculator";

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
 * regardless of how many times it is invoked.
 *
 * Commission calculation uses the rule engine (commissionRuleResolver +
 * commissionCalculator) rather than a flat percentage.
 *
 * Service-charge policy:
 *   If venue.serviceChargePolicy = INCLUDED_UNKNOWN, the allocation is
 *   created with status = HELD_FOR_REVIEW and no LedgerEntry is bridged.
 *
 * INVU basis correctness:
 *   For COMMISSIONABLE_CENTS basis, grossCents is already post-discount and
 *   tipCents is not in grossCents. Do NOT subtract discount or tip again.
 */

type EarnerResolution = {
  earnerType: "HOST" | "REFERRER";
  earnerRefId: string;
  referralActorId: string | null;
  assignmentId: string | null;
};

async function resolveProfileIdForUser(userId: string): Promise<string | null> {
  const link = await prisma.accountProfileLink.findFirst({
    where: { userId },
    select: { profileId: true },
  });
  return link?.profileId ?? null;
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
      venueId: true,
      grossCents: true,
      discountCents: true,
      taxCents: true,
      tipCents: true,
      refundCents: true,
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
          // Proof-chain context: the exact ReferralLink that generated this
          // booking. Used to resolve the specific ReferralAssignment for
          // CAMPAIGN_OFFER and PRIVATE_EVENT commission rule scoping.
          referralLinkId: true,
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
      invuOrders: {
        select: { id: true, guestCount: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      venue: {
        select: { serviceChargePolicy: true },
      },
    },
  });

  const result: MintResult = { minted: [], skipped: [] };

  if (!session) return result;

  // Hard guard: only AUTO matches with eligible status produce automatic
  // commission. Review-pending / unmatched / override paths must go through
  // explicit admin action.
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

  // ── Resolve HOST earner ────────────────────────────────────────────────────
  let hostEarnerRefId: string | null = null;
  if (session.attributionSession?.hostProfileId) {
    hostEarnerRefId = session.attributionSession.hostProfileId;
  } else if (session.attributionSession?.hostUserId) {
    hostEarnerRefId = await resolveProfileIdForUser(session.attributionSession.hostUserId);
  } else if (session.reservation?.assignedRestaurantHostId) {
    hostEarnerRefId = session.reservation.assignedRestaurantHostId;
  }

  // ── Resolve REFERRER earner ────────────────────────────────────────────────
  let referrerEarnerRefId: string | null = null;
  let referrerActorId: string | null = null;
  if (session.attributionSession?.referralActorId) {
    referrerEarnerRefId = session.attributionSession.referralActorId;
    referrerActorId = session.attributionSession.referralActorId;
  } else if (session.attributionSession?.legacyReferrerId) {
    referrerEarnerRefId = session.attributionSession.legacyReferrerId;
  } else if (session.reservation?.attributions?.[0]?.referrerId) {
    referrerEarnerRefId = session.reservation.attributions[0].referrerId;
  }

  // ── Resolve host ReferralActor for tier context ────────────────────────────
  // The hostEarnerRefId may be a RestaurantHostProfile.id. We try to resolve
  // the linked User → ReferralActor so the resolver can apply tier-based rules.
  let hostActorId: string | null = null;
  let hostActorTier: import("@prisma/client").CommissionTierType | null = null;
  if (hostEarnerRefId) {
    // Try direct ReferralActor lookup (if earnerRefId happens to be an actor id)
    const directActor = await prisma.referralActor.findUnique({
      where: { id: hostEarnerRefId },
      select: { id: true, commissionTier: true },
    }).catch(() => null);
    if (directActor) {
      hostActorId = directActor.id;
      hostActorTier = directActor.commissionTier;
    } else {
      // RestaurantHostProfile.id → userId → ReferralActor
      const hp = await prisma.restaurantHostProfile.findUnique({
        where: { id: hostEarnerRefId },
        select: { userId: true },
      }).catch(() => null);
      if (hp?.userId) {
        const actorViaUser = await prisma.referralActor.findUnique({
          where: { userId: hp.userId },
          select: { id: true, commissionTier: true },
        }).catch(() => null);
        if (actorViaUser) {
          hostActorId = actorViaUser.id;
          hostActorTier = actorViaUser.commissionTier;
        }
      }
    }
  }

  // ── Resolve referrer assignment context from booking provenance ───────────
  // Use the exact ReferralLink that generated this booking — AttributionSession
  // stores referralLinkId which points to a ReferralLink row that carries the
  // specific ReferralAssignment ID. This is the only correct anchor; picking
  // "most recent active assignment" would bleed CAMPAIGN_OFFER or PRIVATE_EVENT
  // commission rates from unrelated offers onto this booking.
  let referrerAssignmentId: string | null = null;
  let referrerIsPrivateEvent = false;
  if (referrerActorId && session.attributionSession?.referralLinkId) {
    const link = await prisma.referralLink.findUnique({
      where: { id: session.attributionSession.referralLinkId },
      select: {
        referralAssignmentId: true,
        referralAssignment: { select: { offerType: true } },
      },
    }).catch(() => null);
    if (link?.referralAssignmentId) {
      referrerAssignmentId = link.referralAssignmentId;
      referrerIsPrivateEvent = link.referralAssignment?.offerType === "PRIVATE_DINING";
    }
  }
  // If no referralLinkId on the session (legacy / walkin / host-only bookings),
  // no assignment scope applies — the resolver falls through to VENUE/GLOBAL rules.

  const earners: EarnerResolution[] = [];

  if (hostEarnerRefId) {
    earners.push({
      earnerType: "HOST",
      earnerRefId: hostEarnerRefId,
      referralActorId: hostActorId,
      assignmentId: null,
    });
  }

  if (referrerEarnerRefId) {
    earners.push({
      earnerType: "REFERRER",
      earnerRefId: referrerEarnerRefId,
      referralActorId: referrerActorId,
      assignmentId: referrerAssignmentId,
    });
  }

  if (earners.length === 0) {
    return result;
  }

  // ── Build financial snapshot (same for all earners) ───────────────────────
  const snapshot: FinancialSnapshot = {
    grossCents: session.grossCents,
    taxCents: session.taxCents,
    tipCents: session.tipCents,
    discountCents: session.discountCents,
    refundCents: session.refundCents,
    commissionableCents: session.commissionableCents,
  };

  // ── guestCount from the most recent InvuOrderNormalized ───────────────────
  const guestCount = session.invuOrders[0]?.guestCount ?? null;
  const sourceCheckId = session.invuOrders[0]?.id ?? null;

  for (const earner of earners) {
    // ── Resolve actor tier for rule lookup ───────────────────────────────────
    // Host earners already resolved above; referrer earners need a DB lookup.
    let actorTier: import("@prisma/client").CommissionTierType | null = null;
    let actorCommissionEligible = true;
    if (earner.earnerType === "HOST") {
      actorTier = hostActorTier;
      if (earner.referralActorId) {
        const actor = await prisma.referralActor.findUnique({
          where: { id: earner.referralActorId },
          select: { commissionEligible: true },
        }).catch(() => null);
        actorCommissionEligible = actor?.commissionEligible ?? false;
      }
    } else if (earner.referralActorId) {
      const actor = await prisma.referralActor.findUnique({
        where: { id: earner.referralActorId },
        select: { commissionTier: true, commissionEligible: true },
      }).catch(() => null);
      actorTier = actor?.commissionTier ?? null;
      actorCommissionEligible = actor?.commissionEligible ?? false;
    }

    if (!actorCommissionEligible) {
      result.skipped.push({
        earnerType: earner.earnerType,
        earnerRefId: earner.earnerRefId,
        reason: "referral_actor_not_commission_eligible",
      });
      continue;
    }

    // isPrivateEvent only applies to REFERRER earners (private dining assignment)
    const isPrivateEvent = earner.earnerType === "REFERRER" ? referrerIsPrivateEvent : false;

    // ── Resolve rule ──────────────────────────────────────────────────────────
    const rule = await resolveCommissionRule(
      {
        venueId: session.venueId,
        referralActorId: earner.referralActorId,
        assignmentId: earner.assignmentId,
        isPrivateEvent,
        actorTier,
      },
      prisma
    );

    // ── Service-charge policy gate ────────────────────────────────────────────
    const serviceChargePolicy = session.venue?.serviceChargePolicy ?? "ABSENT";
    if (serviceChargePolicy === "INCLUDED_UNKNOWN") {
      // Create allocation in HELD_FOR_REVIEW — no LedgerEntry bridging.
      // Idempotency: skip if a held allocation already exists for this earner.
      const existingHeld = await prisma.commissionAllocation.findFirst({
        where: {
          tableSessionId: session.id,
          earnerType: earner.earnerType,
          earnerRefId: earner.earnerRefId,
          status: { in: ["HELD_FOR_REVIEW", "HELD_FOR_BENEFICIARY_MAPPING"] },
        },
        select: { id: true },
      });
      if (!existingHeld) {
        // Propagate errors — do not swallow, so callers can see failures.
        const heldAlloc = await prisma.commissionAllocation.create({
          data: {
            tableSessionId: session.id,
            earnerType: earner.earnerType,
            earnerRefId: earner.earnerRefId,
            amountCents: 0,
            currency: "USD",
            status: "HELD_FOR_REVIEW",
            commissionRuleSnapshot: {
              reason: "service_charge_policy_included_unknown",
              ruleId: rule.id,
            } as Prisma.InputJsonValue,
            revenueBasis: rule.revenueBasis,
            ruleVersionId: rule.id === "HARDCODED_FALLBACK" ? null : rule.id,
            grossCentsSnapshot: snapshot.grossCents,
            taxCentsSnapshot: snapshot.taxCents,
            tipCentsSnapshot: snapshot.tipCents,
            discountCentsSnapshot: snapshot.discountCents,
            refundCentsSnapshot: snapshot.refundCents,
            sourceCheckId,
            confidenceClass: "MANUAL_REVIEW_EVENT",
          },
          select: { id: true },
        });
        await enqueueLedgerEvent(prisma, {
          eventType: "POS_CHECK_CLOSED",
          source: { system: "commission_minting", connector: "invu_auto_match", recordId: null },
          confidenceClass: "MANUAL_REVIEW_EVENT",
          idempotencyKey: `commission_allocation:${heldAlloc.id}:held_service_charge`,
          commissionAllocationId: heldAlloc.id,
          attributionSessionId: session.attributionSession?.id ?? null,
          payload: {
            tableSessionId: session.id,
            allocationId: heldAlloc.id,
            reason: "service_charge_policy_included_unknown",
          },
        });
      }
      result.skipped.push({
        earnerType: earner.earnerType,
        earnerRefId: earner.earnerRefId,
        reason: "held_service_charge_unknown",
      });
      continue;
    }

    // ── Formula ───────────────────────────────────────────────────────────────
    const trace = computeCommission({ snapshot, guestCount, rule });

    // MANUAL_REVIEW basis: persist a HELD_FOR_REVIEW allocation so ops can
    // manually set the eligible amount. Do not silently skip — the work item
    // must be traceable.
    if (trace.requiresManualReview) {
      // Idempotency: skip creation if a held allocation already exists.
      const existingManualHeld = await prisma.commissionAllocation.findFirst({
        where: {
          tableSessionId: session.id,
          earnerType: earner.earnerType,
          earnerRefId: earner.earnerRefId,
          status: { in: ["HELD_FOR_REVIEW", "HELD_FOR_BENEFICIARY_MAPPING"] },
        },
        select: { id: true },
      });
      if (!existingManualHeld) {
        // Propagate errors — callers see real failures.
        const heldAlloc = await prisma.commissionAllocation.create({
          data: {
            tableSessionId: session.id,
            earnerType: earner.earnerType,
            earnerRefId: earner.earnerRefId,
            amountCents: 0,
            currency: "USD",
            status: "HELD_FOR_REVIEW",
            commissionRuleSnapshot: {
              reason: "manual_review_basis",
              ruleId: rule.id,
            } as Prisma.InputJsonValue,
            revenueBasis: rule.revenueBasis,
            ruleVersionId: rule.id === "HARDCODED_FALLBACK" ? null : rule.id,
            grossCentsSnapshot: snapshot.grossCents,
            taxCentsSnapshot: snapshot.taxCents,
            tipCentsSnapshot: snapshot.tipCents,
            discountCentsSnapshot: snapshot.discountCents,
            refundCentsSnapshot: snapshot.refundCents,
            sourceCheckId,
            confidenceClass: "MANUAL_REVIEW_EVENT",
          },
          select: { id: true },
        });
        await enqueueLedgerEvent(prisma, {
          eventType: "POS_CHECK_CLOSED",
          source: { system: "commission_minting", connector: "invu_auto_match", recordId: null },
          confidenceClass: "MANUAL_REVIEW_EVENT",
          idempotencyKey: `commission_allocation:${heldAlloc.id}:held_manual_review`,
          commissionAllocationId: heldAlloc.id,
          attributionSessionId: session.attributionSession?.id ?? null,
          payload: {
            tableSessionId: session.id,
            allocationId: heldAlloc.id,
            reason: "manual_review_basis",
          },
        });
      }
      result.skipped.push({
        earnerType: earner.earnerType,
        earnerRefId: earner.earnerRefId,
        reason: "held_manual_review_basis",
      });
      continue;
    }

    if (trace.finalCommissionCents <= 0) {
      result.skipped.push({
        earnerType: earner.earnerType,
        earnerRefId: earner.earnerRefId,
        reason: "zero_amount",
      });
      continue;
    }

    const amountCents = trace.finalCommissionCents;

    // ── Idempotency check ─────────────────────────────────────────────────────
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
      result.skipped.push({
        earnerType: earner.earnerType,
        earnerRefId: earner.earnerRefId,
        reason: "already_exists",
      });
      continue;
    }

    // ── Mint allocation ───────────────────────────────────────────────────────
    let created: { id: string; amountCents: number };
    try {
      created = await prisma.$transaction(async (tx) => {
        const alloc = await tx.commissionAllocation.create({
          data: {
            tableSessionId: session.id,
            earnerType: earner.earnerType,
            earnerRefId: earner.earnerRefId,
            amountCents,
            currency: "USD",
            status: "PENDING",
            commissionRuleSnapshot: {
              ruleId: rule.id,
              ruleTier: rule.tier,
              ruleScopeType: rule.scopeType,
              ruleVersion: rule.version,
              source: "invu_auto_match",
              matchTier: session.matchTier ?? null,
              mintedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
            // ── Trace columns ────────────────────────────────────────────────
            revenueBasis: trace.revenueBasis,
            ruleVersionId: rule.id === "HARDCODED_FALLBACK" ? null : rule.id,
            grossCentsSnapshot: snapshot.grossCents,
            taxCentsSnapshot: snapshot.taxCents,
            tipCentsSnapshot: snapshot.tipCents,
            discountCentsSnapshot: snapshot.discountCents,
            refundCentsSnapshot: snapshot.refundCents,
            eligibleNetRevenueCents: trace.eligibleNetRevenueCents,
            guestCount: trace.guestCount,
            percentageComponentCents: trace.percentageComponentCents,
            percentageCapAppliedCents: trace.percentageCapAppliedCents,
            perPersonComponentCents: trace.perPersonComponentCents,
            maxTakeRateCapCents: trace.maxTakeRateCapCents,
            finalCommissionCents: trace.finalCommissionCents,
            sourceCheckId,
            confidenceClass: "VERIFIED_POS_EVENT",
          },
          select: { id: true, amountCents: true },
        });

        // Outbox write atomic with the allocation.
        await enqueueLedgerEvent(tx, {
          eventType: "POS_CHECK_CLOSED",
          source: {
            system: "commission_minting",
            connector: "invu_auto_match",
            recordId: null,
          },
          confidenceClass: "VERIFIED_POS_EVENT",
          idempotencyKey: `commission_allocation:${alloc.id}:minted`,
          commissionAllocationId: alloc.id,
          attributionSessionId: session.attributionSession?.id ?? null,
          payload: {
            tableSessionId: session.id,
            allocationId: alloc.id,
            earnerType: earner.earnerType,
            earnerRefId: earner.earnerRefId,
            amountCents: alloc.amountCents,
            ruleId: rule.id,
            revenueBasis: trace.revenueBasis,
            eligibleNetRevenueCents: trace.eligibleNetRevenueCents,
            finalCommissionCents: trace.finalCommissionCents,
            matchTier: session.matchTier ?? null,
          },
        });
        return alloc;
      });
    } catch (err) {
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
          actorId: "system:commission-minting",
          action: "INVU_COMMISSION_AUTOMINT",
          metadata: {
            tableSessionId: session.id,
            allocationId: created.id,
            earnerType: earner.earnerType,
            earnerRefId: earner.earnerRefId,
            amountCents: created.amountCents,
            ruleId: rule.id,
            revenueBasis: trace.revenueBasis,
            matchTier: session.matchTier ?? null,
          },
        },
      });
    } catch {
      // swallow
    }

    result.minted.push({
      earnerType: earner.earnerType,
      earnerRefId: earner.earnerRefId,
      amountCents: created.amountCents,
    });
  }

  return result;
}
