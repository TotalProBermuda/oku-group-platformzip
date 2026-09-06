import type { CommissionTierType, ReferralActorType } from "@prisma/client";

export type CommissionProgram = {
  eligible: boolean;
  tier: CommissionTierType | null;
};

/** Safe onboarding defaults by commercial persona. */
export function defaultCommissionProgram(actorType: ReferralActorType): CommissionProgram {
  switch (actorType) {
    case "TAXI_DRIVER":
    case "UBER_DRIVER":
      return { eligible: true, tier: "STANDARD" };
    case "TOUR_GUIDE":
      return { eligible: true, tier: "TRUSTED" };
    case "HOTEL_CONCIERGE":
      return { eligible: true, tier: "PREMIUM" };
    case "STREETSIDE_HOST":
    default:
      return { eligible: false, tier: null };
  }
}
