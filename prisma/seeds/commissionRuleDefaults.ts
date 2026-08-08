/**
 * Commission Rule Seed Defaults
 *
 * Seeds four GLOBAL CommissionRule rows — one per CommissionTierType.
 * These are STARTING POINTS only. A SUPERADMIN must review and adjust
 * economics before going live. Economics are intentionally NOT hardcoded
 * in application code; this seed file is the single source of truth.
 *
 * Run standalone:
 *   npx tsx prisma/seeds/commissionRuleDefaults.ts
 *
 * Or call seedCommissionRuleDefaults() from your main seed script.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_RULES = [
  {
    tier: "STANDARD" as const,
    label: "Global STANDARD default — 5% (starting point; edit via admin panel)",
    percentageBps: 500,   // 5.00%
    percentageCapCents: null,
    perPersonCents: null,
    maxTakeRateBps: null,
  },
  {
    tier: "TRUSTED" as const,
    label: "Global TRUSTED — 6% (starting point; edit via admin panel)",
    percentageBps: 600,   // 6.00%
    percentageCapCents: null,
    perPersonCents: null,
    maxTakeRateBps: null,
  },
  {
    tier: "PREMIUM" as const,
    label: "Global PREMIUM — 8% (starting point; edit via admin panel)",
    percentageBps: 800,   // 8.00%
    percentageCapCents: null,
    perPersonCents: null,
    maxTakeRateBps: null,
  },
  {
    tier: "PRIVATE_EVENT" as const,
    label: "Global PRIVATE_EVENT — 10% (starting point; edit via admin panel)",
    percentageBps: 1000,  // 10.00%
    percentageCapCents: null,
    perPersonCents: null,
    maxTakeRateBps: null,
  },
] as const;

export async function seedCommissionRuleDefaults(db = prisma) {
  console.log("[seed] Commission rule defaults...");

  for (const rule of DEFAULT_RULES) {
    // Only create if no GLOBAL rule for this tier already exists.
    const existing = await db.commissionRule.findFirst({
      where: { scopeType: "GLOBAL", tier: rule.tier },
      select: { id: true },
    });
    if (existing) {
      console.log(`  [skip] GLOBAL/${rule.tier} already exists`);
      continue;
    }

    await db.commissionRule.create({
      data: {
        tier: rule.tier,
        scopeType: "GLOBAL",
        scopeId: null,
        revenueBasis: "COMMISSIONABLE_CENTS",
        percentageBps: rule.percentageBps,
        percentageCapCents: rule.percentageCapCents,
        perPersonCents: rule.perPersonCents,
        maxTakeRateBps: rule.maxTakeRateBps,
        version: 1,
        active: true,
        label: rule.label,
      },
    });
    console.log(`  [created] GLOBAL/${rule.tier} @ ${rule.percentageBps} bps`);
  }

  console.log("[seed] Commission rule defaults done.");
}

// Run directly when called from CLI
if (require.main === module) {
  seedCommissionRuleDefaults()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
