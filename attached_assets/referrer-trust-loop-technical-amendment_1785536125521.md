# Referrer Trust Loop Technical Amendment

## Context

Referrers drive reservations through QR codes and links, but the current OKU
app does not give them a reliable live view of what they referred or a
trustworthy view of the money their referrals generated.

The confirmed streetside bug:

- An anonymous guest scans a street host QR.
- The reservation is created successfully.
- The restaurant host dashboard sees the reservation.
- The street host account that owns the QR still sees `No active bookings`.

That narrows the failure to the referrer-facing feed and/or ownership
resolution, not reservation creation itself.

## Verified Red-Team Findings

### 1. Feed Window Is The Bug

`mySubmissions` filters by `createdAt >= now - 8h`, and this is the only feed a
pure streetside host gets. `todayReservations` is gated to restaurant host or
superadmin.

Failure mode:

- A referral can show for about eight hours after creation.
- It then disappears regardless of the actual reservation service date.
- Future-dated referrals are especially vulnerable.

Amendment:

- Select active referrals by reservation service window and referrer ownership.
- Do not use reservation creation time as the active-feed boundary.
- Use Panama-local service windows for launch behavior.

### 2. Referrer Surfaces Already Drift

Streetside reads `AttributionSession.referralActor`.

The referrer dashboard reads legacy `ReservationAttribution` rows plus
`CommissionEntry`.

Actor-only chains such as host links and `INFLUENCER_SUB_REFERRER` may have no
`ReservationAttribution` row, so they are invisible on the referrer dashboard.

Amendment:

- Build the shared source from `AttributionSession`, because it is the superset.
- Stop treating `ReservationAttribution` as the canonical referrer feed source.
- Reuse one source/projection across streetside, generic referrer, influencer,
  and partner views.

### 3. Ownership Is Mostly Anchored, But Resolution Is Incomplete

The reservation route already writes `ReferralActor` and `AttributionSession`
at booking time, with a `DIRECT` fallback.

The real gaps:

- The specific `ReferralLink` or campaign/offer is not persisted on the session;
  click count is bumped, but the durable session anchor is incomplete.
- If opening the attribution session throws, booking silently downgrades to a
  `DIRECT` session with no referrer, and commission is lost.
- Feed ownership resolves only via `referralActor.userId`, so a street host
  whose actor is not user-linked can still see an empty feed.

Amendment:

- Persist referrer actor, referral link, campaign, and offer context on the
  attribution session.
- Treat attribution creation failures as durable recoverable failures, not
  silent downgrades to `DIRECT`.
- Resolve the logged-in viewer to every owned actor/link/assignment, including
  host personal codes where the actor is not directly user-linked.
- Keep guest/scanner identity separate from referrer actor identity.

### 4. The Money Chain Is Not Wired

There are three disconnected earning models:

- `CommissionEntry`: read by the referrer dashboard, but written by nothing at
  runtime; seed/legacy only.
- `CommissionAllocation`: minted from INVU dining table sessions and
  approved/paid/reversed by admin revenue actions.
- `LedgerEntry` / `PayoutBatch`: existing payout and canonical paid system, fed
  only by website orders.

`CommissionAllocation` has no link to `LedgerEntry`, so dining commissions never
enter the payout batch. A street host who drove a dining reservation can get a
real dining allocation while the dashboard still shows `$0`.

Resolved decision:

- Canonical `paid` means paid through the payout-batch ledger system.
- Dining `CommissionAllocation` records must bridge into
  `LedgerEntry` / `PayoutBatch`.
- The referrer dashboard must stop reading orphaned `CommissionEntry` as the
  source of runtime truth.
- The admin per-allocation mark-paid flag may remain only as a manual override
  or legacy display field.

### 5. Expiry Is Not Deterministic

Feeds use UTC `now` and fixed offsets. `PANAMA_TZ = "America/Panama"` exists but
is used only in email.

Known drift:

- `mySubmissions` applies no status filter, so a cancelled booking can linger
  for about eight hours.
- `todayReservations` excludes `CANCELLED` and `COMPLETED` but not `NO_SHOW`.

Amendment:

- Use `America/Panama` for Panama launch service-window comparisons.
- A referral is active until terminal status or service-window expiry.
- Terminal statuses must include `CANCELLED`, `COMPLETED`, `NO_SHOW`, and
  equivalent lost/closed states.

## Phase 1 Amendment: Live Active Referrals

Phase 1 ships independently of the Phase 2 payout bridge. It surfaces
reservation/referral identity and live status from `AttributionSession`.

Money fields such as contribution, commission amount, commission status, and
paid/unpaid may be `null` or absent in Phase 1. The feed must render cleanly
without them.

Do not block or delay the active-feed fix on Phase 2 work.

Build one shared server source for `my referrals`, keyed off
`AttributionSession`.

The source must:

- Resolve the logged-in referrer to all owned actors, links, personal host
  codes, and assignments.
- Return reservations attributed to those actors/links.
- Include future-dated referrals through the end of each reservation's
  Panama-local service window.
- Split active vs. history by terminal status or expired service window.
- Show host-controlled reservation status.
- Power SSR and polling from the same include/projection.

Do not fix only `src/app/host/streetside/page.tsx`.

## Phase 2 Amendment: Financial Trust Loop

Phase 2 fills the money fields into the feed that Phase 1 already ships:

- Contribution.
- Commission amount.
- Commission status.
- Paid/unpaid.

These fields must come from the canonical payout ledger. Phase 2 changes what
each row shows financially, not the ownership/status foundation of the feed.

Build the missing dining bridge:

```txt
CommissionAllocation -> LedgerEntry -> PayoutBatch
```

The shared referrer feed must read contribution, commission, status, and paid
state from the canonical payout ledger, not from orphaned `CommissionEntry`.

On INVU bind and check close:

- Capture total check amount.
- Resolve the attribution/table session.
- Mint or update the `CommissionAllocation`.
- Bridge the allocation into the payout ledger.
- Surface paid/unpaid status from the payout-batch system.

Manual/demo close path:

- Must use the same bridge as real INVU close.
- Must create auditable source metadata.
- Must not create a parallel commission path.

## Shared Feed Contract

Recommended server function:

```ts
getMyReferralsForActor(actorContext: ReferralActorContext, options: {
  now: Date;
  timezone: "America/Panama";
  view?: "active" | "history" | "all";
  historyLimit?: number;
}): Promise<MyReferralFeed>
```

Recommended row shape:

```ts
type MyReferralRow = {
  reservationId: string;
  attributionSessionId: string;
  referralActorId: string;
  referralLinkId: string | null;
  campaignId: string | null;
  offerId: string | null;
  guestName: string;
  partySize: number;
  requestedAt: string;
  serviceWindowStart: string;
  serviceWindowEnd: string;
  locationTimezone: "America/Panama";
  reservationStatus: string;
  source: string;
  tableSessionId: string | null;
  verifiedTableAssignment: string | null;
  checkTotal: number | null;
  commissionAllocationId: string | null;
  ledgerEntryId: string | null;
  payoutBatchId: string | null;
  commissionAmount: number | null;
  commissionStatus: string | null;
  payoutStatus: "not_eligible" | "eligible" | "pending_batch" | "approved" | "paid" | "blocked" | "disputed";
  lastProofEventAt: string | null;
};
```

## API Amendment

Add or refactor toward:

```txt
GET /api/v1/referrals/me
```

Existing routes should delegate to the shared source:

- `/api/v1/host/me`
- `/api/v1/referrer/dashboard`
- `/api/v1/influencer/dashboard`
- `/api/v1/partner/dashboard`

The endpoint must use `Cache-Control: no-store` for polling freshness.

## Required File-Level Amendments

- `src/app/host/streetside/page.tsx`
  - Replace local active tab logic with the shared feed.

- `src/app/api/v1/host/me/route.ts`
  - Remove `createdAt >= now - 8h` for referrer-owned submissions.
  - Delegate active/history feed to the shared source.

- `src/server/referrals/referralActorService.ts`
  - Resolve viewer ownership beyond `referralActor.userId`.
  - Include host personal codes, actor aliases, assigned links, and
    non-user-linked actors owned by the current host/referrer context.

- `src/app/api/reservations/route.ts`
  - Persist `ReferralLink`, campaign, and offer context onto the attribution
    session.
  - Replace silent `DIRECT` downgrade on attribution failure with durable retry,
    error event, or recoverable pending-attribution state.

- `src/app/referrer/dashboard/page.tsx`
  - Stop depending on legacy `ReservationAttribution` + `CommissionEntry` as
    canonical truth.

- `src/app/api/v1/referrer/dashboard/route.ts`
  - Delegate to the shared `AttributionSession` source.

- `src/app/influencer/dashboard/page.tsx`
  - Use shared feed/component.

- `src/app/api/v1/influencer/dashboard/route.ts`
  - Delegate to shared feed service.

- `src/app/partner/dashboard/page.tsx`
  - Use shared feed/component.

- `src/server/services/invu/commissionMintingService.ts`
  - After dining `CommissionAllocation` is minted, call the new bridge into the
    payout ledger.

- `src/server/payouts/payoutBatchService.ts`
  - Expose paid/pending/approved status as the canonical read model for all
    commission types.

- `src/app/api/v1/admin/revenue/allocations/[id]/mark-paid/route.ts`
  - Keep as manual override or legacy display only.
  - Do not let this be the canonical paid state used by the referrer dashboard.

- `prisma/schema.prisma`
  - Add relations/indexes only where needed to connect
    `CommissionAllocation`, `LedgerEntry`, and `PayoutBatch`.
  - Do not duplicate financial truth in dashboard-only fields.

- `src/i18n/translations/{en,es,pt}/host.json`
  - Add any new copy in all three languages.

## Acceptance Tests

### Future-Dated Referral Shows Immediately

Create a QR reservation for tomorrow. The owning referrer's active view shows it
right away and keeps showing it. No creation-time look-back is allowed.

### Anonymous Scan, Owner Sees It

Scan a street host QR from an unauthenticated mobile phone and complete the
reservation. Confirm it appears in the restaurant host dashboard. Then log in as
the street host account that owns that QR/link. The reservation must appear in
that host's active feed even though the scanner was not that account.

### Host Status Propagation

A restaurant host moves a reservation:

```txt
incoming -> arrived -> seated -> completed
```

The referrer's view reflects each status change through auto-refresh.

### Deterministic History Transition

The reservation moves from active to history once its Panama-local service
window passes or it reaches terminal status.

### Money Loop End To End

After check close, the referral shows guest spend, commission amount, commission
status, and paid/unpaid state from the payout-batch ledger.

### No Single-Tab Fix

The same shared feed/projection must power streetside, generic referrer,
influencer, and partner surfaces.

## Non-Negotiables

- INVU remains read-only.
- Refund/void routing remains by original `Payment.provider`.
- Existing commission-rate resolution is reused.
- Maker/checker payout batch mechanics are reused.
- New copy ships in EN, ES, and PT.
