---
name: Streetside host referral identity
description: Why streetside hosts need a profile-independent ReferralActor+ReferralLink, and how they inherit the governed my-referrals feed.
---

# Streetside host referral identity

Streetside hosts (role STREETSIDE_HOST) do **not** have a `RestaurantHostProfile`.
The profile-based `provisionHostPersonalReferrer` path therefore never runs for them,
so historically their Guest QR carried no `?ref=` code and every anonymous scan+book
produced an unattributed DIRECT `AttributionSession` — invisible in their "Active" feed.

**Rule:** any referrer-capable role that lacks a host profile must still be given a
governed identity directly: a user-linked `ReferralActor` (+ an ACTIVE `ReferralLink`
with a resolvable code). That is the ONLY thing needed — the shared feed
(`getMyReferrals` / `GET /api/v1/me/referrals` / `MyReferralsFeed`) is then inherited
automatically, because ownership resolves via `ReferralActor.userId` and attribution is
keyed on `AttributionSession.referralActorId`.

**Why:** this is the canonical governed cross-role referrer model (see replit.md). Do NOT
add role-specific feed/active/history/commission logic; onboarding a new referrer role =
assign/refine `ReferralActor` ownership, nothing more.

**Two feeds, divergent shapes (client gotcha):** the streetside Active tab (`src/app/host/streetside/page.tsx`) merges bookings from BOTH `/api/v1/host/me` (primary `loadBookings`) and `/api/v1/host/bookings`. Their `attributionSession` includes DIFFER — `/host/me` selects only `referralActor`/`legacyReferrer` (NO `tableSession`, NO `bindings`), while `/host/bookings` includes both. So on the client, `session.tableSession` and `session.bindings` can be `undefined`; every read must stay defensive (`session?.bindings?.[0]`, `session?.tableSession?.…`) and the `Booking` type marks both optional. **Why:** a non-defensive `session.bindings[0]` crashed the page for any booking that arrived via the `/host/me` feed.

**How to apply:** `ensureStreetsideReferralIdentity(db, userId, displayName)` in
`src/server/referrals/streetsideReferralService.ts` is idempotent and race-safe.
Always **reuse before create**: reuse an actor the user already owns (by `userId`, else via
their legacy `Referrer.referralActor`) before minting a new one, then reuse an ACTIVE link
before minting `HOST-<nanoid>` (bounded P2002 retry). It takes the Prisma client as a param
so both the app singleton and the seed's own client can call it. `/api/v1/host/me`
lazy-provisions on read (returns `streetsideReferralCode`; failure -> `provisionFailed`
banner, never 500); the profiled-host `personalReferrerAssignment` path still takes priority.
