import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  migrateReferrersToActors,
  migrateEventReferrersToActors,
} from "@/server/referrals/referralMigrationService";

/**
 * POST /api/v1/referral-actors/migrate
 *
 * Admin-only endpoint to run the Phase 1 adaptor migration.
 * Idempotent — already-migrated records are skipped.
 *
 * Body: { includeEventReferrers?: boolean }
 */
export async function POST() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const referrerResult = await migrateReferrersToActors();
    const eventRefResult = await migrateEventReferrersToActors();

    return NextResponse.json({
      ok: true,
      migration: {
        referrers: referrerResult,
        eventReferrers: eventRefResult,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
