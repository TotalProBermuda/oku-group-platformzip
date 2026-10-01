# Launch-readiness evidence — 2026-10-01

## Scope and safety limits

Base: main `d39d87dd605cec4f3e91001dd979bd702e1fbb27`. Branch: `codex/launch-navigation-continuity`.
No schema/migration, permission policy, gateway configuration, commissions or finance-rule changes. No real card submissions, refunds, payouts, invitations or outgoing emails. Existing untracked user assets were not staged.

## Implemented in this branch

- Checkout resumes once after the same-origin, expected-frame bank callback; only explicit server order confirmation renders success. Duplicate callbacks are ignored. Synchronous in-flight guard prevents overlapping submissions.
- Lost confirmation responses, server 5xx and unexpected success-shaped responses become an uncertain-result state, not a card decline. Payment/back controls are blocked and My Orders is offered. This is browser-session protection, not a substitute for server reconciliation or cross-session idempotency.
- Bank iframe collapses after return. Success actions wrap on narrow screens; ticket access preserves an existing authenticated session.
- Desktop dashboard uses the existing canonical role destination. Mobile exposes host/referrer/finance destinations. Account/reservations and phone-help links are discoverable; localized `/my` delegates to the canonical `/my` route. No access permissions expanded.
- New `/save-to-phone` instructions distinguish shortcuts from an offline app, and warn against saving token/payment URLs. Based on Apple and Google device documentation linked from the page. English only in this increment; translations remain outstanding.
- Ticket confirmation email uses the booked session (not the series date), explicitly in Panama time; displays stored service fee/tax/discount amounts; links to My Tickets; stacks ticket details for mobile; escapes customer/catalogue text. Existing emails are not resent or modified.

## Tests and observations

- 94 tests passed across 17 files: checkout continuation, expiry, charge outcome, payer authentication request/results, commerce rules/check-in/issuance/hold/startup safety, email rendering and role boundaries.
- `git diff --check` passed.
- Full `tsc --noEmit`: **failed, 468 diagnostics** in this environment. No diagnostic matched changed application files. Dependencies reuse the pre-existing local install; this is not a clean-install build certification. Next configuration currently skips type/lint failures during build. Do not interpret a successful deployment as full type safety.
- Local Next preview at 127.0.0.1:3107 used a scrubbed environment and deliberately unreachable test database. `/save-to-phone` rendered at 390×844 without horizontal overflow visible in the screenshot.
- Local Vite fixture renders the real checkout component with mock fetch/Flex/auth only. No real gateway, email provider or DB. At 390px, success actions stack and remain readable.
- Browser approval scenario: mock bank emits two completion messages. Exactly **2 confirm calls total** (initial challenge request + one continuation), automatic success, no additional Pay click.
- Lost-response scenario: exactly 2 calls; no success screen, no fresh-attempt button; Pay/Back disabled; My Orders offered.
- Definitive-decline scenario: failure displayed; fresh-attempt action resets to ticket selection without submitting another confirmation.
- Isolated mobile REFERRER and RESTAURANT_HOST menus exposed correct `/referrer/dashboard` and `/host/dashboard` links; desktop shortcuts agree. These fixtures test navigation presentation, not production role authorization or destination data.
- Existing Sep 30 ticket confirmation inspected in Gmail read-only: inbox delivery, branded layout present, missing date/time and separate fee/tax rows confirmed. This is one delivered message, not a spam-deliverability certification or proof of settlement.
- Fixture initially failed when NextAuth expected a process environment; fixed by explicitly mocking sign-out. Fixture has a harmless Vite-only styled-jsx attribute warning; production Next compiles styled-jsx.

## Reproduce isolated checks

```sh
npx vitest run tests/server/payments/checkoutContinuation.test.ts tests/server/payments/chargeOutcome.test.ts tests/server/payments/cardExpiry.test.ts tests/server/cybersource/payerAuthentication.test.ts tests/server/cybersource/payerAuthenticationRequest.test.ts tests/server/commerce tests/server/rbac/roleSplitAuthz.test.ts
node tests/fixtures/checkout-preview/server.mjs
```

Fixture URLs: localhost:3108, `?scenario=lost-response`, `?scenario=declined`, `?scenario=navigation&role=REFERRER`, `?scenario=navigation&role=RESTAURANT_HOST`. Use only fabricated information; secure fields are simulated and no card is required. Fixture tests are not a live issuer certification.

## Not launch-certified / remaining decisions

1. Payment reconciliation/webhook ordering and cumulative/idempotent partial refunds need further review and isolated tests. No real refund test authorized. The separate reservation payment flow is not verified by this ticket-checkout fixture.
2. Invitation lifetime: current shared sign-in tokens are 15 minutes. A 24-hour onboarding invitation should be separate from a short-lived login token; not changed or weakened here. Provisioning/bank-detail capture and affiliation-vs-commission relationships need a dedicated design/permission review.
3. Broad staff/partner/seller dashboards and operational actions still require a role-by-role mobile test matrix. Existing personal-route permission mismatches for some standalone roles are not resolved by adding navigation links; permissions remain unchanged.
4. Series/multiple-event entitlements, capacity atomicity, cancellation/refund policies, bank batch-export certification, and financial rule approval remain separate launch gates. No NACHA/Banesco suitability claim.
5. Full email suite needs iPhone/Android/Outlook rendering, translations and deliverability checks. Existing inbox evidence covers a ticket confirmation, not all invitations or reservation lifecycle messages.
6. No new live payment or settlement verification performed. No CyberSource security settings changed. Home-screen install tested as guidance only, not actual iOS/Android installation or referral persistence certification.

## Release gate and rollback

This report distinguishes implemented/local-tested from merged/deployed. At report creation, these changes are **not deployed**. Review PR checks before merging. Do not bypass a failing relevant check. Production rollout must first verify no pending migration or proposed schema change; cancel if Replit proposes one. Rollback is the prior Replit deployment, or revert this code-only commit and republish. Never run db push / accept-data-loss / reset to roll back.

After an approved merge, the Replit Shell command is:

```sh
GIT_EDITOR=true git pull --no-rebase origin main
```

Then inspect Publishing before republish: no database changes permitted. If merge is unfinished, inspect `git status` first; do not force-reset user changes.
