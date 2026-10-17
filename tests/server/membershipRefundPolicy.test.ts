import { describe, expect, it } from "vitest";
import { MEMBERSHIP_REFUND_POLICY, quoteMembershipRefund, type MembershipRefundInput } from "../../src/server/membership/refundPolicy";
const day = 86400000;
const start = Date.UTC(2026,9,4);
const base: MembershipRefundInput = {
  acceptedPolicyVersion:MEMBERSHIP_REFUND_POLICY, acceptedAt:start-1000,
  paymentVerified:true,paidAt:start,currency:"USD",paidPrincipalCents:36500,
  activatedAt:start,termEndsAt:start+365*day,requestedAt:start+20*day,
  isRenewal:false,reason:"CHANGE_OF_MIND",redemptionHistoryVerified:true,
  priorRefundOrPendingOperation:false,benefits:[],
};
const dinner = {redemptionId:"dinner-1",category:"PRIVATE_DINNER" as const,
  treatment:"DEDUCTIBLE_EXTRA" as const,state:"REDEEMED" as const,
  redeemedAt:start+day,deductionCents:2500,disclosedBeforeAcceptance:true};
describe("annual membership refund quote — no money movement",()=>{
  it("prorates actual paid principal and a disclosed redeemed extra",()=>{
    expect(quoteMembershipRefund({...base,benefits:[dinner]})).toMatchObject({kind:"QUOTE",
      elapsedAccessCents:2000,benefitDeductionCents:2500,refundablePrincipalCents:32000,
      requiresAdminApproval:true,taxAdjustment:"SEPARATE_REVIEW"});
  });
  it("quotes full principal before activation",()=>{
    expect(quoteMembershipRefund({...base,activatedAt:null,termEndsAt:null})).toMatchObject({kind:"QUOTE",refundablePrincipalCents:36500});
  });
  it("accepts the exact 30-day deadline but not a millisecond later",()=>{
    expect(quoteMembershipRefund({...base,requestedAt:start+30*day}).kind).toBe("QUOTE");
    expect(quoteMembershipRefund({...base,requestedAt:start+30*day+1}).kind).toBe("OUTSIDE_WINDOW");
  });
  it.each(["INCLUDED_ACCESS","SEPARATE_PURCHASE"] as const)("does not deduct %s twice",treatment=>{
    expect(quoteMembershipRefund({...base,benefits:[{...dinner,treatment}]})).toMatchObject({benefitDeductionCents:0,refundablePrincipalCents:34500});
  });
  it.each(["RESERVED","CANCELLED"] as const)("does not deduct a %s event",state=>{
    expect(quoteMembershipRefund({...base,benefits:[{...dinner,state}]})).toMatchObject({benefitDeductionCents:0});
  });
  it("does not claw back ordinary discounts",()=>{
    expect(quoteMembershipRefund({...base,benefits:[{...dinner,category:"DISCOUNT"}]})).toMatchObject({kind:"REVIEW"});
  });
  it.each([
    {acceptedPolicyVersion:null},{paymentVerified:false},{redemptionHistoryVerified:false},
    {priorRefundOrPendingOperation:true},{isRenewal:true},{currency:"EUR"},
    {paidPrincipalCents:-1},{paidPrincipalCents:NaN},{paidPrincipalCents:1.5},
    {activatedAt:start-day},{termEndsAt:start+30*day},
    {benefits:[{...dinner,disclosedBeforeAcceptance:false}]},
    {benefits:[dinner,dinner]}, {benefits:[{...dinner,redeemedAt:start+21*day}]},
  ])("requires review for unsafe or unapproved inputs %j",change=>{
    expect(quoteMembershipRefund({...base,...change}).kind).toBe("REVIEW");
  });
  it.each(["BILLING_ERROR","SERVICE_FAILURE"] as const)("does not deny %s solely because 30 days passed",reason=>{
    expect(quoteMembershipRefund({...base,reason,requestedAt:start+60*day})).toMatchObject({kind:"REVIEW",reason:"EXCEPTION_REVIEW"});
  });
  it("caps deduction effect at zero, never creates a debt",()=>{
    expect(quoteMembershipRefund({...base,benefits:[{...dinner,deductionCents:50000}]})).toMatchObject({refundablePrincipalCents:0});
  });
  it("handles leap-year term length using the actual term",()=>{
    expect(quoteMembershipRefund({...base,paidPrincipalCents:36600,termEndsAt:start+366*day})).toMatchObject({elapsedAccessCents:2000,refundablePrincipalCents:34600});
  });
  it("does not treat benefits consumed before activation as a full-refund case",()=>{
    expect(quoteMembershipRefund({...base,activatedAt:null,termEndsAt:null,benefits:[dinner]}).kind).toBe("REVIEW");
  });
});
