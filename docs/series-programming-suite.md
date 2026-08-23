# Series Programming Suite — operating contract

## Purpose

A **Series** is the public programme/container: its theme, defaults, landing page,
and commercial rules. A **Session** is one sellable occurrence. No public promise,
inventory, eligibility decision, attribution, or report may rely on a display-only
series setting when the purchaser is selecting a session.

This keeps a weekly programme coherent while allowing a Tuesday supper, a Friday
talk, and a private closing night to have different talent, imagery, sponsorship,
prices, guest rules, menus, space coverage, and earners.

## Scope and inheritance

Every configurable record must have an explicit scope:

| Scope | Meaning | Inheritance |
| --- | --- | --- |
| Series | programme default, applies to new sessions | session can inherit or override |
| Session | one dated occurrence | wins over the series default |
| Package | a named set of sessions | creates one entitlement per included session |
| Order | immutable purchase snapshot | never changes when programming changes |

The editor must show **Inherited from series** vs **Overridden for this session**.
Changing a series default must affect only sessions still marked as inherited; it
must never silently rewrite a confirmed order, issued ticket, referral allocation,
or historical sponsor display.

## Required product model

1. **Session schedule** — add daily, weekly, monthly, and custom-date generators;
   preview conflicts/time zone before saving; materialise sessions rather than
   calculating recurrence only at display time. Each session owns start/end,
   capacity, status, programme title/description, speaker/host, media override,
   menu override, and dining coverage.
2. **Ticket product scope** — support exactly three explicit products:
   - `SESSION_TICKET`: valid for one selected session;
   - `MULTI_SESSION_PACKAGE`: contains a fixed list of session entitlements;
   - `SERIES_PASS`: creates entitlements for every eligible session.
   A package must declare its included sessions, booking/transfer rules, and
   whether capacity is consumed when purchased or when the guest selects a date.
3. **Add-ons** — add-ons are products, not a blank tab. Each has scope, active and
   sale dates, availability, optional ticket prerequisite, per-order limit,
   inventory/fulfilment policy (`digital`, `physical`, `service`, `gift bag`), tax
   category, and an immutable order-line snapshot. A session-scoped add-on is not
   shown or purchasable for another session.
4. **Invitations** — invitation campaigns support saved segments, selected users,
   pasted addresses, CSV import, exclusions/suppression, session/package scope,
   delivery preview/count, token expiry, RSVP capacity, and an audit record per
   recipient. Unknown emails create an invite contact, not an unverified platform
   account. Consent/marketing basis must be stored separately from transactional
   event invitations.

## Non-negotiable server controls

Public UI is advisory. The quote, checkout-intent, payment-finalisation, RSVP,
ticket issuance, transfer, check-in, and refund paths must all use the same policy
service and re-check it at the point of mutation.

The policy must verify:

- session exists, is sellable, belongs to a published series, and is in its sale
  state;
- every ticket/add-on belongs to the selected series and applicable session/package;
- product status, visibility, sale window, min/max, membership tier, newsletter
  eligibility, invitation token/recipient, package entitlement, and inventory;
- referral/operator/influencer assignment is active for that exact session and
  product/channel before attribution and commission are recorded;
- product and session capacity are atomically held/released and are reconciled
  after payment, expiration, cancellation, and refund.

The checkout policy added in this change is the first enforcement layer. It closes
foreign-ticket and visibility bypasses for the existing series-scoped model.

## Talent, sponsors, influencers, operators and commissions

- Hosts, sponsors, influencers, and operators use assignments with `scope`,
  `effectiveFrom`, `effectiveTo`, `status`, `frontFacing`, `referralEnabled`, and
  `commissionEligible` fields. A session assignment overrides a series assignment;
  multiple-session selection creates individual assignments rather than a hidden
  range rule.
- Sponsor page/ticket/email/check-in placement is resolved per session and snapshotted
  at send/order time. The public page must render the effective list for the viewed
  session, not a stale series list.
- Commission rules need an effective date range, product/channel eligibility,
  fixed/basis-point modes, caps, currency, agreement reference, priority, and a
  version. The resolver must select the most-specific active session/product rule,
  then series, venue, global. Existing orders/ledger lines retain the resolved
  rule/version and never recalculate retroactively.
- Closed/invite-only sessions default to `referralEnabled=false` and
  `commissionEligible=false`; an administrator may explicitly enable them with an
  auditable reason. Operators cannot infer eligibility merely from UI visibility.

## Reservations and dining

The operating location is **Local #5, second floor**, not the Gold House/Casa Oro
building. CATCH, OKU, Terrace, and Private Dining Room are spaces within that one
operating location. A requested space is a preference. Hosts may assign any
available compatible Local #5 space and joined-table plan; only a total buy-out or
explicit space block removes the relocation option. Preserve requested and final
assigned space, reason, time/table changes, and guest-facing confirmation history.

Dining blocks require a scope (session or buy-out), coverage (one space / selected
spaces / whole operating location), set-up/reset buffer, capacity impact, customer
message, and conflict-preview. A draft block has no public effect; publish/pause/
cancel synchronises occupancy idempotently and never silently cancels reservations.

Reservation blocks need named-party QR admission, expected/actual covers, session
scope, and a gift-bag fulfilment plan. `giftBagEnabled` alone is insufficient:
define SKU/stock, quantities, handover staff, duplicate prevention, exceptions,
and post-event reconciliation.

## Analytics and operational reporting

All reporting must group by series *and* session, with a visible scope selector.
Report gross/net/refunded revenue, paid/held/available capacity, ticket/add-on
units, invitations sent/opened/RSVP/declined, attendance/no-shows, sponsor
placements, attribution, commission accrued/released/paid, dining displacement,
gift-bag inventory, and data freshness. Revenue and payout reports must use paid
ledger facts—not browser/cart counters—and preserve currency, time zone, and
rule-version snapshots.

## Delivery sequence and launch gates

1. Add session schedule and occurrence override model with migration/backfill.
2. Add scoped products/packages and replace series-only checkout selection.
3. Extend the policy service to quote, checkout, payment confirmation, RSVP, and
   refund; cover it with permission/tamper tests.
4. Build invitation list/import/suppression workflow and delivery audit.
5. Add scoped assignment/commission agreement model and immutable ledger snapshots.
6. Build add-on management, cart, fulfilment and inventory reports.
7. Complete dining/reservation/gift-bag controls against Local #5 space data.
8. Reconcile session-level analytics and run end-to-end scenarios for public,
   members, newsletter, invite-only, package, private, refunded, and cancelled
   flows.

No public sale may open until the server-side policy tests, payment/refund checks,
commission batch-payout rehearsal, production migration, monitoring, and the full
user-role matrix pass.
