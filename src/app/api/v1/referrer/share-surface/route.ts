// Single share-surface endpoint reused by BOTH the referrer dashboard
// AND the partner dashboard — surface is keyed off the signed-in user's
// canonical ReferralActor row, so partners and referrers see the same
// bucketed wallet of offers assigned to them.
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import {
  getActorForUser,
  getShareSurfaceForActor,
} from "@/server/referrals/referrerShareSurfaceService";

/**
 * GET /api/v1/referrer/share-surface
 *
 * Returns the bucketed mobile share surface for the signed-in user's
 * ReferralActor (Today / This week / Restaurants / Events / My assigned
 * offers / Past). 404 if the user is not a ReferralActor.
 */
export async function GET() {
  let userId: string;
  try {
    ({ userId } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  const actor = await getActorForUser(userId);
  if (!actor) {
    return NextResponse.json(
      { error: "No referrer profile found for this account." },
      { status: 404 },
    );
  }

  const surface = await getShareSurfaceForActor(actor.id);
  if (!surface) {
    return NextResponse.json({ error: "Surface unavailable" }, { status: 500 });
  }

  return NextResponse.json(surface);
}
