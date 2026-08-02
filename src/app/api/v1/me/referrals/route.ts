import { NextResponse } from "next/server";
import { getOptionalSession } from "@/server/auth/session";
import { getMyReferrals } from "@/server/referrals/myReferralsSource";

/**
 * Shared "my referrals" endpoint. Every referrer-facing surface (generic
 * referrer, influencer, partner) polls THIS single route through the
 * `MyReferralsFeed` component, so live host-status changes propagate the same
 * way everywhere off the one server source. Any authenticated user may call
 * it; the source returns an empty feed for accounts that own no earner
 * identity, so there is nothing role-sensitive to gate here.
 */
export async function GET() {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getMyReferrals(auth.userId);
  return NextResponse.json(data);
}
