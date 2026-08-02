import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  migrateReferrersToActors,
  migrateEventReferrersToActors,
} from "@/server/referrals/referralMigrationService";
import {
  resolveOrganizationNames,
  backfillSoleProprietorFlags,
} from "@/server/referrals/organizationResolver";

/**
 * One-button maintenance endpoint:
 *   1. Backfill ReferralActors from legacy Referrers (idempotent).
 *   2. Backfill ReferralActors from legacy EventReferrerAssignments (idempotent).
 *   3. Reclassify previously-migrated actors as sole proprietors where applicable.
 *   4. Resolve any free-text organizationName values to a real Entity.
 */
export async function POST() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:compensation:write");

    const referrers = await migrateReferrersToActors();
    const events = await migrateEventReferrersToActors();
    const soleProprietors = await backfillSoleProprietorFlags();
    const organizations = await resolveOrganizationNames();

    return NextResponse.json({
      ok: true,
      referrers,
      events,
      soleProprietors,
      organizations,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
