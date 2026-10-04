# Annual membership refund policy — review-gated implementation

Owner approved implementing the recommended structure on 4 October 2026.
This is not permission to issue refunds, migrate production or change existing
members' accepted terms. No production routes import the quote engine yet.

## Value and benefit classification

Membership is ongoing access: year-round discounts and access to a programme of
private dinners, specialist products, keynotes and entertainment. Access does not
automatically mean every event is complimentary or that a seat is guaranteed.
Each offer must state booking requirements, capacity and any additional price.

Each benefit must have an explicit treatment captured in the accepted terms:
- Included access: covered by time-based proration; no additional deduction.
- Separate purchase: its ticket/receipt remains separate from membership refund.
- Deductible extra: only actual redemptions with a pre-disclosed deduction value.
  Event category alone never makes a dinner/keynote/entertainment deductible.
  Reserved or cancelled benefits are not consumed. Ordinary discounts are not
  retrospectively clawed back. No invented deduction values or processing fees.

## Implemented quote rules

- New annual USD terms only, version `annual-30-day-v1` explicitly accepted.
- Require verified actual payment and redemption history; plan price is not payment.
- Before activation: full membership principal if no contradictory redemption.
- Within 30 elapsed 24-hour periods after paid access activation, including the
  exact deadline: unused-time principal less separately disclosed redeemed extras.
- Use durable server request timestamp, not eventual approval timestamp.
- Prorate by actual annual term duration, including leap years. Integer arithmetic;
  retained access rounded down to cents. Never quote below zero or create a debt.
- Taxes handled separately by finance; no new tax rule or fee deduction implied.
- Renewals, legacy terms, prior refunds/pending operations and unverified data go
  to review. Billing errors/service failure are not rejected by the voluntary cutoff.
- Every quote requires admin approval. It is not a gateway instruction.

## Required before a live customer request page

Current Membership has startsAt/priceAnnualCents/benefitsJson but no authoritative
paid-term snapshot, policy acceptance, redemption journal or refund-request record.
Patron enrollment is currently manual approval. Do not infer capture from ACTIVE.

Proposed additive records (migration must be separately reviewed/approved):
1. MembershipTerm: member/user, capture ID, actual principal/tax, currency, activation,
   end, accepted policy/version/content hash and acceptance timestamp.
2. MembershipBenefitRedemption: unique source reference, term, offer, category,
   treatment, pre-disclosed value snapshot, redemption/reversal timestamps.
3. MembershipRefundRequest: unique member/term request key, server received time,
   reason, evidence/quote version, admin reviewer, audit history and operation ID.
4. Durable entitlement actions/outbox for approved cancellation and financial outcome.

Customer flow: My Membership → Cancel membership / request refund → itemized
estimate → confirm request → receipt/status. No money-moving button for customers.
Outside-window users can still stop renewal; billing/service issues go to review.
Admin flow: review payment + policy + redemption evidence → approve/reject with
reason → durable refund coordinator → authoritative reconciliation → complete.
Don't imply settlement from acceptance. Recompute changed redemptions and obtain
customer reconfirmation if the estimate changes; don't silently alter the quote.

Before activating the request flow, decide how access/future member-only reservations
behave while a request is pending and after cancellation. Never cancel separately
purchased tickets or restore capacity merely because the member asks for a refund.
Preserve previously purchased ticket rights; exceptional ticket refund policy is separate.

## Remaining review gates

- Offer-specific inclusion, pricing, capacity and disclosed deduction values.
- Renewal refund policy (not guessed from first-year policy).
- Local legal review of final public terms, tax treatment and exceptions.
- Approval of the exact additive migration and historical enrollment/backfill.
- Mobile customer/admin screens, authorization, durable request flow and gateway
  reconciliation integration. Existing refund PR115 is also not production-ready.
- Controlled live financial tests remain separately approval-gated.

No invitations, refunds, payouts, financial settings or production data changed.
