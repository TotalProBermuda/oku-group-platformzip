# OKÜ Group Platform

Full-stack multi-persona hospitality platform with Experiences/Events, IR, HR, Influencer, Partner, Investor, and Staff portals, plus a complete Reservation/Venue system and Event Invitation Engine.

## Run & Operate

- **Run Dev Server**: `npm run dev -- -p 5000`
- **Build**: `_Populate as you build_`
- **Typecheck**: `_Populate as you build_`
- **Codegen**: `_Populate as you build_`
- **DB Push**: `npx prisma db push` (Sync schema - use `db push`, not `migrate dev` due to advisory lock issue)
- **Seed DB**: `npm run seed` (Populates with demo data)
- **Run Worker**: `npm run worker` (Requires `REDIS_URL`)

**Required Env Vars**:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL`
- `PRIMARY_SUPERADMIN_EMAIL` (protected owner; bootstrapped on first verified Google sign-in)
- `APP_BASE_URL` / `NEXT_PUBLIC_BASE_URL`
- `NODE_ENV=production` (in production, gates demo back-doors)
- `RELEASE_SHA=<git-sha>` (in production, tags error-capture records)
- `APP_ENCRYPTION_KEY` (32 bytes base64; required for editing payment gateway credentials in `/admin/payments`)

**Optional Env Vars**:
- `REDIS_URL` (for BullMQ worker and shared rate limiting)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (required for production team sign-in)
- `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`
- `AUTHORIZE_NET_API_LOGIN_ID`, `AUTHORIZE_NET_TRANSACTION_KEY`
- `DEMO_MODE_ENABLED=true` (for demo back-doors in non-production)
- `SENTRY_DSN` (if Sentry is used for error reporting)
- `CLOUDMERSIVE_AV_API_KEY` (production virus scanning of beneficiary uploads via Cloudmersive Advanced AV; preferred over `AV_SCAN_URL`)
- `AV_SCAN_URL` (self-hosted HTTP shim for ClamAV/GCP DLP/etc; used only when `CLOUDMERSIVE_AV_API_KEY` is unset)

## Stack

- **Framework**: Next.js 15 (App Router) with TypeScript
- **Runtime**: Node.js (`_Populate with version_`)
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Auth**: NextAuth v4 (Credentials, Google/Facebook)
- **Queue**: BullMQ with Redis
- **Payments**: Authorize.net (stubbed)
- **i18n**: Custom (JSON translations, `[locale]` routing)
- **Validation**: `_Populate as you build_`
- **Build Tool**: Next.js

## Where things live

- **App Router Pages**: `src/app/`
- **Shared React Components**: `src/components/`
- **UI Components**: `src/components/ui/`
- **Server Utilities**: `src/server/`
- **Prisma Schema**: `prisma/schema.prisma`
- **DB Seed Data**: `prisma/seed.ts`
- **Translations**: `src/i18n/translations/{en,es,pt}/{common,navigation,footer,home,venues,booking,forms,seo}.json`
- **Authentication Config**: `src/lib/auth.ts`
- **Middleware**: `src/middleware.ts`
- **API Contracts**: `src/app/api/v1/...` (routes define contracts)
- **Theme/Design System**: `src/app/globals.css` (contains luxury dashboard design system classes and glassmorphism utilities)
- **Commerce Settings**: `src/app/admin/commerce/settings/page.tsx` + `src/components/admin/commerce/CommerceSettingsPanel.tsx` (Superadmin); API `src/app/api/v1/admin/commerce/settings/route.ts`; singleton `CommerceSettings` model (id="global") in `prisma/schema.prisma`.

## Architecture decisions

- **i18n**: Custom multilingual system with `[locale]` routing for public pages, `LocaleProvider` context, and server-side translation loading with fallback.
- **Admin Portal**: Uses a shared layout (`src/app/admin/layout.tsx`) for session validation, role-based navigation via `AdminShell` and `AdminNav`, centralizing authorization and UI structure.
- **INVU Attribution**: Implemented a 3-tier matcher for POS attribution (`src/server/services/invu/invuMatchService.ts`) operating purely as a read/observer, given INVU API limitations for external reference injection. It relies on operational bindings and passive correlation for high confidence matching.
- **Payout Verification**: Implemented a maker/checker workflow for payout batches (`src/server/payouts/payoutBatchService.ts`) ensuring no payment file is produced without verification and approval by a different admin. Includes integrity checks and deterministic export trails.
- **Influencer Onboarding**: Two-track system for influencers: OKÜ-paid via `InfluencerInvite` tokens and an onboarding flow, and Host-Managed private promoters with isolated data.
- **Event-referrer ticketing surface (convergence complete for Steps 1–3; Step 4 partial)**: `/influencer/referrer-dashboard` now calls `GET /api/v1/me/referrals` (shared feed). Steps 1–3 are done: (1) `writeTicketAttributionSession` writes an `AttributionSession` row at checkout (source=TICKET_PURCHASE); (2) sub-commission rows stay in `InfluencerSubCommissionLedger` (wiring into `CommissionAllocation`/`LedgerEntry` was intentionally deferred — ISCL is the canonical ledger for ticket referrer earnings); (3) the dashboard uses `getMyReferrals`. Step 4 is **partially complete**: ISCL rows attach to a `PayoutBatch` (tracking), release on reject/discard, and surface in `getBatchDetail.subCommissionLines` — but `payoutStatus` is intentionally left at `PENDING` after export because sub-commission rows are NOT yet in the deterministic `exportPayload`/SHA-256 hash and the bank adapter does not yet emit transfer instructions for them. **"Batched" is not "paid."** The `PAID` flip is deferred until the bank adapter includes `subCommissionLines` in the payable file (see follow-up). **Double-counting risk**: actor ids from the bridge are visible to `resolveOwnedEarnerIdentities` — any attribution query scoped to those actors must filter by `AttributionSession.source` or it will match walk-in sessions that are not ticket purchases.
- **Governed Referrer Capability (canonical cross-role model)**: Referrer capability is a **governed cross-role capability, NOT a per-role feature**. Every participant that can drive referrals — streetside host, influencer, partner, legacy referrer, and future types (taxi/concierge/tour-guide/promoter/venue/employee) — must resolve to the SAME canonical model: a `ReferralActor` identity, its `ReferralLink`/QR assignments, and `AttributionSession`s created from those links. **Do not add role-specific referral feed, active/history, commission-eligibility, or paid-status logic.** All of these read from ONE shared source (`getMyReferrals` in `src/server/referrals/myReferralsSource.ts`) via the shared endpoint `GET /api/v1/me/referrals` and the shared `MyReferralsFeed` component. Onboarding a new referrer-capable role = assign/refine `ReferralActor` ownership + permissions, then it AUTOMATICALLY inherits the my-referrals feed, Panama-service-window active/history split, commission eligibility path, payout-ledger paid status, and audit/dispute trail. **UI may vary by role** (labels, theme, permissions — e.g. the referrer dashboard keeps its bespoke mobile UI) but referral identity, attribution, commission, payout status, and proof history stay governed and shared. Ownership resolution (`resolveOwnedEarnerIdentities`) must map a user to EVERY owned actor/link/assignment, including host personal codes whose `ReferralActor` is not user-linked. **Why:** the long-term value is that any referrer-capable participant can be added without inventing a new trust loop; forking feed logic per role silently drifts surfaces apart and breaks that guarantee.
- **Platform-Wide Luxury Dashboard Redesign**: A 5-tier depth system and premium design language applied across all role dashboards, defined in `globals.css` and abstracted into `src/components/ui/dashboard/` primitives.
- **Commerce Settings (singleton, non-secret)**: `CommerceSettings` row id="global"; PATCH only updates explicitly-sent keys (no Zod array defaults — prevents wiping email recipient lists); every change writes an `AuditLog` entry with before/after diff. Resend secrets stay in env and are surfaced read-only via `/api/v1/admin/launch-readiness`.
- **Encrypted gateway credentials (Payments P1)**: Authorize.net credentials may be saved by SUPERADMIN at `/admin/payments → Authorize.net` (singleton `PaymentGatewayCredential` row, `provider="AUTHORIZE_NET"`). Secrets are AES-256-GCM-encrypted with `APP_ENCRYPTION_KEY` (32-byte base64 or utf8); only `*Last4` hints are stored unmasked. Runtime config resolution: DB credential first (when `isActive && enableGateway && APP_ENCRYPTION_KEY` available), env fallback otherwise — see `getResolvedAuthNetConfig` in `src/server/authorizeNet/client.ts`. AuditLog entries (`payment.gateway.authnet.update` / `.test.succeeded` / `.test.failed`) carry only non-secret diffs and `*Changed: true` booleans — never raw values. If `APP_ENCRYPTION_KEY` is unset, the editor displays an inline disabled-state banner and PATCH returns 400.
- **Ticket Operations P0 (mobile check-in + back-office)**: Permissions split — `tickets:checkin` (RESTAURANT_HOST, STAFF_OKU, STAFF_CATCH, ADMIN_COMMERCIAL, SUPERADMIN) gates `/api/v1/checkin/{validate,manual,sessions}` and the staff scanner; `admin:tickets:read|write` (ADMIN_COMMERCIAL, SUPERADMIN) gates `/admin/tickets` (search/filter/drawer/CSV export/comp-issue). Scanner UX adds a status pill, a session selector backed by `/api/v1/checkin/sessions?range=today|future` (today: now-12h..+36h; future: now-2h..+90d), and last-5 recent-scan chips. `selectedSessionId` is sent on every check-in mutation; the service does an atomic `updateMany` claim on `ISSUED → CHECKED_IN` so concurrent scans deterministically return `ALREADY_CHECKED_IN` instead of 500. Comp issue (`POST /api/v1/admin/tickets/issue`) creates a $0 PAID Order + ISSUED Ticket with bounded P2002-collision retry on `code`/`orderNumber`, plus `AuditLog admin.tickets.comp_issued`. CSV export sanitizes formula-injection prefixes (`= + - @ \t \r`) and audits as `admin.tickets.export`.
- **Cybersource Provider Settings (Payments P3)**: Cybersource sits **beside** Authorize.net in `/admin/payments` (it does not replace it). New singleton model `CybersourceGatewayCredential` (provider="CYBERSOURCE") stores AES-256-GCM-encrypted `merchantId`/`keyId`/`sharedSecret`/`organizationId`/`portfolioId` with `*Last4` hints; non-secrets (checkoutTitle/Description, acceptedCardLogos, cardSecurityCodeEnabled, detailedDeclineMessagesEnabled, debugMode) live unencrypted on the same row. APIs: `GET/PATCH /api/v1/admin/payments/cybersource`, `POST .../test`, `POST .../clear` — all SUPERADMIN-only. PATCH refuses `enabled=true` until merchantId+keyId+sharedSecret are saved (or being set this PATCH). Test connection signs a GET to `/reporting/v3/report-definitions` (read-only, no money movement) using `buildCybersourceHttpSignatureHeaders` — base64 HMAC-SHA256 of "host date (request-target) [digest] v-c-merchant-id" with the base64-decoded shared secret. Hosts: `apitest.cybersource.com` (test) / `api.cybersource.com` (production). 2xx → pass; 401/403 → credential failure; network → connection failure; other 4xx/5xx → "credentials accepted; endpoint returned X" (still treated as authenticated). Cybersource is **DB-only** (no env fallback). AuditLog actions: `payment.gateway.cybersource.{update,clear,test.succeeded,test.failed}` — metadata carries `*Changed: true` booleans, environment before/after, and httpStatus/sanitized message; never raw values. Checkout/refund/void implementations are **out of scope for P3** — settings + readiness only. UI: new "Cybersource" tab plus provider card on the Payment Providers tab, status rows on Overview, and a per-credential summary card under System Checks. `?tab=cybersource` deep-link supported.
- **Active Checkout Gateway (Payments P4 + P5)**: `CommerceSettings.activeCheckoutGateway` (enum `AUTHORIZE_NET`|`CYBERSOURCE`, default `AUTHORIZE_NET`) is the single source of truth for which provider `/api/v1/checkout/confirm` and `/api/v1/checkout/demo` use. Service `getActiveCheckoutGateway()` (`src/server/payments/activeGateway.ts`) returns per-provider `{configured, blockers, source, selectable, lockedReason}` plus an aggregated `{active, ready, blockers}`. Selectability is now driven by the same readiness checks for both providers (configured + enabled + decryptable); the previous P4 Cybersource hard-lock was removed in P5. `PATCH /api/v1/admin/payments/active-gateway` rejects unselectable targets with the per-provider blocker and audits `payment.gateway.active.changed.rejected`. Successful switches audit `payment.gateway.active.changed` with `{before, after, ready, blockers}`; in `NODE_ENV=production` the PATCH requires `confirm:true`. Runtime guard `assertActiveGatewayReady()` runs at the top of both checkout entrypoints and returns 503 with the single-line blocker. Refunds/voids are deliberately NOT routed through this — they continue to use `Payment.provider` from the original record so historical orders settle on the gateway that took the money.
- **Cybersource Panama Launch Readiness (Payments P5a)**: Active checkout for OKÜ Panama is **Cybersource**; Authorize.net stays as inactive provider for future ReferrerOS markets. Schema default for `CommerceSettings.activeCheckoutGateway` stays `AUTHORIZE_NET` (so future tenant-aware refactors can't silently force every tenant to Cybersource); the OKÜ row is flipped to `CYBERSOURCE` by an idempotent seed step (`ensureCybersourceActiveForPanama`) only when no operator override exists. Launch-readiness blockers route through `getActiveCheckoutGateway()` — `payments.activeProviderBlockers` reflects only the active provider, with full per-provider state under `payments.providers.{authNet,cybersource}` (legacy `apiLoginIdConfigured/transactionKeyConfigured` keys preserved). Selectability requires the most recent test connection to have passed within **7 days for sandbox/test** and **24 hours for production** (`evaluateTestRecency` in `src/server/payments/activeGateway.ts`). Cybersource recency reads `lastTestStatus/lastTestedAt` from the credential row; Authorize.net reads from the most recent `launch.readiness.authnet_test{,.failed}` audit. Sentinel `CYBERSOURCE_ADAPTER_LIVE` adds the exact blocker `"Cybersource selected but live money movement adapter is incomplete."` if a future change ever stubs the adapter. Activation modal renders a required production-acknowledgement checkbox whenever target provider's environment is production; the PATCH route (`/api/v1/admin/payments/active-gateway`) requires `productionConfirmAcknowledged:true` (in addition to `confirm:true` under `NODE_ENV=production`) and writes the flag into the audit metadata. Audit metadata is built through a strict allowlist (`{before, after, attempted, environment, productionConfirmAcknowledged, ready, blockers, reason, timestamp}`) so credential bytes can never leak through this route. **Refunds/voids continue to route by `Payment.provider` on the original record** — never re-resolved through the active gateway. Stable audit/event names (`payment.gateway.active.changed{,.rejected}`, `payment.gateway.cybersource.{update,clear,test.succeeded,test.failed}`, `checkout.charge.{succeeded,failed}`, `order.refund.{succeeded,failed}`, `order.void.{succeeded,failed}`) preserved for future Orb usage-metering. Banesco bulk payouts and outbound beneficiary banking are explicitly out of scope.
- **Real Payment Gateway Runtime Layer (Payments P5)**: Both Authorize.net and Cybersource are real website payment processors via a shared `PaymentProviderAdapter` interface (`src/server/payments/providers/types.ts`) — `getStatus / testConnection / charge / refund / voidPayment` returning normalized inputs/results. Adapters: `authNetAdapter.ts` wraps the existing Authorize.net JSON client; `cybersourceAdapter.ts` calls signed REST endpoints in `src/server/cybersource/transactions.ts` (`POST /pts/v2/payments`, `/refunds`, `/voids`) using `buildCybersourceHttpSignatureHeaders`. Cybersource adapter accepts a Microform `cybersourceTransientToken` (production-safe) or sandbox-only raw `cybersourceCard` data. Factory `getProviderAdapter(provider)` (`src/server/payments/providers/index.ts`) is the routing entry-point for refund/void; `getActiveCheckoutAdapter()` is used ONLY by `/checkout/confirm`. Charge persistence: `Payment.provider` set to active provider + generic fields `gatewayTransactionId / gatewayReferenceId / gatewayAuthCode / gatewayResponseCode / gatewayRawSafeJson` (Json) populated for both providers; legacy `authNetTransId / authNetRefId` continue to be filled when provider is Authorize.net. Refund (`/api/v1/admin/orders/refund`) and void (`/api/v1/admin/orders/[id]/cancel`) routes resolve their adapter from `Payment.provider` (never from active gateway) — DEMO is blocked, missing `gatewayTransactionId` (with legacy `authNetTransId` fallback) is blocked, unknown provider returns "Adapter unavailable". Refundable-orders eligibility classifier surfaces the correct `Adapter unavailable` / `Missing {provider} transaction id` reasons. Audit actions: `checkout.charge.failed`, `order.refund.{succeeded,failed}` and `order.void.{succeeded,failed}` carry `provider` in metadata. NO POS/INVU/payout flows are touched — strictly website checkout (TICKET / EXPERIENCE / EVENT / MEMBERSHIP).
- **Beneficiary Verification (Banesco bank-readiness)**: OKÜ captures beneficiary bank info and tracks bank-readiness — this is **NOT** formal KYC/AML; Banesco performs that during their own onboarding. New role `ADMIN_FINANCE` with permissions `admin:beneficiaries:{read,write}` and `admin:payouts:write` (deliberately not granted broader admin permissions for finance separation). Singleton `BeneficiaryProfile` model (1:1 on `userId`) stores AES-256-GCM-encrypted `banescoAccountNumberEncrypted` + `banescoAccountLast4` (only the last 4 ever surface in any UI), per-document statuses (`BeneficiaryDocStatus` enum, no uploads in P1 — manual review only), and three orthogonal status concepts surfaced as distinct UI labels: **OKÜ approval** (`okuApprovedAt`), **Bank readiness** (`BankReadinessStatus` state machine), and **Payout eligibility** (derived). State machine `MISSING_INFO → READY_FOR_REVIEW → OKU_APPROVED → AWAITING_BANK_CONFIRMATION → BANK_READY` with orthogonal `REJECTED`/`ON_HOLD`; `upsertOwnProfile` auto-promotes MISSING_INFO→READY_FOR_REVIEW when bank fields are complete and reverts OKÜ approval if bank fields change after approval. Self-service: `/my/beneficiary` for the beneficiary themselves (bank fields only — never document statuses). Admin override: `/admin/payouts/beneficiaries` (SUPERADMIN + ADMIN_FINANCE) — full bank fields + document statuses + notes + manual transitions with reason. APIs: `GET/PATCH /api/v1/me/beneficiary`; `GET /api/v1/admin/payouts/beneficiaries`; `GET/PATCH /api/v1/admin/payouts/beneficiaries/[userId]`; `POST .../[userId]/transition`. **Payout batch gating**: `previewBatch` adds new `BlockingReason` values `BENEFICIARY_PROFILE_MISSING`/`BANK_NOT_READY`/`COMPLIANCE_HOLD`. `createDraft`, `submitForApproval`, and `approve` all re-check via `assertBeneficiaryReadinessForInfluencers` inside their tx and refuse with a single error listing every blocked influencer by display name and reason — so a beneficiary demoted to ON_HOLD between draft and approve cannot slip into a bank file. Refund/void routing is unchanged — they continue to route by `Payment.provider` on the original record. Every transition + override audit-logged via `AuditLog` (`beneficiary.upsert.*`, `beneficiary.transition`).
- **Refunds & Website Order Controls (Payments P2)**: `/admin/payments?tab=refunds` shows website-only refundable orders (`OrderType` ∈ TICKET/EXPERIENCE/EVENT/MEMBERSHIP — DINING/PRIVATE_BOOKING are POS/INVU and excluded). Listing API: `GET /api/v1/admin/payments/refundable-orders?q=` (searches orderNumber/user.name/user.email/payment.authNetTransId/ticket.code). Eligibility classifier returns `{ refundEligible, voidEligible, demoOnly, blockedReason }` — UI labels them "Refund possible / Void possible" since the gateway makes the final decision (settlement timing). DEMO provider rows are tagged "Demo only" and never produce gateway calls. Audit list reuses `recentPaymentAudits` from launch-readiness (sanitized fields only — `gatewayErrorMessage`, `message`, or txid summaries; no raw gateway payloads). OrderDrawer Payment tab surfaces provider DEMO/AUTHORIZE_NET state, refund-availability or blocked-reason banner, last-failed-action banner, and an "Open payment controls" deep link.

## Product

- Multi-persona platform (Admin, Influencer, Partner, Investor, Staff, Attendee).
- Experiences/Events module with discovery, ticketing, waitlists, and check-in.
- Comprehensive Reservation/Venue system with host interfaces, dynamic booking wizard, and waitlist management.
- Referral and commission tracking for influencers and partners.
- Admin dashboards for experiences, analytics, orders, users, payouts, and operations.
- Dynamic hiring system with job listings and application forms.
- Integrated internationalization (EN/ES/PT).
- Sponsorship Marketplace and Placement Engine for brand partnerships.

## i18n parity rule (OKÜ/Foodie app)

Any production user-facing copy in this app must exist in **EN, ES, and PT** before the feature is considered complete. This applies to:

- public site, checkout, tickets, member/account pages
- referrer / influencer / partner dashboards
- beneficiary verification, payout trust copy
- privacy / security notices
- support / dispute flows
- transactional emails and receipts

**Do not assume English is the source language.** If a string is authored first in Spanish or Portuguese, create the EN and remaining-locale entries before merging.

Verification step: run `npm run i18n:check` (script at `scripts/check-i18n-parity.mjs`). It diffs every JSON namespace under `src/i18n/translations/{en,es,pt}/` and exits non-zero if any locale is missing keys vs. the union of all locales. It is wired into two automatic gates so the rule cannot drift:

- **Post-merge** — `scripts/post-merge.sh` runs `npm run i18n:check` after `prisma db push`. A locale gap fails the merge setup and surfaces in the merge log.
- **Registered validation** — available as the `i18n` validation command, so it can be run on demand alongside other quality gates.

This rule is scoped to the current OKÜ/Foodie app only — not a future ReferrerOS thesis.

## User preferences

- **I want iterative development:** I prefer to work in small, incremental steps.
- **I want simple language:** Please use clear and concise language. Avoid jargon where possible.
- **I like functional programming:** I prefer solutions that leverage functional programming paradigms.
- **Ask before making major changes:** Always discuss significant architectural or design changes with me before implementation.
- **Do not make changes to the folder `public/images/oku/`**: This folder contains optimized real photography assets and should not be modified.
- **Do not change the Navbar logo at `/images/oku-logo-wordmark.png`**: This is a permanent rule; never replace it with text, SVG, or any other image.

## Gotchas

- **Prisma DB Sync**: Always use `npx prisma db push` instead of `migrate dev` to avoid advisory lock issues.
- **Admin Layout**: All admin pages (`src/app/admin/*`) are wrapped by `src/app/admin/layout.tsx`. Do not include embedded headers or tab bars within individual admin page files.
- **Demo Mode in Production**: Ensure `DEMO_MODE_ENABLED` is never set to `true` in production and `NODE_ENV=production` is always set to gate demo back-doors.
- **Rate Limiting**: For multi-instance deployments, ensure `REDIS_URL` is configured for shared rate limits; otherwise, limits are per-instance.
- **Refund/void routing vs active gateway**: `CommerceSettings.activeCheckoutGateway` (Payments P4) only decides which provider takes the *next* checkout. Refunds, voids, and cancellations must continue to route by the persisted `Payment.provider` on the original order — never re-resolve them through `getActiveCheckoutGateway()`, or you will try to refund an Authorize.net charge through Cybersource (or vice-versa) when admins switch providers.
- **OKÜ Panama is Cybersource-only**: If `CommerceSettings` ever becomes tenant-aware, do **not** inherit a Cybersource default — each tenant must explicitly pick their active gateway. The schema default stays `AUTHORIZE_NET`; the Panama row is flipped by the idempotent seed step `ensureCybersourceActiveForPanama` only when no operator override has been recorded.
- **INVU Attribution**: The system relies on host actions (like binding tables) for reliable INVU attribution; manual entry of booking codes into INVU is a manual workaround and not the primary integration path.

## Pointers

- **Next.js Docs**: [https://nextjs.org/docs](https://nextjs.org/docs)
- **Prisma Docs**: [https://www.prisma.io/docs](https://www.prisma.io/docs)
- **NextAuth.js Docs**: [https://next-auth.js.org/](https://next-auth.js.org/)
- **BullMQ Docs**: [https://docs.bullmq.io/](https://docs.bullmq.io/)
- **Authorize.net API Docs**: [https://developer.authorize.net/](https://developer.authorize.net/)
- **i18n Translation Files**: `src/i18n/translations/`
- **DB Schema**: `prisma/schema.prisma`
