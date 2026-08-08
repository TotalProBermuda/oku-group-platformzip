---
name: Host reservation visibility split
description: /api/v1/host/me returns two role-gated, non-overlapping reservation lists; a host surface that reads only one shows empty for the other role.
---

# Host reservation visibility is split across two role-gated lists

`/api/v1/host/me` returns reservations in **two separate lists that do not overlap**, each gated by a different role:

- `mySubmissions` — gated by `isStreetsideHost` (role `STREETSIDE_HOST`). The viewer's **personal QR funnel**: bookings either `source=STREETSIDE_HOST` with a handoff sent by them, OR whose `attributionSession.referralActor.userId === viewer`. Empty for non-streetside hosts.
- `todayReservations` — gated by `isRestaurantHost` (role `RESTAURANT_HOST`/`SUPERADMIN`). The **venue-wide active queue**: `venueId` match, `reservationDate` in now-12h..now+30h, status NOT IN [CANCELLED, COMPLETED]. Empty for pure streetside hosts.

**Why this matters:** a confirmed website (`UMBRELLA_SITE`) reservation lands in `todayReservations`, never in `mySubmissions` (unless it happens to be attributed to that exact host's referralActor). The `/host/streetside` page historically rendered its Active tab from `mySubmissions` only, so a `RESTAURANT_HOST`/`SUPERADMIN` opening that page saw "No active bookings" even though the booking was active and seatable. The seat/status flow itself was never broken — only the list the page chose to read.

**How to apply:** any host-facing surface that needs to show "the venue's active reservations" must read `todayReservations` (or merge both lists, deduped by `id`, preferring the `todayReservations` record — it carries the richer `attributionSession` shape with `bindings`/`tableSession` for INVU bind UI). Do not assume `mySubmissions` is the venue queue; it is a per-viewer attribution funnel. Broadening what a pure `STREETSIDE_HOST` sees is a separate product decision — `todayReservations` is server-gated to restaurant hosts, so merging it client-side does NOT expand streetside-host access.

## SSR-query vs polling-endpoint include drift (referred-by renders "—")

A single host drawer can be fed by **two different Prisma queries that must stay in sync**. The `/host/operations` board is hydrated by an SSR query (in `src/app/host/operations/page.tsx`) for first paint, then re-hydrated every ~20s by the polling endpoint `/api/v1/host/queue` (`getHostQueue` → `INCLUDE_FULL`). When only the polling include carried `attributionSession` (referralActor/legacyReferrer) and the SSR include omitted it, the drawer's "Referred by" line rendered `—` for **actor-only attribution chains** — host referral links, `INFLUENCER_SUB_REFERRER`, etc. — because those have NO legacy `attributions` row to fall back on. Commission still showed (it reads the `commissionEligible` scalar, always returned).

**Why:** the legacy `ReservationAttribution` row is only written when the resolved actor has a `legacyReferrerId`; pure host-link / sub-referrer actors live only in `AttributionSession.referralActor`, so any query missing `attributionSession` blanks them.

**How to apply:** the canonical reservation include for host surfaces is the exported `INCLUDE_FULL` in `src/server/host/hostService.ts`. Reuse it in BOTH the SSR page query and any polling/API endpoint feeding the same component — never hand-roll a second inline include, or attribution fields silently drift. The "Referred by" resolver order is `attributionSession.referralActor.displayName → attributionSession.legacyReferrer.fullName → attributions[0].referrer.fullName`. For clean labels across every commission-eligible type, use the `REFERRER_TYPE_LABEL` map (not `SOURCE_LABEL`, which also feeds the source-filter dropdown).
