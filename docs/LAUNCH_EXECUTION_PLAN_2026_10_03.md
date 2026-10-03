# Launch execution plan — 3 October 2026

## Objective and evidence baseline

Complete the ten launch-readiness workstreams as one customer-and-operations
journey, not ten independent feature lists. This plan is not a launch approval.

- User supplied Replit main ce36935b, 239 passing tests in 37 files, and a
  successful build. Build configuration skips type/lint checks.
- Last isolated type-check evidence: 266 diagnostics, including 56 in src.
- Development preview smoke checks: CATCH, initial reservation steps, demo
  partner dashboard, empty tickets and orders pages loaded. At 390px the
  reservation and login pages had no document-width overflow.
- Preview missing generated resend.js was cleared by restarting the development
  server. Do not build into .next while a dev server uses the same directory.
- CATCH's concept query did not preselect the experience. This is a reproduced
  UX issue, not yet repaired.
- Production SHA, rollback deployment and current readiness gates remain to
  be verified. Demo-mode observations in old reports are historical, not a
  fresh production finding. Demo mode in development is not itself a defect.

## Operating rules

Every finding gets: ID, severity, affected journey, reproduction, intended
behaviour, fix/commit/PR, tests, deployment revision, evidence and remaining gate.
States: unassessed / reproduced / implemented / tested / merged / deployed /
verified / blocked-for-owner. Never collapse merged into deployed or verified.

Inspect before changing. Reuse existing implementation and tests; do not rewrite
working modules. Historical plans are hypotheses to reconcile, not automatic
requirements to migrate data or change access. Use small reversible PRs, targeted
tests during development and one broad regression/build pass per release candidate.
No fixed completion date until the first baseline audit identifies real blockers.

No charges, refunds, payouts, customer invitations, rate changes, permission
expansion, security weakening, deletion or production DDL. Tests use isolated
fabricated data and mocked/sandbox external providers. A durable safety repair
requiring a migration is designed and tested in isolation, then held for approval;
do not substitute an in-memory guard just to avoid a migration.

## Dependency-ordered execution

| Batch | Workstreams covered | Required output and acceptance |
|---|---|---|
| A: release baseline | 1 release; 9 operations | Compare GitHub, Replit and deployed revisions; preserve local changes; identify usable rollback; inspect readiness, schema parity and environment separation read-only. Reconcile old PRs and historical space/access issues. Report type/lint/security failures without suppressing them. |
| B: money and inventory | 2 payment safety; 6 reservations/events | Write transition tables for ticket orders, reservation deposits, refunds, entitlements and capacity. Test duplicate/concurrent requests, replayed/out-of-order webhooks, lost responses, partial/cumulative refunds and atomic bundle holds/releases. Uncertain money outcomes must reconcile, never invite blind retry. |
| C: customer completion | 3 customer journey; 5 navigation/mobile; 7 communications; 10 retention | Exercise guest and signed-in checkout for both flows; validate minimum contact data, consent and ownership; preserve non-sensitive entries through recoverable failures; auto-continue only after server-validated 3DS; clear confirmation and immediate ticket/booking access. Verify returning access and emails. Optional recommendations only after confirmation. |
| D: people and onboarding | 4 onboarding; 5 role navigation; 8 beneficiary/payout | Separate 24-hour invitation purpose from short login lifetime; test resend/revoke/replay, owner/seller/independent affiliation and least privilege. Verify bank capture/masking/audit, no account details in logs. Bank export stays gated on official specification. |
| E: operations and retention | 6 hours/events; 7 email/reviews; 9 operations; 10 shortcuts | Verify schedule precedence, overnight/timezone consistency, venue/space capacity, event lifecycle and ticket scope. Complete role-task mobile matrix, lifecycle email review, shortcut/referral return tests, review-trigger deduplication and monitoring/restore evidence. |
| F: release acceptance | All ten | Run regression suite, clean build/type-check assessment, security review and scenario matrix against exact release SHA. Deploy only eligible no-migration, permission/finance-preserving changes with rollback. Obtain separate owner sign-off for restricted actions and real-device/real-money acceptance. |

## Customer-data contract to verify before UI changes

1. Map each field from form to API, validation, storage, receipt, account UI,
   operational use, retention and access policy. Distinguish buyer from attendee.
2. Guest name/email are required; phone is optional in current ticket code.
   Justify any new mandatory field by an operational need. Marketing consent is
   optional and defaults false; no checkout blocker or automatic campaign send.
3. Guest email matching must not grant account access, overwrite an existing
   identity, expose purchase history, or attach an authenticated user's order to
   a different identity without an explicit supported workflow.
4. Check email correction, case normalization, returning accounts, consent
   evidence, privacy-copy links and transactional-versus-marketing separation.
5. Do not persist card/CVV/3DS secrets, log them, or store them in browser recovery
   state. Verify billing treatment against actual code and gateway requirements.
6. Success requires authoritative order/payment state, not a bank callback alone.
   Pending/uncertain states must be understandable and have a support/reference path.

## Minimum test matrix

- Ticket and reservation/deposit flows: guest, existing account, returning guest;
  desktop plus 320/390px phone widths; EN/ES/PT where supported.
- Success, invalid/missing fields, expired quote/hold, unavailable inventory,
  price change, decline, cancelled/failed 3DS, duplicate callbacks, double click,
  refresh/back, network loss before/after authorization, delayed webhook.
- Assert order/payment/entitlement/hold/ledger agreement and exactly-once effects
  through durable idempotency/reconciliation, including repeated delivery attempts.
- Refund tests: prior partial refunds, concurrent remaining-balance requests,
  rejected/pending/completed provider result, timeout after provider acceptance,
  single-session refund inside a bundle and correct capacity/commission reversal.
- Reservations: weekday, holiday/date override, lunch/dinner gaps, overnight,
  event block, timezone, reassignment and requested-versus-assigned space.
- Roles: guest/customer, Superadmin, F&B, events, host, partner owner, seller,
  independent referrer, finance/beneficiary. Test both navigation and denied access.
- Mobile: keyboard/focus, readable labels/errors, touch targets, menus, horizontal
  overflow and complete tasks, not screenshots alone. Actual iOS/Android checks
  remain separate from viewport simulation.
- Email: request vs confirmation, receipts, invitations, expiry/reissue, changes,
  cancellations/refunds; safe links, escaping, locale/date/fees and mobile layout.
  Rendering evidence does not establish delivery or inbox placement.
- Reviews: only verified completion/INVU-close trigger, deduplication, cancellation
  exclusion and neutral invitation without rating-based filtering or incentives.

## Owner/external decision queue

- Approve refund eligibility/cutoffs and fee/tax treatment; rates remain unchanged.
- Approve any required migration or production access/demo-account remediation.
- Supply Banesco's official file/API specification, validation rules and bank
  acceptance contact. Do not label generic CSV/NACHA as Banesco-compatible.
- Approve controlled real-payment/refund amounts and designated recipients for
  delivery tests when isolated verification is complete.
- Confirm any unresolved physical-space/capacity and affiliation policies against
  actual operations; do not silently adopt contradictory historical documents.
- Provide Google/TripAdvisor destinations and approve customer-message policy.

## Completion and reporting

Launch GO requires no unresolved critical/high safety or access findings, evidence
for both purchase journeys, current release/rollback and operational checks, and
owner acceptance of restricted tests/decisions. If unmet, report NO-GO with exact
blockers rather than declaring all ten complete. Non-blocking polish can be deferred
only explicitly. Report changed/tested/failed/merged/deployed/blocked separately.

After each merged batch, provide the Replit shell commands below; never ask the
user to pull an unmerged branch as though it were main. Stop on conflicts.

```sh
git status
GIT_EDITOR=true git pull --no-rebase origin main
```

Run that batch's documented tests. Never use db push --accept-data-loss, reset,
or migration execution as a routine pull/deployment instruction. Preview alone
does not certify production, and rollback source is not a database backup.
