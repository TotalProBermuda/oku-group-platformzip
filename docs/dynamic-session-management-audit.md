# Dynamic session management — pre-implementation audit

Branch: `codex/session-management-dynamic-20261014`. Audit performed 2026-10-14.
No database writes, seed commands, payments, provider calls or production inspection used.

## Compatibility and policy matrix

| Area | Existing representation / consumer | Required compatibility / gap |
| --- | --- | --- |
| Occurrences | Session concrete startsAt/endsAt/capacity, Panama helpers; schedule PATCH serializable | Keep concrete dates authoritative. Template is local time + duration, never a recurrence generator. Sold/history-bearing date edits require postponement. SOLD_OUT capacity increase currently blocked. |
| Content | Nullable Session title/subtitle/description; Series fallbacks in guest views | Legacy null means inherit, nonnull means override. Explicit clear needs additional state. Independent EN/ES/PT edits must use ContentTranslation; EventSession registry currently lacks subtitle/description. |
| Artwork | EN/ES/PT columns plus legacy images, safe URL validator, client fallback candidates | Reuse validation and SUPERADMIN restriction. Clear a reference only; never delete storage objects. Explicit clear must suppress ordinary fallback. |
| Products/prices | Shared TicketType; SessionTicketPrice absent row inherits; quote/intent pricing helper | No session product availability. Missing patch key must not replace other prices. Existing order line names/prices already snapshots. |
| Hosts | SeriesHost/EventHost; overridesSeriesHost replaces entire roster | Operational display roster is not commercial ownership. Separate primary/co-host modes needed; changing display must not alter Series.commercialOwnerInfluencerId, attribution or commissions. |
| Sponsors | Generic scoped SponsorAssignment; inheritsSeriesSponsors; resolve uses series + direct merge | Preserve legacy merge/dedup behavior. Session sponsors POST/toggle currently require only authenticated user. Prevent new mode state being bypassed by old CRUD. |
| Profiles | SeriesProfileAssignment/SessionProfileAssignment with assignmentRole | Role-specific edits must preserve other roles and validate active profile eligibility. Display assignment is not financial eligibility. |
| Referrals | ReferralAssignment GLOBAL/VENUE/SERIES/CAMPAIGN; legacy event-referrer checkout series-scoped | Do not invent SESSION financial scope or rewrite historical assignments/ledger. Expose applicable scopes and existing assignment management separately from session display roles. |
| Inventory | Checkout reserveCatalogCapacityOrThrow CAS Session.soldCount; holds encoded as OrderEvent; reserveCapacityOrThrow read/increment | soldCount includes paid seats + reserved pending checkout. Ticket count also needed for legacy comps. Max(sold, issued) alone misses legacy comp + holds overlap. Need paid/held/issued reconciliation and shared serialization boundary. |
| Holds | createCheckoutHold after reserve; expiry status gate outside release transaction | Capacity reservation/order/hold are not currently one transaction. Avoid assuming pending-order counts capture every held seat. Never reduce below soldCount. |
| Comp issuance | admin/tickets/issue creates paid order and Ticket without capacity increment | Must reserve capacity under same boundary as edits; snapshot gift/admission treatment for future issues. |
| Purchased rights | OrderLineItem price/name snapshots; Ticket identity stable; giftBagEnabled currently read from Session | Do not mutate paid line items or IDs. Snapshot new rights; legacy tickets need conservative fallback/protection before destructive flag edits. Add-ons already order-line snapshots. |
| Check-in | host ticket, host scan, admin attendees and check-in service paths | Several paths do not inspect Session status. Pending-date hold must block every admission write, including admin override. |
| Occupancy | EventSpaceOccupancy + reservation conflict records; advisory locks by physical space | Synchronize concrete schedule/status in same transaction. Retain old conflict history; create new conflicts rather than silently cancelling reservations. |
| Notices | safeEnqueue commerce falls back to inline mail | Must not import queue or handlers for postponement. Dedicated durable HELD outbox only; immutable localized payload, normalized recipient dedup, no dispatcher. |
| Authorization | Permission map retires ADMIN_COMMERCIAL; legacy routes hard-code role lists | New entry point must use requirePermission, field-specific SUPERADMIN checks; old routes cannot mutate managed fields without policy. |
| Creation/duplication | sessions POST explicitly dated; duplicate copies scalar settings and prices | Preserve legacy interpretation without backfill. New managed defaults must be explicitly applied to future occurrences; duplication must not carry unrelated product IDs/mode references. |
| Admin UI | EventScheduleManager on experience Dates & Capacity; separate host/sponsor managers | Extend current product, no sandbox/app. Accessible selection + field modes + exact server preview before mutation. |

## Baseline verification before implementation

Command:
```
npm test -- tests/server/series tests/server/commerce/checkoutHold.test.ts tests/server/commerce/sessionBoundary.test.ts tests/server/commerce/ticketIssuance.test.ts
```
Result: **15 files, 83 tests passed**. Vite reports a non-fatal skill-template
tsconfig parse warning and deprecation notice for vite-tsconfig-paths.

Command:
```
npx tsc --noEmit --pretty false
```
Result: **failed before changes**. Full baseline captured in
`/tmp/session-baseline-types.log` during the audit. Diagnostics include sandbox
TS5097/TS2307/TS2339, translation-data TS2322, existing server/API type errors,
mockPrisma TS7022, audit test TS2352/TS2345, partnerAssignmentAuthz TS2345,
ticketRefundRequestValidation TS2345 and rateLimit TS2540. Final handoff must
include exact remaining diagnostics, not represent this command as passing.

## Storage direction (chosen after audit)

Additive, nullable JSON defaults and per-field modes, with legacy interpretation
when absent; concrete operational fields remain materialized. Add accepted-change
and held-notice tables for payload-bound idempotency and transactional audit.
Schema changes are reviewable files only: **do not run migrate/db push against
the configured database**. Generate Prisma client locally without applying DDL.

## Owner policy boundaries

Only preserved admission on a confirmed replacement date, or pending-date hold
with sales/check-in paused. No refunds, cancellation, reissue, transfer, notice
delivery or new financial referral scopes. Notice release and attendee-consent
policy require explicit owner decisions outside this implementation.

## Review-pass compatibility audit

The preceding sections record the original pre-implementation audit, not current verification counts. See the updated handoff for exact review-pass logs and outcomes.

| Area | Current bounded behavior |
|---|---|
| Session capacity | Explicit per-occurrence default only; absent/inherit-only defaults preserve submitted/materialized occurrence capacity. Never inherit the series aggregate. |
| Admin admission | Occurrence lock, ticket claim and ExperienceCheckin record share one transaction; failed audit cannot leave a checked-in ticket or trigger SSE. |
| Operational identities | Primary/co-host/sponsor/profile display assignments remain separate from commercial ownership and earning eligibility. |
| Financial identities | Existing current-SERIES assignment DRAFT/ACTIVE/PAUSED/RETIRED lifecycle uses the same payload-bound preview/apply, SUPERADMIN only, with versions and transactional audit. |
| Shared financial scopes | GLOBAL/VENUE remain read-only here; CAMPAIGN relationships are not guessed. Canonical tools own cross-series scope/identity/financial-term changes. No SESSION scope exists. |
| Purchased rights/economics | Lifecycle edits do not accept rates, plans, eligibility, links or historical order/ticket/commission writes. Existing terms are fingerprinted so stale financial previews reject. |
| Migration | SQL moved into the established tracked Prisma migration path; unapplied to shared/managed/production databases. Release requires approved Replit Publish schema-diff review and publication. |
