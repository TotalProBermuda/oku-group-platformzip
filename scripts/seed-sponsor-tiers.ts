import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TIERS = [
  { key: "PRESENTED_BY",     label: "Presented By",     displayOrder: 1, description: "Primary presenting sponsor — highest visibility across all surfaces." },
  { key: "HOSTED_WITH",      label: "Hosted With",      displayOrder: 2, description: "Co-host brand partners with significant event presence." },
  { key: "PARTNER",          label: "Partner",           displayOrder: 3, description: "Official category partners supporting the program." },
  { key: "SUPPORTING_PARTNER", label: "Supporting Partner", displayOrder: 4, description: "Supporting partners with selective placement visibility." },
];

async function main() {
  for (const tier of DEFAULT_TIERS) {
    const existing = await prisma.sponsorTier.findUnique({ where: { key: tier.key } });
    if (!existing) {
      await prisma.sponsorTier.create({ data: tier });
      console.log(`  ✓ Created tier: ${tier.label}`);
    } else {
      await prisma.sponsorTier.update({ where: { key: tier.key }, data: { label: tier.label, displayOrder: tier.displayOrder, description: tier.description } });
      console.log(`  ↺ Updated tier: ${tier.label}`);
    }
  }
  console.log("\nSponsor tiers seeded.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
