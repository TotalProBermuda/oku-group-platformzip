/**
 * Event-referrer assignments for the logged-in user.
 *
 * DEFERRED FROM PURE REFERRER CONSOLE (Slice E, recorded 2026-07-11):
 * This endpoint intentionally uses the separate `EventReferrerAssignment` /
 * `InfluencerSubCommissionLedger` model rather than the shared
 * `GET /api/v1/me/referrals` feed. Migration to the shared feed requires ticket
 * purchases to be recorded as `AttributionSession` rows first. See the
 * convergence path documented in `src/app/influencer/referrer-dashboard/page.tsx`.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { getEventReferrerDashboard } from "@/server/events/eventReferrerService";

export async function GET() {
  const { userId } = await requireSession();
  const assignments = await getEventReferrerDashboard(userId);
  return NextResponse.json({ ok: true, data: assignments });
}
