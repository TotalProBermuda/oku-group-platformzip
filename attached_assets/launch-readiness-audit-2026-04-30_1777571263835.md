# Launch Readiness Audit — 2026-04-30

## Fixed in this pass

- Replaced third-party QR image generation with local `qrcode.react` rendering in:
  - `src/components/referral/GuestQRPanel.tsx`
  - `src/components/admin/ReservationBlocksPanel.tsx`
- Fixed failed checkout captures so reserved ticket capacity is released instead of leaving sessions artificially sold out:
  - `src/app/api/v1/checkout/confirm/route.ts`
  - `src/server/commerce/capacity.ts`
- Fixed generated event/referrer URLs that pointed at non-existent `/events` pages. They now point to the existing `/series` surfaces:
  - `src/server/events/eventReferrerService.ts`
  - `src/server/partnerSeats/service.ts`
- Hardened Streetside Host QR provisioning so each host-owned `EventReferrerAssignment` also has a matching `ReferralActor`. Without this, QR reservations could be created without a usable commission/referral actor if the migration had not already run.
- Added log and ZIP archive patterns to `.gitignore`.

## Highest launch blockers still visible

- `next.config.mjs` currently disables build failures for both TypeScript and ESLint. That hides real launch blockers from CI/build checks.
- Public checkout surfaces still contain demo-only purchase paths. Several pages call demo/order endpoints that require `SUPERADMIN` or `DEMO_MODE_ENABLED`, so non-admin ticket purchasing needs a production checkout pass.
- There is no standard test runner configuration in the repo. Existing verification is mostly smoke scripts, so launch-ready tests need to be formalized around reservations, QR attribution, checkout, commission minting, persona redirects, and demo-mode gating.
- `.env.local` was present in the ZIP export. Do not push it. If real secrets were ever committed or shared, rotate them.

## Recommended next queue

1. Add a real `npm test` / `npm run typecheck` / `npm run launch:check` suite.
2. Replace demo ticket checkout from public pages with the `/checkout/intent` + `/checkout/confirm` production flow, preserving `?ref=` into `eventReferrerCode`.
3. Turn TypeScript and ESLint build failures back on once the current errors are surfaced and fixed.
4. Add an end-to-end QR flow test:
   - Streetside host opens `/host/streetside`
   - QR encodes host referral code
   - Guest scans to reservation path
   - Reservation creates `AttributionSession.referralActorId`
   - Host dashboard shows the booking
   - POS bind/close mints or reports commission only when eligible
5. Add event QR flow test:
   - Event/partner/referrer QR opens `/series/:slug?ref=CODE`
   - Checkout carries `CODE`
   - Paid order stores `attributedEventReferrerAssignmentId`
   - Commission/reporting follows the assignment eligibility settings
