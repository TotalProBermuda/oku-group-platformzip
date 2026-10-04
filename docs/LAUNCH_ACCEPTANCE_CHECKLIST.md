# Launch acceptance — ten workstreams

Updated 3 October 2026. This is the completion checklist, not another scope plan.
Source evidence: LAUNCH_EXECUTION_LOG_2026_10_03.md and the linked tests/PRs.
`[x]` means that specific check passed; it does not imply production deployment.
An entire workstream closes only when its remaining acceptance checks pass.

## 1. Release baseline — IN PROGRESS
- [x] GitHub/Replit source synchronized at 2bd7322e; Replit working tree clean.
- [x] Replit regression selection: 272 tests / 40 files passed.
- [x] Replit automatic post-merge hook inspected: absent; pull ran no migration.
- [ ] Current production SHA matched to source and usable rollback verified.
- [x] Replit build of 2bd7322e completed: BUILD_EXIT=0. Build skips types/lint;
      those checks remain separate under operational readiness.
- [ ] Eligible release deployed and smoke-tested. No republish performed in this batch.

## 2. Payments and refunds — IN PROGRESS / APPROVAL GATES
- [x] Review-branch Superadmin draft controls and membership exclusion preview:
      POS/web separation, verified identity/history gates, no split-table blanket
      exclusion, draft-only export. 47 focused tests pass; NOT live commission enforcement.
- [ ] Audited rule persistence, owner scope decision, verified INVU mapping and
      transaction-time snapshots integrated across every commission creation path.
- [x] Membership annual refund quote engine implemented in a review branch:
      approved 30-day structure, actual-paid principal proration, disclosed extras,
      no ordinary discount clawback or separate ticket cancellation. 27 tests pass.
      No live route, request workflow, migration or financial action. See
      MEMBERSHIP_REFUND_POLICY_IMPLEMENTATION.md for integration/approval gates.
- [x] Ticket refund request validation implemented, merged in PR110 and tested.
- [x] Existing payment/webhook regression selection passes; not settlement evidence.
- [x] Pure refund admission rules implemented: cumulative balance, reserved/unknown
      amounts, replay and request binding. 23 model tests; 49 focused tests pass.
      Not wired to live routes; NOT proof of database concurrency safety.
- [ ] Durable cumulative/concurrent refund limits and unknown-result reconciliation.
- [ ] Partial bundle refunds restore each affected entitlement/capacity exactly once.
- [ ] Owner approves refund policy, any migration, and controlled live financial tests.

## 3. Checkout/customer completion — IN PROGRESS
- [x] Signed-in email mismatch rejected before order/hold mutation (PR111).
- [x] Contact autofill and server-derived receipt email implemented (PR111).
- [x] Isolated 390px ticket flow: duplicate bank callbacks auto-continue once.
- [x] CATCH deep link preselects the actual reservation wizard preference (PR111).
- [x] Guest eligibility repair implemented and isolated tests pass: contact match
      cannot confer membership, newsletter or invitation benefits. Public guest
      purchase remains available. Review-gated; NOT merged/deployed/verified live.
- [ ] Guest eligibility repair reviewed and authorized for deployment.
- [ ] Both flows pass failure/retry/back/refresh matrix, 320/390px and supported locales.
- [ ] Deployed receipt, ticket/booking access and returning-customer journey verified.

## 4. Onboarding — IN PROGRESS
- [x] Sign-in failure recovery implemented and tested: network errors restore
      controls, no automatic credential replay, confirmed session required for
      navigation. Actual isolated page at 320px: error visible, button enabled,
      document width 320px. Existing fragment token survives StrictMode replay.
      This is not the separate 24-hour invitation feature or live verification.
- [x] Failed/uncertain email delivery revokes only its own unused token; concurrent
      resend is not revoked. Authentication suite: 21 tests passed. No real sends.
- [x] Existing expiry/replay/suspension and same-purpose resend guards tested.
      Login lifetime remains 15 minutes; this does not complete 24-hour invitations.
- [ ] Separate 24-hour invitation purpose from short-lived login authentication.
- [ ] Resend/revoke/expiry/replay and owner/seller/independent affiliation tested.
- [ ] Authorized delivery test and end-to-end onboarding completed.

## 5. Dashboard discovery and mobile — IN PROGRESS
- [x] New membership draft workspace linked from Memberships and explicitly
      Superadmin-guarded on server. Isolated Chrome component checks at 320/390/1024px
      pass (no overflow/errors; controls/export functional). Not a role-session or
      full dashboard acceptance test; English-only draft copy still needs localization.
- [x] Dashboard navigation regression tests included in passing Replit selection.
- [ ] Task-based mobile checks for customer, Superadmin, F&B, events, hosts,
      partner, seller, independent referrer and finance/beneficiary.
- [ ] Tickets/orders/dashboard reachable through visible menus for every relevant role.
- [ ] Actual iPhone/Android acceptance (viewport simulation alone is insufficient).

## 6. Reservations and events — IN PROGRESS
- [x] Reservation regression selection included in the 272 passing tests.
- [ ] Weekdays, holiday overrides, split shifts, overnight and notification timezone agree.
- [ ] Event cutoff/late override, postponement/cancellation and all ticket scopes verified.
- [ ] Multi-date capacity acquisition/release tested atomically under concurrency.

## 7. Emails and content — OPEN
- [x] Translation key parity passes: EN/ES/PT, 23 namespaces (not translation quality).
- [ ] Lifecycle templates checked for escaping, links, locale, time, fees and mobile layout.
- [ ] Delivery checked with approved test recipients; configuration is not delivery evidence.
- [ ] Correct CATCH hero and editable opening-hours propagation verified on live pages.

## 8. Bank details and payouts — OPEN / EXTERNAL GATE
- [ ] Existing bank capture verified through onboarding, masking, authorization and audit.
- [ ] Banesco official specification supplied and exporter validated against it.
- [ ] Bank acceptance test approved/completed; no payouts authorized in current scope.

## 9. Operational readiness — BLOCKED / IN PROGRESS
- [ ] Production demo-mode/accounts finding resolved with owner-approved remediation.
- [ ] Clean build, type-check assessment, dependency/security review recorded.
- [ ] Monitoring and backup/restore rehearsal verified without risking live data.

## 10. Shortcuts, reviews and retention — OPEN
- [ ] Home-screen instructions verified on iPhone/Android; referral attribution retained.
- [ ] Approved review destinations and neutral post-INVU-close policy supplied.
- [ ] Verified-close-only, deduplicated review trigger tested without customer sends.
- [ ] Optional recommendations appear only after authoritative purchase confirmation.

## Next execution gates

1. Finish candidate build / deployment identity / rollback checks; do not publish blindly.
2. Close guest eligibility and durable refund safety before polishing upsells.
3. Continue onboarding and role-task mobile checks independently of bank-spec approvals.

Replit shell recovered on 3 October. Confirmed clean 2bd7322e and no running Next
server before one build. Build completed successfully; log retained in Replit at
/tmp/oku-release-build-2bd7322e.log. Current deployment log identifies deployment
8c0a8937, but its Git SHA and rollback remain unverified. No republish performed.
Guest eligibility branch regression: 277 tests / 40 files passed. No migration,
real payment/refund/payout, invitation, account/role or rate-setting changes made.

No workstream is falsely marked fully complete. Owner/external gates do not prevent
independent implementation and isolated testing elsewhere on this checklist.
