/**
 * Commission Rule Resolver
 *
 * Walks a priority-ordered list of scopes and returns the first active
 * CommissionRule that matches the current attribution context.
 *
 * Resolution order (first active match wins):
 *   1. PRIVATE_EVENT  / scopeId = assignmentId
 *   2. CAMPAIGN_OFFER / scopeId = assignmentId
 *   3. REFERRER_ACTOR / scopeId = referralActorId
 *   4. VENUE          / scopeId = venueId, tier = actorTier
 *   5. VENUE          / scopeId = venueId (any tier / null)
 *   6. GLOBAL         / tier = actorTier
 *   7. GLOBAL         (any tier / STANDARD)
 *   8. Hardcoded constant fallback — always emits console.warn
 *
 * Fully testable: accepts a `db` parameter so callers can pass a mock.
 */

import type { CommissionRule, CommissionTierType, Prisma } from "@prisma/client";

// The subset of Prisma we actually use — injectable for tests.
export type ResolverDb = {
  commissionRule: {
    findFirst: (args: {
      where: Prisma.CommissionRuleWhereInput;
      orderBy?: Prisma.CommissionRuleOrderByWithRelationInput;
    }) => Promise<CommissionRule | null>;
  };
};

export type ResolverInput = {
  venueId: string;
  referralActorId?: string | null;
  assignmentId?: string | null;   // ReferralAssignment or EventReferrerAssignment id
  isPrivateEvent?: boolean;
  actorTier?: CommissionTierType | null;
};

export const HARDCODED_FALLBACK_RULE: CommissionRule = {
  id: "HARDCODED_FALLBACK",
  tier: "STANDARD",
  scopeType: "GLOBAL",
  scopeId: null,
  revenueBasis: "COMMISSIONABLE_CENTS",
  percentageBps: 500,        // 5 % — matches legacy FALLBACK_COMMISSION_PCT
  percentageCapCents: null,
  perPersonCents: null,
  maxTakeRateBps: null,
  version: 0,
  active: true,
  label: "Hardcoded platform fallback — no rule configured",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

export async function resolveCommissionRule(
  input: ResolverInput,
  db: ResolverDb
): Promise<CommissionRule> {
  const { venueId, referralActorId, assignmentId, isPrivateEvent, actorTier } = input;

  // ── Level 1: PRIVATE_EVENT ───────────────────────────────────────────────
  if (isPrivateEvent && assignmentId) {
    const rule = await db.commissionRule.findFirst({
      where: { scopeType: "PRIVATE_EVENT", scopeId: assignmentId, active: true },
      orderBy: { version: "desc" },
    });
    if (rule) return rule;
  }

  // ── Level 2: CAMPAIGN_OFFER ──────────────────────────────────────────────
  if (assignmentId) {
    const rule = await db.commissionRule.findFirst({
      where: { scopeType: "CAMPAIGN_OFFER", scopeId: assignmentId, active: true },
      orderBy: { version: "desc" },
    });
    if (rule) return rule;
  }

  // ── Level 3: REFERRER_ACTOR ──────────────────────────────────────────────
  if (referralActorId) {
    const rule = await db.commissionRule.findFirst({
      where: { scopeType: "REFERRER_ACTOR", scopeId: referralActorId, active: true },
      orderBy: { version: "desc" },
    });
    if (rule) return rule;
  }

  // ── Level 4: VENUE + tier ────────────────────────────────────────────────
  if (actorTier) {
    const rule = await db.commissionRule.findFirst({
      where: { scopeType: "VENUE", scopeId: venueId, tier: actorTier, active: true },
      orderBy: { version: "desc" },
    });
    if (rule) return rule;
  }

  // ── Level 5: VENUE + STANDARD (default/fallback tier for this venue) ───────
  // `STANDARD` is the canonical "applies to all untiered earners" value since
  // CommissionRule.tier is non-nullable. Do NOT query without a tier constraint:
  // that could return a PREMIUM or PRIVATE_EVENT venue rule for a STANDARD earner.
  if (actorTier !== "STANDARD") {
    // Only run this fallback when the earner is NOT already STANDARD — if they
    // are, level 4 already ran the same query and found nothing; skip to avoid
    // a duplicate DB round-trip.
    const rule = await db.commissionRule.findFirst({
      where: { scopeType: "VENUE", scopeId: venueId, tier: "STANDARD", active: true },
      orderBy: { version: "desc" },
    });
    if (rule) return rule;
  }

  // ── Level 6: GLOBAL + tier ───────────────────────────────────────────────
  if (actorTier) {
    const rule = await db.commissionRule.findFirst({
      where: { scopeType: "GLOBAL", tier: actorTier, scopeId: null, active: true },
      orderBy: { version: "desc" },
    });
    if (rule) return rule;
  }

  // ── Level 7: GLOBAL + STANDARD (explicit default — no open-ended query) ──
  // Constrained to STANDARD so a PREMIUM or PRIVATE_EVENT GLOBAL rule cannot
  // accidentally apply to an untiered/STANDARD earner. The seeded defaults have
  // separate rows per tier; only the STANDARD row acts as the universal fallback.
  {
    const rule = await db.commissionRule.findFirst({
      where: { scopeType: "GLOBAL", tier: "STANDARD", scopeId: null, active: true },
      orderBy: { version: "desc" },
    });
    if (rule) return rule;
  }

  // ── Level 8: Hardcoded constant fallback ─────────────────────────────────
  console.warn("[commissionRuleResolver] commission rule not configured — using hardcoded fallback", {
    venueId,
    referralActorId,
    assignmentId,
    actorTier,
  });
  return HARDCODED_FALLBACK_RULE;
}
