import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveCommissionRule,
  HARDCODED_FALLBACK_RULE,
  type ResolverDb,
} from "@/server/services/invu/commissionRuleResolver";
import type { CommissionRule } from "@prisma/client";

function makeRule(overrides: Partial<CommissionRule> = {}): CommissionRule {
  return {
    id: "rule_" + Math.random().toString(36).slice(2),
    tier: "STANDARD",
    scopeType: "GLOBAL",
    scopeId: null,
    revenueBasis: "COMMISSIONABLE_CENTS",
    percentageBps: 500,
    percentageCapCents: null,
    perPersonCents: null,
    maxTakeRateBps: null,
    version: 1,
    active: true,
    label: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockDb(rules: CommissionRule[]): ResolverDb {
  return {
    commissionRule: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const match = rules.find((r) => {
          if (!r.active && where.active === true) return false;
          if (where.scopeType && r.scopeType !== where.scopeType) return false;
          if (Object.prototype.hasOwnProperty.call(where, "scopeId")) {
            if (r.scopeId !== (where.scopeId ?? null)) return false;
          }
          if (where.tier && r.tier !== where.tier) return false;
          return true;
        });
        return match ?? null;
      }),
    },
  };
}

describe("commissionRuleResolver — resolution order", () => {
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("PRIVATE_EVENT scoped rule beats REFERRER_ACTOR rule", async () => {
    const privateRule = makeRule({ scopeType: "PRIVATE_EVENT", scopeId: "assign_1", tier: "STANDARD" });
    const actorRule = makeRule({ scopeType: "REFERRER_ACTOR", scopeId: "actor_1", tier: "STANDARD" });
    const db = makeMockDb([privateRule, actorRule]);

    const result = await resolveCommissionRule(
      {
        venueId: "venue_1",
        referralActorId: "actor_1",
        assignmentId: "assign_1",
        isPrivateEvent: true,
        actorTier: "STANDARD",
      },
      db
    );
    expect(result.id).toBe(privateRule.id);
  });

  it("REFERRER_ACTOR beats VENUE rule", async () => {
    const actorRule = makeRule({ scopeType: "REFERRER_ACTOR", scopeId: "actor_1" });
    const venueRule = makeRule({ scopeType: "VENUE", scopeId: "venue_1" });
    const db = makeMockDb([actorRule, venueRule]);

    const result = await resolveCommissionRule(
      { venueId: "venue_1", referralActorId: "actor_1", actorTier: null },
      db
    );
    expect(result.id).toBe(actorRule.id);
  });

  it("VENUE + tier beats VENUE without tier", async () => {
    const venueTierRule = makeRule({ scopeType: "VENUE", scopeId: "venue_1", tier: "TRUSTED" });
    const venueRule = makeRule({ scopeType: "VENUE", scopeId: "venue_1", tier: "STANDARD" });
    const db = makeMockDb([venueTierRule, venueRule]);

    const result = await resolveCommissionRule(
      { venueId: "venue_1", actorTier: "TRUSTED" },
      db
    );
    expect(result.id).toBe(venueTierRule.id);
  });

  it("GLOBAL + tier before plain GLOBAL", async () => {
    const globalTierRule = makeRule({ scopeType: "GLOBAL", tier: "PREMIUM", scopeId: null });
    const globalRule = makeRule({ scopeType: "GLOBAL", tier: "STANDARD", scopeId: null });
    const db = makeMockDb([globalTierRule, globalRule]);

    const result = await resolveCommissionRule(
      { venueId: "venue_1", actorTier: "PREMIUM" },
      db
    );
    expect(result.id).toBe(globalTierRule.id);
  });

  it("hardcoded fallback → console.warn emitted when no rules configured", async () => {
    const db = makeMockDb([]);

    const result = await resolveCommissionRule(
      { venueId: "venue_1", actorTier: null },
      db
    );
    expect(result.id).toBe(HARDCODED_FALLBACK_RULE.id);
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("commission rule not configured"),
      expect.any(Object)
    );
  });

  it("PRIVATE_EVENT scope only checked when isPrivateEvent=true", async () => {
    const privateRule = makeRule({
      scopeType: "PRIVATE_EVENT",
      scopeId: "assign_1",
    });
    const globalRule = makeRule({ scopeType: "GLOBAL" });
    const db = makeMockDb([privateRule, globalRule]);

    // isPrivateEvent=false — private event rule should NOT match
    const result = await resolveCommissionRule(
      { venueId: "venue_1", assignmentId: "assign_1", isPrivateEvent: false, actorTier: null },
      db
    );
    expect(result.id).toBe(globalRule.id);
  });
});

describe("commissionRuleResolver — tier isolation (no cross-contamination)", () => {
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("STANDARD/null earner NEVER gets a PREMIUM or PRIVATE_EVENT rule at level 7", async () => {
    // All four seeded GLOBAL rules exist at the same version=1.
    // A null-tier earner must only match STANDARD — NOT PREMIUM or PRIVATE_EVENT.
    const premiumGlobal = makeRule({ tier: "PREMIUM", scopeType: "GLOBAL", percentageBps: 800 });
    const privateEventGlobal = makeRule({ tier: "PRIVATE_EVENT", scopeType: "GLOBAL", percentageBps: 1000 });
    const standardGlobal = makeRule({ tier: "STANDARD", scopeType: "GLOBAL", percentageBps: 500 });

    // Mock always returns the first match — order matters to expose the bug
    // if the constraint is missing. We put PREMIUM first deliberately.
    const db: ResolverDb = {
      commissionRule: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const candidates = [premiumGlobal, privateEventGlobal, standardGlobal];
          return candidates.find((r) => {
            if (where.active === true && !r.active) return false;
            if (where.scopeType && r.scopeType !== where.scopeType) return false;
            if (Object.prototype.hasOwnProperty.call(where, "scopeId")) {
              if (r.scopeId !== (where.scopeId ?? null)) return false;
            }
            if (where.tier && r.tier !== where.tier) return false;
            return true;
          }) ?? null;
        }),
      },
    };

    const result = await resolveCommissionRule(
      { venueId: "venue_1", actorTier: null },
      db
    );
    expect(result.id).toBe(standardGlobal.id);
    expect(result.percentageBps).toBe(500); // STANDARD, not PREMIUM (800) or PRIVATE_EVENT (1000)
  });

  it("STANDARD actorTier earner NEVER gets a PREMIUM GLOBAL rule", async () => {
    const premiumGlobal = makeRule({ tier: "PREMIUM", scopeType: "GLOBAL", percentageBps: 800 });
    const standardGlobal = makeRule({ tier: "STANDARD", scopeType: "GLOBAL", percentageBps: 500 });

    const db = makeMockDb([premiumGlobal, standardGlobal]);

    const result = await resolveCommissionRule(
      { venueId: "venue_1", actorTier: "STANDARD" },
      db
    );
    expect(result.id).toBe(standardGlobal.id);
    expect(result.percentageBps).toBe(500);
  });

  it("PREMIUM earner gets PREMIUM GLOBAL rule, not STANDARD", async () => {
    const premiumGlobal = makeRule({ tier: "PREMIUM", scopeType: "GLOBAL", percentageBps: 800 });
    const standardGlobal = makeRule({ tier: "STANDARD", scopeType: "GLOBAL", percentageBps: 500 });

    const db = makeMockDb([premiumGlobal, standardGlobal]);

    const result = await resolveCommissionRule(
      { venueId: "venue_1", actorTier: "PREMIUM" },
      db
    );
    expect(result.id).toBe(premiumGlobal.id);
    expect(result.percentageBps).toBe(800);
  });

  it("null-tier earner falls back to VENUE STANDARD rule when no GLOBAL STANDARD exists", async () => {
    const venueStandard = makeRule({ tier: "STANDARD", scopeType: "VENUE", scopeId: "venue_1", percentageBps: 400 });
    // GLOBAL has only a PREMIUM rule — must NOT contaminate null-tier earners
    const premiumGlobal = makeRule({ tier: "PREMIUM", scopeType: "GLOBAL", percentageBps: 800 });

    const db = makeMockDb([venueStandard, premiumGlobal]);

    const result = await resolveCommissionRule(
      { venueId: "venue_1", actorTier: null },
      db
    );
    expect(result.id).toBe(venueStandard.id);
    expect(result.percentageBps).toBe(400);
  });

  it("version ordering: highest version wins within same tier/scope", async () => {
    const v1 = makeRule({ tier: "STANDARD", scopeType: "GLOBAL", percentageBps: 500, version: 1 });
    const v2 = makeRule({ tier: "STANDARD", scopeType: "GLOBAL", percentageBps: 600, version: 2 });

    // makeMockDb picks first match — to simulate version desc ordering, put v2 first
    const db = makeMockDb([v2, v1]);

    const result = await resolveCommissionRule(
      { venueId: "venue_1", actorTier: "STANDARD" },
      db
    );
    expect(result.percentageBps).toBe(600); // v2
  });
});
