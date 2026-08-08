/**
 * Commission Ledger Bridge
 *
 * Bridges an APPROVED CommissionAllocation into a LedgerEntry that the
 * existing payoutBatchService can pick up.
 *
 * Idempotent: if a LedgerEntry already exists for the given allocationId,
 * the function returns without creating a duplicate.
 *
 * Earner resolution:
 *   CommissionAllocation.earnerRefId must resolve to an InfluencerProfile.
 *   The earnerRefId may be a:
 *     - RestaurantHostProfile.id   → look up via RestaurantHostProfile → userId → InfluencerProfile
 *     - ReferralActor.id           → look up via ReferralActor.legacyReferrer → InfluencerProfile
 *     - InfluencerProfile.id       → direct match
 *
 *   If no InfluencerProfile is found, the allocation is moved to
 *   HELD_FOR_BENEFICIARY_MAPPING and no LedgerEntry is created.
 */

import { prisma } from "@/lib/prisma";

export type BridgeResult =
  | { outcome: "bridged"; ledgerEntryId: string }
  | { outcome: "already_bridged"; ledgerEntryId: string }
  | { outcome: "held_for_beneficiary_mapping"; reason: string }
  | { outcome: "skipped"; reason: string };

export async function bridgeAllocationToLedger(
  allocationId: string
): Promise<BridgeResult> {
  // ── Load allocation ───────────────────────────────────────────────────────
  const allocation = await prisma.commissionAllocation.findUnique({
    where: { id: allocationId },
    select: {
      id: true,
      status: true,
      earnerType: true,
      earnerRefId: true,
      amountCents: true,
      currency: true,
      tableSessionId: true,
      ledgerEntries: { select: { id: true }, take: 1 },
    },
  });

  if (!allocation) {
    return { outcome: "skipped", reason: "allocation_not_found" };
  }

  // ── Idempotency: already bridged ─────────────────────────────────────────
  if (allocation.ledgerEntries.length > 0) {
    return {
      outcome: "already_bridged",
      ledgerEntryId: allocation.ledgerEntries[0].id,
    };
  }

  // ── Guard: must be APPROVED ───────────────────────────────────────────────
  if (allocation.status !== "APPROVED") {
    return {
      outcome: "skipped",
      reason: `allocation_status_is_${allocation.status.toLowerCase()}`,
    };
  }

  // ── Resolve InfluencerProfile for the earner ──────────────────────────────
  const influencerProfileId = await resolveInfluencerProfileId(
    allocation.earnerType,
    allocation.earnerRefId
  );

  if (!influencerProfileId) {
    await prisma.commissionAllocation.update({
      where: { id: allocationId },
      data: { status: "HELD_FOR_BENEFICIARY_MAPPING" },
    });
    console.warn("[commissionLedgerBridge] no InfluencerProfile found for earner", {
      allocationId,
      earnerType: allocation.earnerType,
      earnerRefId: allocation.earnerRefId,
    });
    return {
      outcome: "held_for_beneficiary_mapping",
      reason: "no_influencer_profile",
    };
  }

  // ── Atomic: create LedgerEntry + flip allocation to PROCESSING ───────────
  let ledgerEntryId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Final idempotency check inside transaction
      const existingEntry = await tx.ledgerEntry.findUnique({
        where: { commissionAllocationId: allocationId },
        select: { id: true },
      });
      if (existingEntry) {
        return { id: existingEntry.id, alreadyExisted: true };
      }

      const entry = await tx.ledgerEntry.create({
        data: {
          influencerId: influencerProfileId,
          type: "COMMISSION_EARNED",
          amountCents: allocation.amountCents,
          currency: allocation.currency,
          commissionAllocationId: allocationId,
          note: `Commission allocation ${allocationId}`,
        },
        select: { id: true },
      });

      await tx.commissionAllocation.update({
        where: { id: allocationId },
        data: { status: "PROCESSING" },
      });

      return { id: entry.id, alreadyExisted: false };
    });

    ledgerEntryId = result.id;
    if (result.alreadyExisted) {
      return { outcome: "already_bridged", ledgerEntryId };
    }
  } catch (err) {
    // P2002 = duplicate commissionAllocationId — concurrent bridge call won.
    const prismaErr = err as { code?: string };
    if (prismaErr.code === "P2002") {
      const existing = await prisma.ledgerEntry.findUnique({
        where: { commissionAllocationId: allocationId },
        select: { id: true },
      });
      if (existing) {
        return { outcome: "already_bridged", ledgerEntryId: existing.id };
      }
    }
    throw err;
  }

  return { outcome: "bridged", ledgerEntryId };
}

// ── Internal: earner → InfluencerProfile resolution ──────────────────────────

async function resolveInfluencerProfileId(
  earnerType: string,
  earnerRefId: string
): Promise<string | null> {
  // 1. Direct InfluencerProfile match (earnerRefId IS an InfluencerProfile.id)
  const directMatch = await prisma.influencerProfile.findUnique({
    where: { id: earnerRefId },
    select: { id: true },
  });
  if (directMatch) return directMatch.id;

  // 2. ReferralActor path
  const actor = await prisma.referralActor.findUnique({
    where: { id: earnerRefId },
    select: {
      userId: true,
      legacyReferrerId: true,
    },
  });
  if (actor) {
    // 2a. Via legacyReferrerId → Referrer → user → InfluencerProfile
    if (actor.legacyReferrerId) {
      const legacy = await prisma.referrer.findUnique({
        where: { id: actor.legacyReferrerId },
        select: { userId: true },
      });
      if (legacy?.userId) {
        const profileViaLegacy = await prisma.influencerProfile.findFirst({
          where: { userId: legacy.userId },
          select: { id: true },
        });
        if (profileViaLegacy) return profileViaLegacy.id;
      }
    }

    // 2b. Via actor.userId → InfluencerProfile
    if (actor.userId) {
      const profileViaUser = await prisma.influencerProfile.findFirst({
        where: { userId: actor.userId },
        select: { id: true },
      });
      if (profileViaUser) return profileViaUser.id;
    }
  }

  // 3. RestaurantHostProfile path → userId → InfluencerProfile
  const hostProfile = await prisma.restaurantHostProfile.findUnique({
    where: { id: earnerRefId },
    select: { userId: true },
  });
  if (hostProfile?.userId) {
    const profileViaHost = await prisma.influencerProfile.findFirst({
      where: { userId: hostProfile.userId },
      select: { id: true },
    });
    if (profileViaHost) return profileViaHost.id;
  }

  return null;
}
