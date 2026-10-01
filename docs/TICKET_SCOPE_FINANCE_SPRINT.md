# Ticket scope and finance sprint

## Accepted rules

- Sales close at session start by default. Superadmin can explicitly permit late sales until session end.
- Single event: one session and its inventory.
- Selected events: buyer chooses one of an explicit allowed set; this is not a bundle.
- Series pass: one entitlement per explicitly included session. All session capacity must reserve atomically.
- Series shared: common product and price; buyer chooses exactly one session.
- Session-specific prices are allowed. Dynamic increases are deferred.
- Cancelled/postponed sessions cannot sell; existing entitlements and value must survive.
- Expired scheduled sessions become completed. Historical purchases remain available.
- Partial refunds can target a single included event and must be cumulative and retry-safe.
- Fees and tax use effective-dated rules; order snapshots preserve historical amounts.

## Implemented in this branch

- Start cutoff in public catalog, quote, intent policy, and capacity reservation.
- Audited Superadmin late-sales setting with an event-management control.
- Append-only dated global finance rules, an audited Superadmin API and Commerce Settings form.
- Quote and intent use the same finance calculator; the order saves its rate snapshot.
- Browser sends the reviewed total; changed totals require reviewing a fresh quote.
- Existing 5% fee and 8.4% subtotal tax retained by migration as historical configuration, not tax advice or verification.

## Still required before the full sprint can ship

- Ticket scope schema, allowed-session mapping, event prices, backend validation and mobile product editor.
- Purchase allocations per event; atomic reservation/order/hold creation and release across all events.
- Entitlement issuance per order line and session, with ticket type identity retained.
- Cumulative refund records, concurrency/idempotency protection, per-event reversals and capacity restoration.
- Session completion maintenance and value-preserving cancellation/postponement flows.
- Integration tests with a database: concurrent carts, expired holds, payment callbacks and refund retries.
- Migration rehearsal, mobile browser verification, and deployment verification.

## Existing hazards found during inspection

- Confirmation still issues against Order.sessionId; multi-session allocations remain required.
- Refund endpoint compares each refund with the original total, not the remaining refundable balance.
- Inventory reservation and order creation currently use separate transactions.
- The build configuration skips TypeScript validation; a successful build alone is insufficient evidence.

No production database or payment was changed during this implementation.

## Release reconciliation — October 1, 2026

Repository evidence: PRs 66–100 are merged; main was inspected at 5511b09. A merge is not proof that Replit has published it. PR54 and PR7 remain open and must not be merged wholesale into the newer implementation.

This recovery change:

- Restores the original CATCH dining-room hero with the illuminated CATCH sign from unmerged PR54 on both restaurant routes.
- Routes the legacy percentage-only finance editor to Checkout Finance, preventing it from inadvertently resetting the new flat fee.
- Preserves ticket-type identity and issues tickets only for ticket line items, excluding add-ons.
- Treats partial authorizations, review/intermediate payment states and uncertain provider outcomes as requiring reconciliation, not successful fulfilment or a fresh charge.
- Keeps unresolved payment claims out of automatic expired-hold release.
- Revokes tickets after full refund/void and rejects admission for cancelled, refunded or failed orders in both check-in mutation paths.

Not completed by this change: cumulative/idempotent partial refunds, per-session refund allocations, atomic payment/hold concurrency, monotonic webhook reconciliation, deposit-payment parity, bank settlement verification, and full mobile/browser QA. Existing payout/bank-onboarding code must be audited rather than assumed absent; bank export certification is not established. Historical invite, PWA, review-trigger and role-dashboard recommendations still require a separate evidence-backed verification pass.

Validation: focused commerce/CyberSource/payment unit tests; no production charge, refund, database change or deployment performed. Full repository TypeScript checking still has pre-existing failures; a build that skips it is not sufficient release evidence.

Verified payout gap: `src/server/payouts/exportFormats/banescoPanama.ts` is an intentionally unimplemented renderer that throws. It is not a working Banesco bank file export. Obtain the bank's accepted specification for this corporate account, implement fixtures and validation, and get bank acceptance before treating batch exports as payout-ready. A generic NACHA exporter is not evidence of Banesco compatibility.
