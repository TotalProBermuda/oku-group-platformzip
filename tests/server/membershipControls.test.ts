import { describe, it, expect } from "vitest";
import { initialMembershipControls, membershipDraftIssues, previewMemberCommission, type MemberCommissionEvidence } from "../../src/lib/membershipControls";
import { readFileSync } from "node:fs";
const evidence: MemberCommissionEvidence = { identity: "VERIFIED_ACCOUNT", historyVerified: true, transactionAt: 100, activeFrom: 0, activeUntil: 200, paid: true, allocation: "MEMBER_CHECK" };
describe("review-only membership controls", () => {
  it("starts unresolved and never declares activation readiness", () => {
    expect(initialMembershipControls.mode).toBe("DRAFT_ONLY");
    expect(membershipDraftIssues(initialMembershipControls)).toHaveLength(3);
  });
  it("requires POS evidence only for POS mappings", () => {
    expect(membershipDraftIssues({ ...initialMembershipControls, scope: "ALL_ACTIVE", surface: "WEB_CHECKOUT" })).toEqual([]);
    expect(membershipDraftIssues({ ...initialMembershipControls, scope: "ALL_ACTIVE", venue: "v", branch: "b", posDiscountId: "p", receiptEvidence: "redacted-test-1" })).toEqual([]);
  });
  it.each(["INCLUDED_ACCESS", "SEPARATE_PURCHASE"] as const)("prevents double deduction for %s", benefitTreatment => {
    expect(membershipDraftIssues({ ...initialMembershipControls, benefitTreatment, deductionCents: 100 }).join(" ")).toContain("cannot add");
  });
  it("requires prior disclosure for extras", () => {
    expect(membershipDraftIssues({ ...initialMembershipControls, benefitTreatment: "DEDUCTIBLE_EXTRA" }).join(" ")).toContain("disclosed before purchase");
  });
  it.each([-1, 1.5, NaN, Infinity, 2147483648])("rejects invalid cents %s", deductionCents => {
    expect(membershipDraftIssues({ ...initialMembershipControls, deductionCents }).join(" ")).toContain("whole number");
  });
  it("holds unresolved owner scope", () => expect(previewMemberCommission("UNDECIDED", evidence).decision).toBe("REVIEW"));
  it.each(["EMAIL_ONLY", "UNKNOWN"] as const)("does not trust %s", identity => expect(previewMemberCommission("ALL_ACTIVE", { ...evidence, identity }).decision).toBe("REVIEW"));
  it("holds missing historical evidence", () => expect(previewMemberCommission("ALL_ACTIVE", { ...evidence, historyVerified: false }).decision).toBe("REVIEW"));
  it("holds unresolved split tables", () => expect(previewMemberCommission("ALL_ACTIVE", { ...evidence, allocation: "SPLIT_UNRESOLVED" }).decision).toBe("REVIEW"));
  it("excludes member without needing discount evidence", () => expect(previewMemberCommission("ALL_ACTIVE", { ...evidence, paid: false }).decision).toBe("EXCLUDE_REFERRER"));
  it("distinguishes unknown from verified unpaid", () => {
    expect(previewMemberCommission("PAID_ACTIVE", { ...evidence, paid: null }).decision).toBe("REVIEW");
    expect(previewMemberCommission("PAID_ACTIVE", { ...evidence, paid: false }).decision).toBe("CONTINUE_OTHER_CHECKS");
    expect(previewMemberCommission("PAID_ACTIVE", evidence).decision).toBe("EXCLUDE_REFERRER");
  });
  it("uses inclusive start and exclusive end", () => {
    expect(previewMemberCommission("ALL_ACTIVE", { ...evidence, transactionAt: 0 }).decision).toBe("EXCLUDE_REFERRER");
    expect(previewMemberCommission("ALL_ACTIVE", { ...evidence, transactionAt: 200 }).decision).toBe("CONTINUE_OTHER_CHECKS");
  });
  it("requires complete valid intervals", () => {
    expect(previewMemberCommission("ALL_ACTIVE", { ...evidence, activeUntil: null }).decision).toBe("REVIEW");
    expect(previewMemberCommission("ALL_ACTIVE", { ...evidence, activeUntil: 0 }).decision).toBe("REVIEW");
    expect(previewMemberCommission("ALL_ACTIVE", { ...evidence, activeFrom: null, activeUntil: null }).decision).toBe("CONTINUE_OTHER_CHECKS");
  });
  it("guards page on server and offers no production save API", () => {
    const page = readFileSync("src/app/admin/memberships/controls/page.tsx", "utf8");
    expect(page).toContain('await requireMembershipControlAccess()');
    const client = readFileSync("src/app/admin/memberships/controls/MembershipControls.tsx", "utf8");
    expect(client).not.toContain("fetch(");
    expect(client).toContain("activationBlocked: true");
  });
});
