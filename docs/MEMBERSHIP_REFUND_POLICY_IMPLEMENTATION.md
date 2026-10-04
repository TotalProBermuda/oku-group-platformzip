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

## Superadmin / INVU / commission control mapping — 4 October audit

Owner requires POS discounts to remain distinct from website benefits and member
transactions to be excluded from referrer commissions. Scope of membership tiers
is awaiting clarification (paid Patron/Founder versus every active tier).

Confirmed gaps:
- commerce/commissions.ts creates order commission/subcommission without a member guard.
- events/subCommissionService.ts can independently create seller subcommissions.
- services/invu/commissionMintingService.ts has match/eligibility guards but no
  explicit member check in the inspected minting path. Exclusion must cover each
  path and repair/backfill/reconciliation, not merely hide referral UI.
- INVU normalization extracts aggregate discount amounts. InvuOrderNormalized
  has no dedicated verified member identity/discount-code mapping columns.
- Membership is linked to User.id, but lacks historical accepted term snapshots.

Required Superadmin controls (draft editor now implemented below; none active):
1. Versioned benefit catalogue: included access / separately purchased /
   deductible extra, benefit category, value disclosed at acceptance, effective dates.
2. Separate discount surfaces: INVU_POS or WEB_CHECKOUT, never inferred or silently
   mirrored. POS mapping needs actual venue/branch + stable INVU discount code ID,
   label, percentage/flat amount, eligible items, stacking/exclusions and dates.
3. POS readiness: DRAFT -> CONFIGURED_IN_INVU -> VERIFIED_ON_IMPORTED_TEST_RECEIPT.
   Website saving a mapping must not claim it creates an INVU till button. Do not
   implement remote POS writes without documented supported API and permission.
4. Member identity: internal user/member ID; verified email is lookup, not authority.
   Unverified email-only matches, walk-ins and ambiguous/split bills go to review.
   Never normalize away provider-specific dots/plus tags or merge shared emails.
5. Noncommissionability: snapshot at purchase/service transaction time; member
   exclusion applies even if no discount used. Preserve referral source for audit,
   but don't mint referrer payable/subcommission on excluded transactions.
   Do not alter HOST compensation or other non-referrer contracts by inference.
6. Split checks: do not suppress an entire table's commission because one diner is
   a member. Require member-linked payer/check/line evidence or hold for review.
7. Audit/review: who changed what, previous/new rule, effective date, receipt evidence
   and reason. Existing earned commissions are not retroactively reversed.

Activation blockers: tier scope decision; actual INVU discount IDs and representative
redacted closed-receipt payload; member identity/transaction-time snapshot storage;
explicit schema approval and tests across all commission minting entry points.
This audit is not proof that exclusions, POS buttons or Superadmin controls are live.

## Execution plan and delivered slice — 4 October

1. DONE: establish review-only contracts and conservative decision preview. Unknown
   identity/history/scope and unresolved split checks return REVIEW, not eligibility.
2. DONE: server-guarded Superadmin draft workspace at /admin/memberships/controls,
   linked from Memberships. POS/web surfaces are separate, owner scope defaults to
   undecided, and benefit treatment cannot silently double-deduct. Export is a local
   JSON review artifact, not a persisted or authoritative configuration. No API writes.
3. DONE: focused unit/boundary tests and isolated actual-component browser checks.
4. NEXT: propose additive versioned rule/audit, membership-time and check-identity
   records. Review migration separately before applying anywhere in production.
5. GATED: owner chooses all-active vs paid-active scope; supply actual INVU code IDs
   and redacted receipt. Verify discount shape, eligible items, stacking and dates
   against the POS, not invented configuration. The current draft is not a complete
   benefit catalogue or POS provisioning tool.
6. NEXT after contracts approved: transactional server validation/persistence,
   change audit, activation review and member snapshot integration across web order,
   direct subcommission, INVU minting and repair/backfill entry points. No live guard
   enabled until ambiguity has an operational review queue, not silent data loss.
7. Acceptance: role denial, stale/concurrent edits, historical membership changes,
   split checks, verified non-members, no-discount member purchases, repeated close
   imports and all minting paths; then isolated end-to-end tests before deployment.

Evidence: 47 tests / 2 files passed (refund quote + controls); esbuild bundled the
component/CSS. Real Chrome isolated fixture passed 320/390/1024px: no horizontal
overflow or page errors, identity/split decision changes, deduction inputs and draft
download. Screenshot inspection prompted shorter dropdown labels. This does not
verify the complete Next production build, authenticated role integration, translations,
real mobile devices or deployment. Editor copy is currently English.

Reproduce focused browser checks with isolated test dependencies:
`UI_TEST_RUNTIME=/path/to/isolated/runtime node tests/fixtures/membership-controls/mobile-check.mjs`
Runtime needs esbuild, react, react-dom and playwright; Chrome must be installed.
No database, payment, email or POS API is called. No production migration or deploy.

## Foundation release verification — 4 October

The GitHub PR can leave draft for this bounded foundation; that does NOT activate
member exclusion or the refund policy. The application editor intentionally remains
draft-only, without persistence, and cannot configure POS buttons. Full feature
acceptance and production deployment remain separate gates.

- Locked dependencies installed in this worktree with scripts disabled; Prisma
  client generated locally only. Initial sandbox cache write failure was resolved
  by allowing local code generation, not by connecting to a database.
- 353 tests / 45 files pass, including six actual server access-boundary cases.
  Initial access test hit the runner's preserved JSX; the page now calls a directly
  testable server guard. No auth mocks or bypasses are shipped in application code.
- `npm run build` exits 0 with database address restricted to unreachable localhost.
  The new /admin/memberships/controls route is in the build output. Expected data
  fallback warnings are not evidence of live data health.
- `tsc --noEmit`: 267 diagnostics on candidate and an isolated unchanged main export,
  identical file/line/error-code keys, no additions. Existing global errors remain
  operational-readiness debt. Next skips type/lint checks, so build is not proof
  that those checks pass.
- Actual component Chrome tests pass 320/390/1024px with the repository's locked
  React 18 dependencies, including export and decision controls. No real-device claim.
- Rollback for this code-only foundation: revert the PR merge commit and rebuild.
  No schema, financial setting, permissions, POS or database changes to undo.

After merge, Replit (only if clean; stop on conflicts/divergence):
```sh
git status
GIT_EDITOR=true git pull --ff-only origin main
npx vitest run tests/server/membershipRefundPolicy.test.ts tests/server/membershipControls.test.ts tests/server/membershipControlsAccess.test.ts
npm run build
```
No `db push`, migration or data-loss command is needed. Publish only after verifying
the deployed/source identity and usable Replit rollback, which remain checklist #1.
