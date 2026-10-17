# Host reservation visibility repair

Base: `8693f2b997f97d7123095abf7864b710bfc6d7dd`. No schema, permissions, financial settings, customer records or emails changed.

## Findings and repair

- SSR and polling both bounded the queue to now minus 12 hours through now plus 30 hours. Email deep links searched only those loaded rows. Future reservations were excluded regardless of direct/referral source.
- Both now use `getHostQueue` and one selection policy: all future reservations, unresolved reservations at any age, and recent service. A Panama-date search retrieves closed/cancelled history too. Email IDs are included outside the date window but always inside the authorised venue. Superadmin can resolve the linked booking's venue; normal staff cannot select another venue.
- Polling retains date/ID parameters. Login preserves the deep link. The open drawer refreshes status with the board rather than retaining obsolete action buttons.
- Public `/api/reservations` already requires and saves `contactPhone`. The drawer only read `contactWhatsapp`. It now falls back across both fields and provides a sanitised telephone link. Legacy missing data is not fabricated. This is not a certification of phone validation across every legacy ingestion endpoint.
- Full date and Panama time are shown, and confirmation input/availability calculations use Panama rather than the staff device timezone. Future bookings no longer say "just now".
- Rejected bookings join closed history. Fixed the 420px drawer clipping on narrow phones and wrapping of board headers.

## Evidence

- 292 tests passed across 44 suites: host, reservations, host access, customer journey, role split, payments and commerce.
- New policy tests cover today/week/month across six acquisition sources, unresolved past bookings, closed history, midnight boundaries, invalid dates, scoped email IDs, phone fallbacks and timezone conversion.
- New route tests cover staff venue constraints, superadmin email links, denied access and invalid dates.
- Production build passed with an intentionally unreachable local database URL. No production credentials/database used. Initial sparse build failed because the worker folder was omitted; adding that existing source fixed it.
- Initial test run exposed a missing brace in the new test and absent generated Prisma client; corrected/generated and rerun successfully.
- Repository-wide TypeScript checking is still not clean; existing broader errors remain. A focused diagnostic scan returned no errors for changed source/tests. Next build configuration skips global type checking; build success does not certify global type safety.
- Real component browser fixture, isolated fake guest: emailed next-month booking opens drawer, contactPhone appears as tel link, Nov 8 17:00 Panama round-trips to confirmation input, refresh preserves it. At 320px the drawer left=0/width=320 and document width=viewport=320. No booking action submitted. Before correction the 420px drawer clipped at 390px.
- Read-only live inspection confirmed the current old board and a stale seated drawer against a closed board entry. No real booking was approved, rejected, moved or cancelled.

## Release gate / rollback

Production deployment and authorised live smoke are still required. Verify a real future booking through its existing email link, date search, source filter and refresh; do not change status merely to test it.

No migrations are needed. Rollback: revert this PR's merge on a new branch, run the same tests/build, deploy the resulting code only. Do not run db push or database migration commands.

Replit (only after merge):

```sh
git status
GIT_EDITOR=true git pull --ff-only origin main
npx vitest run tests/server/host tests/server/reservations tests/server/hostChatGuard.test.ts tests/server/reservationCustomerJourney.test.ts tests/server/rbac/roleSplitAuthz.test.ts tests/server/payments tests/server/commerce
npm run build
```

If the worktree is dirty or pull does not fast-forward, stop and reconcile; do not reset. Republish only after successful checks, with no database change approval.

## Remaining red-team work

- Large unresolved backlogs now remain visible; measure real volume and add server pagination/search before scaling. Do not restore a hidden date cutoff as a performance shortcut.
- Multi-venue superadmin selection is not a new venue-switcher UI; default remains the existing first venue, email links resolve their venue.
- Other host/referrer dashboards have their own queries and are not certified by this operations-board repair.
- New operational helper copy is English, consistent with existing board controls; full multilingual/mobile dashboard coverage remains open.
- Launch checklist item 6 advances but is not complete; broader hours/events/capacity coverage, onboarding recovery and other launch streams remain open. No financial or onboarding approvals inferred.
