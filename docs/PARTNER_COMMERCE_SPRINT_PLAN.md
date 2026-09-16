# Partner Commerce Sprint Plan

## Objective

Give an approved partner a direct commercial channel and a managed seller team,
without giving sellers Partner, Host, Finance, or Superadmin access. Each
completed reservation or ticket order has exactly one attribution chain:

`partner direct` or `partner -> seller`.

The partner can audit its commercial activity. Sellers see only their own
activity and allocations. Superadmin retains control over catalog publishing,
master commission policy, compliance, and payout release.

## Non-negotiable controls

- A seller seat is not a `PARTNER` role and cannot create/edit events.
- The superadmin publishes the eligible catalogue. Partners only assign their
  approved catalogue to sellers.
- Direct partner QR codes and seller QR codes never stack on one order.
- Policy edits are prospective. An allocation stores the policy version used
  when it was earned.
- Restaurant allocations wait for verified INVU close; tickets wait for a
  settled order and the applicable refund window.
- Refunds and voids write reversal entries; they never rewrite history.
- A partner controls its team but cannot approve its own beneficiary or payout.
- No live invitations, emails, or bank collection in the pilot until the
  security, permission, and reconciliation acceptance checks pass.

## Sprint 1 — Foundation and safe commercial policy

**Deliverables**

1. Separate partner-commerce policy and seller-seat domain from the legacy
   event delegate-seat implementation.
2. Scope validator for partner-wide, venue, series, selected-session, and
   direct partner channels.
3. Immutable policy snapshot contract: company/seller split must total the
   approved pool and cannot be changed retroactively.
4. Tests covering scope escape, split overflow, unauthorised direct payout,
   and attribution conflicts.

**Acceptance**

- A seller cannot gain Partner/Host/Finance permissions through an invitation.
- A policy cannot allocate more than the approved commission pool.
- A seller code cannot sell outside its approved scope.
- A single order can resolve to one, and only one, commercial chain.

## Sprint 2 — Partner Console and seller surfaces

**Deliverables**

1. Partner Console for team seats, QR/link issuance, scope, invitation state,
   and prospective split templates.
2. Seller surface with personal QR/link, personal performance, allocation
   status, and no team or bank data.
3. Direct Partner QR channel for room cards, front desks, and partner sites.
4. Online-first installable shortcut for the seller surface. It may cache the
   shell, but all bookings, payments, attribution, and earnings requests must
   remain network-backed.

**Acceptance**

- Partner owner sees all team activity; sellers see only their own.
- Partner direct QR credits the partner without assigning a seller.
- A revoked seat/link stops new attribution immediately and preserves history.
- QR rotation preserves audit history and does not move old credit.

## Sprint 3 — Ticket and reservation attribution

**Deliverables**

1. Ticket eligibility by selected event, session, whole series, or approved
   partner catalogue.
2. Reservation eligibility by venue and approved restaurant campaign.
3. Order-line allocation for multi-ticket orders and series passes.
4. Verified restaurant-close allocation using the existing INVU trust chain.

**Acceptance**

- A speaker may be scoped to one session while a promoter is scoped to a series.
- A cancelled or partially refunded ticket reverses only the affected amount.
- Tax and propina remain outside restaurant commissionable revenue.
- Conflicting link/code claims are rejected and recorded for review.

## Sprint 4 — Beneficiary, accounting, and controlled pilot

**Deliverables**

1. Standardized beneficiary onboarding separated from product access and
   commercial attribution.
2. Finance-owned readiness workflow and payout batch reconciliation.
3. Partner and seller ledger views with booked, settled, eligible, allocated,
   reversed, and paid states.
4. Casco View Life pilot using test seats before any live staff invite.

**Acceptance**

- Only a Finance/Superadmin workflow can mark a beneficiary bank-ready.
- Bank account numbers are encrypted and never re-displayed; only masked data
   reaches ordinary UI/API reads.
- Partner and seller totals reconcile to the immutable allocation ledger.
- The pilot proves direct-partner QR, seller QR, cancellation/refund, revocation,
   and payout export before live use.

## Commercial decisions required before Sprint 4 activation

1. Whether OKÜ pays only the partner entity (recommended for the first pilot)
   or pays each seller directly.
2. Casco View Life's default company/seller split and who can approve exceptions.
3. Eligible restaurant venue(s), event series, and selected sessions.
4. Whether external-domain seller emails are approved for the partner.
5. The master commission ceiling for the 5% / 10% programme.
