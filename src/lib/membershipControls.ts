/** Review-only contracts. Never imported by a money-moving entry point. */
export type MemberScope = "UNDECIDED" | "ALL_ACTIVE" | "PAID_ACTIVE";
export type MembershipControlDraft = {
  version: 1;
  mode: "DRAFT_ONLY";
  scope: MemberScope;
  surface: "INVU_POS" | "WEB_CHECKOUT";
  venue: string;
  branch: string;
  posDiscountId: string;
  receiptEvidence: string;
  benefitTreatment: "INCLUDED_ACCESS" | "SEPARATE_PURCHASE" | "DEDUCTIBLE_EXTRA";
  deductionCents: number;
  disclosedBeforePurchase: boolean;
};
export const initialMembershipControls: MembershipControlDraft = {
  version: 1, mode: "DRAFT_ONLY", scope: "UNDECIDED", surface: "INVU_POS",
  venue: "", branch: "", posDiscountId: "", receiptEvidence: "",
  benefitTreatment: "INCLUDED_ACCESS", deductionCents: 0, disclosedBeforePurchase: false,
};
export function membershipDraftIssues(d: MembershipControlDraft): string[] {
  const issues: string[] = [];
  if (!["ALL_ACTIVE", "PAID_ACTIVE"].includes(d.scope)) issues.push("Owner must choose the excluded membership scope.");
  if (d.surface === "INVU_POS") {
    if (!d.venue.trim() || !d.branch.trim() || !d.posDiscountId.trim()) issues.push("INVU mapping requires venue, branch and actual POS discount ID.");
    if (!d.receiptEvidence.trim()) issues.push("A redacted imported receipt reference is required for POS mapping review.");
  }
  if (!Number.isSafeInteger(d.deductionCents) || d.deductionCents < 0 || d.deductionCents > 2147483647) issues.push("Deduction must be a non-negative whole number of cents within the supported range.");
  if (d.benefitTreatment !== "DEDUCTIBLE_EXTRA" && d.deductionCents !== 0) issues.push("Included access and separate purchases cannot add a membership refund deduction.");
  if (d.benefitTreatment === "DEDUCTIBLE_EXTRA" && !d.disclosedBeforePurchase) issues.push("An extra is deductible only at a value disclosed before purchase.");
  return issues;
}
export type MemberCommissionEvidence = {
  identity: "VERIFIED_ACCOUNT" | "EMAIL_ONLY" | "UNKNOWN";
  historyVerified: boolean;
  transactionAt: number;
  activeFrom: number | null;
  activeUntil: number | null; // Exclusive end of verified active interval.
  paid: boolean | null;
  allocation: "MEMBER_CHECK" | "SPLIT_UNRESOLVED";
};
export function previewMemberCommission(scope: MemberScope, e: MemberCommissionEvidence): {
  decision: "REVIEW" | "EXCLUDE_REFERRER" | "CONTINUE_OTHER_CHECKS"; reason: string;
} {
  const review = (reason: string) => ({ decision: "REVIEW" as const, reason });
  if (!["ALL_ACTIVE", "PAID_ACTIVE"].includes(scope)) return review("Membership scope has not been approved.");
  if (e.identity !== "VERIFIED_ACCOUNT" || !e.historyVerified) return review("Verified account and transaction-time membership history are required; email alone is insufficient.");
  if (e.allocation === "SPLIT_UNRESOLVED") return review("Resolve the member's check or line allocation; do not exclude the entire table.");
  if (!Number.isSafeInteger(e.transactionAt) || e.transactionAt < 0) return review("Invalid transaction time.");
  if (e.activeFrom === null && e.activeUntil === null) return { decision: "CONTINUE_OTHER_CHECKS", reason: "Verified history contains no active membership for this transaction; other commission rules still apply." };
  if (e.activeFrom === null || e.activeUntil === null || !Number.isSafeInteger(e.activeFrom) || !Number.isSafeInteger(e.activeUntil) || e.activeFrom < 0 || e.activeUntil <= e.activeFrom) return review("A valid historical membership interval is required.");
  if (e.transactionAt < e.activeFrom || e.transactionAt >= e.activeUntil) return { decision: "CONTINUE_OTHER_CHECKS", reason: "Transaction is outside the verified active membership interval." };
  if (scope === "PAID_ACTIVE" && e.paid === null) return review("Paid status needs verified payment evidence, not plan price.");
  if (scope === "PAID_ACTIVE" && !e.paid) return { decision: "CONTINUE_OTHER_CHECKS", reason: "Verified unpaid membership is outside the selected paid-only scope." };
  return { decision: "EXCLUDE_REFERRER", reason: "Member transaction: preserve attribution for audit, but create no referrer payable. Host compensation is unchanged." };
}
