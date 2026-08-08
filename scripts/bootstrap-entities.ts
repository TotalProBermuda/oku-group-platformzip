/**
 * One-time script to populate Entity records from existing InfluencerProfiles and PartnerProfiles.
 * Run with: npx ts-node scripts/bootstrap-entities.ts
 * Or via:   npx tsx scripts/bootstrap-entities.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Bootstrapping Entity records from existing profiles…\n");

  // ── 1. Influencer profiles → PERSON entities ────────────────────────────
  const influencers = await prisma.influencerProfile.findMany({
    include: { user: { select: { id: true, name: true } } },
  });

  let created = 0;
  let skipped = 0;

  for (const inf of influencers) {
    const existing = await prisma.entity.findUnique({
      where: { linkedInfluencerProfileId: inf.id },
    });
    if (existing) { skipped++; console.log(`  SKIP  [influencer] ${inf.displayName ?? inf.handle ?? inf.refCode}`); continue; }

    const entity = await prisma.entity.create({
      data: {
        type:                      "PERSON",
        displayName:               inf.displayName ?? inf.user?.name ?? inf.handle ?? inf.refCode,
        instagramUrl:              inf.instagramUrl ?? null,
        websiteUrl:                inf.websiteUrl   ?? null,
        description:               inf.shortBio     ?? null,
        logoUrl:                   inf.profileImageUrl ?? null,
        linkedInfluencerProfileId: inf.id,
        linkedUserId:              inf.userId,
      },
    });
    created++;
    console.log(`  CREATE [influencer] ${entity.displayName}  →  ${entity.id}`);
  }

  // ── 2. Partner profiles → COMPANY entities ──────────────────────────────
  const partners = await prisma.partnerProfile.findMany({
    include: { user: { select: { id: true } } },
  });

  for (const p of partners) {
    const existing = await prisma.entity.findFirst({
      where: { linkedUserId: p.userId, type: "COMPANY" },
    });
    if (existing) { skipped++; console.log(`  SKIP  [partner] ${p.name}`); continue; }

    const entity = await prisma.entity.create({
      data: {
        type:         "COMPANY",
        displayName:  p.name,
        linkedUserId: p.userId,
      },
    });
    created++;
    console.log(`  CREATE [partner] ${entity.displayName}  →  ${entity.id}`);
  }

  console.log(`\nDone. Created: ${created}  Skipped (already exists): ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
