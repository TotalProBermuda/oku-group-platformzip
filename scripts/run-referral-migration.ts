import { migrateReferrersToActors, migrateEventReferrersToActors } from "@/server/referrals/referralMigrationService";
import { resolveOrganizationNames, backfillSoleProprietorFlags } from "@/server/referrals/organizationResolver";
import { prisma } from "@/lib/prisma";

/**
 * Run referral migration with optional --strict mode.
 *
 * --strict: exit non-zero when any merge_required conflict is detected.
 *   Without the flag, conflicts are logged and skipped (default behaviour).
 *   Scripts never auto-link an actor owned by another user regardless of mode.
 *
 * Usage:
 *   npx tsx scripts/run-referral-migration.ts
 *   npx tsx scripts/run-referral-migration.ts --strict
 */

const strict = process.argv.includes("--strict");

async function main() {
  if (strict) {
    console.log("=== Running in --strict mode: any merge_required conflict will exit non-zero ===\n");
  }

  console.log("=== Migrating legacy Referrers → ReferralActors ===");
  const r = await migrateReferrersToActors({ strict });
  console.log(JSON.stringify({ migrated: r.migrated, skipped: r.skipped, errors: r.errors }, null, 2));

  if (r.mergeConflicts.length > 0) {
    console.warn(`\n!! merge_required conflicts (${r.mergeConflicts.length}) — actors NOT linked:`);
    for (const c of r.mergeConflicts) {
      console.warn(
        `  referrerId=${c.referrerId}  candidateActorId=${c.candidateActorId}  matchField=${c.matchField}  reason=${c.reason}`
      );
    }
  }

  console.log("\n=== Migrating EventReferrerAssignments → ReferralActors ===");
  const e = await migrateEventReferrersToActors({ strict });
  console.log(JSON.stringify({ migrated: e.migrated, errors: e.errors }, null, 2));

  if (e.mergeConflicts.length > 0) {
    console.warn(`\n!! merge_required conflicts (${e.mergeConflicts.length}) — actors NOT linked:`);
    for (const c of e.mergeConflicts) {
      console.warn(
        `  assignmentId=${c.assignmentId}  candidateActorId=${c.candidateActorId}  matchField=${c.matchField}  reason=${c.reason}`
      );
    }
  }

  console.log("\n=== Backfilling sole-proprietor flags ===");
  const sp = await backfillSoleProprietorFlags();
  console.log(JSON.stringify(sp, null, 2));

  console.log("\n=== Resolving free-text organization names ===");
  const o = await resolveOrganizationNames();
  console.log(JSON.stringify(o, null, 2));

  await prisma.$disconnect();

  const totalConflicts = r.mergeConflicts.length + e.mergeConflicts.length;
  if (strict && totalConflicts > 0) {
    console.error(
      `\n[--strict] Exiting non-zero: ${totalConflicts} merge_required conflict(s) detected. ` +
      `Resolve duplicates before re-running.`
    );
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
