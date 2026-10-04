/** Quote-only policy for newly accepted annual membership terms.
 * Not imported by live routes. Never treats plan price as proof of payment.
 * A quote does not authorize a refund, revoke access or release event capacity.
 */
export const MEMBERSHIP_REFUND_POLICY = "annual-30-day-v1";
const DAY_MS = 86_400_000;
type Benefit = {
  redemptionId: string;
  category: "PRIVATE_DINNER" | "KEYNOTE" | "ENTERTAINMENT" | "DISCOUNT" | "OTHER";
  treatment: "INCLUDED_ACCESS" | "SEPARATE_PURCHASE" | "DEDUCTIBLE_EXTRA";
  state: "RESERVED" | "REDEEMED" | "CANCELLED";
  redeemedAt: number | null;
  deductionCents: number;
  disclosedBeforeAcceptance: boolean;
};
export type MembershipRefundInput = {
  acceptedPolicyVersion: string | null;
  acceptedAt: number;
  paymentVerified: boolean;
  paidAt: number;
  currency: string;
  // Actual paid membership principal, excluding separately calculated taxes.
  paidPrincipalCents: number;
  activatedAt: number | null;
  termEndsAt: number | null;
  requestedAt: number; // Durable server timestamp, never approval time/client input.
  isRenewal: boolean;
  reason: "CHANGE_OF_MIND" | "BILLING_ERROR" | "SERVICE_FAILURE";
  redemptionHistoryVerified: boolean;
  priorRefundOrPendingOperation: boolean;
  benefits: Benefit[];
};
export type MembershipRefundQuote =
  | { kind: "REVIEW"; reason: string }
  | { kind: "OUTSIDE_WINDOW"; deadline: number }
  | { kind: "QUOTE"; policyVersion: string; principalCents: number;
      elapsedAccessCents: number; benefitDeductionCents: number;
      refundablePrincipalCents: number; deadline: number | null;
      deductions: { redemptionId: string; cents: number }[];
      requiresAdminApproval: true; taxAdjustment: "SEPARATE_REVIEW" };

const money = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const timestamp = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 8640000000000000;
const review = (reason: string): MembershipRefundQuote => ({ kind: "REVIEW", reason });

export function quoteMembershipRefund(input: MembershipRefundInput): MembershipRefundQuote {
  if (input.acceptedPolicyVersion !== MEMBERSHIP_REFUND_POLICY) return review("POLICY_NOT_ACCEPTED");
  if (!input.paymentVerified || !money(input.paidPrincipalCents)) return review("PAYMENT_NOT_VERIFIED");
  if (input.currency !== "USD") return review("CURRENCY_MISMATCH");
  if (![input.acceptedAt,input.paidAt,input.requestedAt].every(timestamp)
    || input.acceptedAt > input.paidAt || input.paidAt > input.requestedAt) return review("INVALID_DATES");
  if (input.reason !== "CHANGE_OF_MIND") return review("EXCEPTION_REVIEW");
  if (input.isRenewal) return review("RENEWAL_POLICY_REQUIRED");
  if (!input.redemptionHistoryVerified) return review("REDEMPTION_HISTORY_UNVERIFIED");
  if (input.priorRefundOrPendingOperation) return review("EXISTING_REFUND_RECONCILIATION_REQUIRED");

  let deadline: number | null = null;
  let elapsedAccessCents = 0;
  if (input.activatedAt !== null) {
    if (!timestamp(input.activatedAt) || input.activatedAt < input.paidAt
      || input.activatedAt > input.requestedAt || input.termEndsAt === null
      || !timestamp(input.termEndsAt) || input.termEndsAt <= input.activatedAt)
      return review("INVALID_ACTIVATION_TERM");
    const term = input.termEndsAt - input.activatedAt;
    // This policy is annual only, not monthly or lifetime membership.
    if (term < 364 * DAY_MS || term > 367 * DAY_MS) return review("ANNUAL_TERM_REQUIRED");
    deadline = input.activatedAt + 30 * DAY_MS;
    if (input.requestedAt > deadline) return { kind: "OUTSIDE_WINDOW", deadline };
    // Exact integer arithmetic; round retained access down to the cent.
    elapsedAccessCents = Number(BigInt(input.paidPrincipalCents)
      * BigInt(input.requestedAt - input.activatedAt) / BigInt(term));
  }

  const seen = new Set<string>();
  const deductions: { redemptionId: string; cents: number }[] = [];
  let benefitDeductionCents = 0;
  for (const benefit of input.benefits) {
    if (!benefit.redemptionId.trim() || seen.has(benefit.redemptionId)
      || !money(benefit.deductionCents)
      || !["RESERVED","REDEEMED","CANCELLED"].includes(benefit.state)
      || !["INCLUDED_ACCESS","SEPARATE_PURCHASE","DEDUCTIBLE_EXTRA"].includes(benefit.treatment))
      return review("INVALID_REDEMPTION_HISTORY");
    seen.add(benefit.redemptionId);
    if (benefit.state !== "REDEEMED") continue;
    if (input.activatedAt === null || benefit.redeemedAt === null || !timestamp(benefit.redeemedAt)
      || benefit.redeemedAt < input.activatedAt || benefit.redeemedAt > input.requestedAt)
      return review("INVALID_REDEMPTION_DATE");
    if (benefit.treatment !== "DEDUCTIBLE_EXTRA") continue;
    // Normal year-round discounts belong to access; do not retrospectively reprice purchases.
    if (benefit.category === "DISCOUNT" || !benefit.disclosedBeforeAcceptance)
      return review("DEDUCTION_NOT_AUTHORIZED");
    benefitDeductionCents += benefit.deductionCents;
    if (!Number.isSafeInteger(benefitDeductionCents)) return review("INVALID_REDEMPTION_HISTORY");
    deductions.push({redemptionId:benefit.redemptionId,cents:benefit.deductionCents});
  }
  return {
    kind:"QUOTE", policyVersion:MEMBERSHIP_REFUND_POLICY,
    principalCents:input.paidPrincipalCents, elapsedAccessCents, benefitDeductionCents,
    refundablePrincipalCents:Math.max(0,input.paidPrincipalCents-elapsedAccessCents-benefitDeductionCents),
    deadline,deductions,requiresAdminApproval:true,taxAdjustment:"SEPARATE_REVIEW",
  };
}
