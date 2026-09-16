/**
 * Partner Commerce policy contract.
 *
 * This is intentionally separate from PartnerDelegateSeat. The legacy seat
 * model grants event-operational access and is not safe to reuse for a
 * restaurant/ticket seller network. These helpers are pure so the policy can
 * be tested before invitations or money movement are introduced.
 */

export type PartnerCommerceScope =
  | { kind: "PARTNER_DIRECT" }
  | { kind: "VENUE"; venueKeys: string[] }
  | { kind: "SERIES"; seriesIds: string[] }
  | { kind: "SESSION"; sessionIds: string[] }
  | { kind: "CATALOG"; venueKeys: string[]; seriesIds: string[]; sessionIds: string[] };

export type CommercialChannel = "PARTNER_DIRECT" | "SELLER";

export type SellerCommercialRole =
  | "SPEAKER"
  | "SPONSOR"
  | "PROMOTER"
  | "INFLUENCER"
  | "CONCIERGE"
  | "TEAM_SELLER";

export type PartnerSplitPolicy = {
  /** Total seller share of the already-approved partner commission pool. */
  sellerShareBps: number;
  /** Partner retains the remainder. Stored explicitly for audits. */
  partnerRetainedBps: number;
  /** A policy is only valid for attributions started on/after this instant. */
  effectiveFrom: Date;
  /** The superadmin-approved master rule or agreement that caps this policy. */
  approvedProgrammeId: string;
};

export type AttributionCandidate = {
  channel: CommercialChannel;
  partnerId: string;
  sellerSeatId?: string | null;
  venueKey?: string | null;
  seriesId?: string | null;
  sessionId?: string | null;
};

const BPS_TOTAL = 10_000;

function nonEmptyUnique(values: string[]): boolean {
  return values.length > 0 && new Set(values.map((value) => value.trim())).size === values.length
    && values.every((value) => value.trim().length > 0);
}

/** Validate policy before it can be made available for future seller sales. */
export function validatePartnerSplitPolicy(policy: PartnerSplitPolicy): string | null {
  if (!policy.approvedProgrammeId.trim()) return "An approved programme is required";
  if (!Number.isInteger(policy.sellerShareBps) || !Number.isInteger(policy.partnerRetainedBps)) {
    return "Commission shares must be whole basis points";
  }
  if (policy.sellerShareBps < 0 || policy.partnerRetainedBps < 0) {
    return "Commission shares cannot be negative";
  }
  if (policy.sellerShareBps + policy.partnerRetainedBps !== BPS_TOTAL) {
    return "Partner and seller shares must equal exactly 100% of the approved pool";
  }
  if (Number.isNaN(policy.effectiveFrom.getTime())) return "A valid effective date is required";
  return null;
}

/**
 * A direct partner QR deliberately has no seller. A seller channel must have
 * one. This protects the single-chain rule and prevents stacked commission.
 */
export function validateAttributionCandidate(candidate: AttributionCandidate): string | null {
  if (!candidate.partnerId.trim()) return "Partner is required";
  if (candidate.channel === "PARTNER_DIRECT" && candidate.sellerSeatId) {
    return "A direct partner channel cannot also credit a seller";
  }
  if (candidate.channel === "SELLER" && !candidate.sellerSeatId?.trim()) {
    return "A seller channel requires an active seller seat";
  }
  return null;
}

/** True only when the catalogue item is explicitly included in the seat scope. */
export function isCandidateInScope(
  scope: PartnerCommerceScope,
  candidate: Pick<AttributionCandidate, "venueKey" | "seriesId" | "sessionId">,
): boolean {
  switch (scope.kind) {
    case "PARTNER_DIRECT":
      return true;
    case "VENUE":
      return !!candidate.venueKey && scope.venueKeys.includes(candidate.venueKey);
    case "SERIES":
      return !!candidate.seriesId && scope.seriesIds.includes(candidate.seriesId);
    case "SESSION":
      return !!candidate.sessionId && scope.sessionIds.includes(candidate.sessionId);
    case "CATALOG":
      return (
        (!!candidate.venueKey && scope.venueKeys.includes(candidate.venueKey)) ||
        (!!candidate.seriesId && scope.seriesIds.includes(candidate.seriesId)) ||
        (!!candidate.sessionId && scope.sessionIds.includes(candidate.sessionId))
      );
  }
}

/** Validate inputs at policy creation rather than making broad scopes by accident. */
export function validatePartnerCommerceScope(scope: PartnerCommerceScope): string | null {
  switch (scope.kind) {
    case "PARTNER_DIRECT":
      return null;
    case "VENUE":
      return nonEmptyUnique(scope.venueKeys) ? null : "At least one unique venue is required";
    case "SERIES":
      return nonEmptyUnique(scope.seriesIds) ? null : "At least one unique series is required";
    case "SESSION":
      return nonEmptyUnique(scope.sessionIds) ? null : "At least one unique session is required";
    case "CATALOG": {
      const values = [...scope.venueKeys, ...scope.seriesIds, ...scope.sessionIds];
      return nonEmptyUnique(values) ? null : "A catalogue scope needs at least one unique eligible item";
    }
  }
}

/** Split an already-approved partner pool without rounding the pool itself. */
export function allocatePartnerPool(poolCents: number, policy: PartnerSplitPolicy) {
  const error = validatePartnerSplitPolicy(policy);
  if (error) throw new Error(error);
  if (!Number.isSafeInteger(poolCents) || poolCents < 0) {
    throw new Error("Commission pool must be a non-negative whole number of cents");
  }

  // The partner receives any one-cent remainder. This makes allocations exact
  // and prevents the seller's amount ever exceeding the approved pool.
  const sellerCents = Math.floor((poolCents * policy.sellerShareBps) / BPS_TOTAL);
  return { sellerCents, partnerCents: poolCents - sellerCents };
}
