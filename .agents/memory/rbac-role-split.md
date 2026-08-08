---
name: RBAC role split — FB_DIRECTOR / RESTAURANT_SUPERVISOR
description: Governance boundaries for the new ops/host roles that replaced ADMIN_COMMERCIAL; covers permissions, middleware routing, and what each role must never access.
---

# RBAC Role Split — FB_DIRECTOR / RESTAURANT_SUPERVISOR

## The rule

ADMIN_COMMERCIAL is **zero-permission** (fail-closed). Any session token still carrying it is denied at every permission and route check.

**FB_DIRECTOR** — restaurant F&B operations persona:
- Gets: menus, experiences, series, spaces, operational analytics, tickets, capacity, orders, memberships. Uses `admin:orders:read` (scoped) — NOT `admin:audit:read` (which also gates user/payout/referral/compensation APIs).
- Does NOT get: payouts, compensation, commission rules, revenue analytics, refunds, user-edit, audit, security, beneficiaries, attribution anchor, ledger-outbox.
- Reaches `/admin` shell. Does NOT reach `/host/*`.

**RESTAURANT_SUPERVISOR** — live-service host portal persona:
- Gets: `host:reservations:checkin`, `tickets:checkin`, `admin:operations:read`.
- Does NOT get: any admin-domain write permissions, no `/admin` shell access.
- All venue-scoped host endpoints (bookings, analytics, reservation blocks, gift bags, space assignment) **require a RestaurantHostProfile**; no profile → 403. No `findFirst()` fallback is ever acceptable.
- Cross-venue access is blocked with non-enumerating 404 via `series.venueId` comparison.

**Why:** ADMIN_COMMERCIAL mixed F&B ops with finance/governance. Splitting enforces least-privilege — an F&B director cannot approve payouts; a floor supervisor cannot reach the admin shell or another venue's data.

## How to apply

- New admin API routes for ops (menus, experiences, spaces, analytics, orders) → add `FB_DIRECTOR`.
- Finance/governance routes (payouts, referrals, commission-rules, compensation, ledger-outbox, revenue) → SUPERADMIN only.
- New host API routes → add `RESTAURANT_SUPERVISOR` alongside `RESTAURANT_HOST`, and add profile-venue scoping if the resource is venue-scoped.
- `requireAnyPermission(roles, "admin:audit:read", "admin:orders:read")` is the pattern for order/series listing routes accessible to both FB_DIRECTOR and finance roles.
- ROLE_ROUTES single source of truth: `src/lib/routePolicy.ts` — imported by both middleware and tests.

## Prisma migration note

`prisma migrate dev` fails in this project because a shadow-DB migration cannot cleanly apply to a fresh DB. Always use `npx prisma db push --skip-generate` then `npx prisma generate` for schema changes.
