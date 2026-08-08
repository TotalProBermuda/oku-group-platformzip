---
name: Shared "my referrals" source
description: The one canonical server source for a logged-in earner's referral feed across all referrer surfaces.
---

# Shared "my referrals" source

`src/server/referrals/myReferralsSource.ts` (`getMyReferrals(userId)`) is the ONE
server data source every referrer-facing surface must feed from — streetside
host, generic referrer, influencer, and partner. Fixing only one surface is not
acceptable; they must all read the same projection or they silently drift apart.

**The feed is keyed off the `AttributionSession` superset — NOT legacy
`ReservationAttribution`.**
**Why:** `ReservationAttribution` has no row for actor-only chains (host personal
codes where the actor may not be user-linked, `INFLUENCER_SUB_REFERRER`), so
those referrals were invisible on the dashboard; and the old feed windowed on
creation time, hiding future-dated reservations.
**How to apply:** resolve the logged-in user to every owned actor/link/assignment
(not just `referralActor.userId`); filter by each reservation's Panama-local
service window (`reservationDate`), never by creation time. A row is history when
it hits a terminal status (COMPLETED/CANCELLED/NO_SHOW) OR its Panama service day
has passed; otherwise active. SSR and polling must share one include + projection.

**Active/history split is a GOVERNED shared policy — surfaces must not fork it.**
The one definition of terminal statuses + Panama-service-window split lives in
`src/lib/referrals/statusPolicy.ts` (pure, no prisma, so client + server share
it). A surface that treats extra statuses as terminal passes an explicit policy,
it does NOT redefine the set. Streetside passes `"STREETSIDE"` (SEATED terminal —
handoff complete); every other feed uses `"DEFAULT"`. Status-only filters (the old
bug) leave stale past-day non-terminal bookings in Active and double-count NO_SHOW.

**Commission ownership must match the SCOPED pair `(earnerType, earnerRefId)`,
never `earnerRefId` alone.** The two id-spaces are disjoint by meaning but not by
value. The auto-minter only emits HOST (`earnerRefId`=RestaurantHostProfile.id)
and REFERRER (`earnerRefId`=ReferralActor.id OR legacy Referrer.id). Match HOST
against owned host-profile ids, REFERRER against owned actor+legacy-referrer ids.

**Phase 1 does not merge money systems. Phase 2 must bridge CommissionAllocation
into LedgerEntry/PayoutBatch so every commission type uses one canonical paid
definition.** Until that bridge ships there is NO canonical "paid": `ReferralRow`
never reports paid — it only distinguishes `PENDING_CLOSE` (no allocation) from
`ACCRUED_AWAITING_LEDGER` (accrued, awaiting ledger). The shared feed hides any
paid/unpaid rollup (`rollups.paidLedgerAvailable` is always false in Phase 1).
`ReferralRow.money` sums non-REVERSED `CommissionAllocation` (INVU dining) the
user owns; money fields may be null and the UI must render cleanly without them.
**Why:** deriving "paid" from `CommissionAllocationStatus.PAID` would show a paid
state that no payout ledger backs. Refunds/voids still route by `Payment.provider`.

**Walk-ins with no referrer are HOST_OP, not REFERRAL — type them so they never
become false referral proof.** `ReferralRow.attributionKind` = REFERRAL when a
ReferralActor/legacy Referrer owns the attribution, else HOST_OP (the owner's own
walk-in/check-in matched only via the `hostUserId` branch). HOST_OP rows may still
carry a HOST commission the owner earns, but the shared feed tags them (i18n
`feedWalkInTag`) so no surface presents them as a referral. **Why:** a walk-in
shown as a "referral" is false attribution proof.

**A ReferralLink/QR is owned ONLY through its ReferralActor — never resolve link
ownership separately.** There is no user→link relation; `ReferralLink.referralActorId`
(and `ReferralAssignment → ReferralActor`) is the only owner, and attribution is
keyed on `AttributionSession.referralActorId`, never a link id. Resolving owned
actors already covers every owned link. A new referrer-capable role inherits the
feed by getting a ReferralActor, NOT by adding an ownership branch.

**The scanned link/campaign/offer is NOT on AttributionSession (only actor is).**
The proof chain can resolve WHO (referralActor) but not WHICH exact link/offer
until Phase-2 anchoring persists them on the session at booking time (offer
context currently lives on ReferralAssignment, not the session). `ReferralRow`
exposes `referralLinkId/campaignId/offerId` as always-null placeholders so the
contract is stable — never guess them (guessing = false proof).

**Referrer dashboard per-row money must mirror the shared feed's Phase-1 states,
never legacy CommissionEntry.status.** `/api/v1/referrer/dashboard` per-booking
rows use `money.commissionCents` + `commissionState` (PENDING_CLOSE /
ACCRUED_AWAITING_LEDGER) — the page shows "Awaiting payout ledger", never "Paid
out"/"Approved". Global earnings-tab totals still read the legacy CommissionEntry
ledger (the referrer's own aggregate view), which is intentionally separate.
