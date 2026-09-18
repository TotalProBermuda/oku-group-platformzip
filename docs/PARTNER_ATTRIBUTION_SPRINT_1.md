# Partner Attribution Sprint 1

## Goal

Deliver a mobile-first, standard partner attribution foundation: one partner
room-material QR/link and one distinct seller QR/link per approved seller.

## In scope

1. Partner direct and seller channel records with opaque canonical codes.
2. One immutable attribution chain per booking: partner-only or partner-plus-
   seller; no competing credits.
3. Superadmin activation, pause, rotation, and read-only support audit.
4. Partner mobile workspace for channel and seller-code visibility; seller
   mobile workspace for personal code only.
5. Scope requests remain proposals until Superadmin approval.

## Out of scope

Payouts, bank onboarding, automatic partner split settlement, and modifying a
completed allocation. Those follow only after the immutable allocation ledger
is built and piloted.

## Acceptance gates

- QR scan is resolvable, rate-limited, auditable, and revocable.
- A seller link anchors both the partner and seller; a partner link anchors
  only the partner.
- Tax, propina, refunds, voids, and chargebacks never become commission basis.
- Seller cannot view other seller data, team payouts, or partner banking.
- Partner cannot activate scope, change global rates, or mark payouts paid.
- iPhone viewport has no horizontal overflow, 44px minimum actionable targets,
  readable QR cards, and usable loading/error/revocation states.

## Build order

1. Schema and migration: channel identity, ownership, lifecycle, and immutable
   attribution anchor.
2. Server policy/service plus authorization and regression tests.
3. Superadmin/partner/seller API surfaces.
4. Mobile-first QR wallet UI and support controls.
5. Casco View controlled pilot and adversarial test matrix.
