# Type safety repair — pass 1

Base: `c43c3c7c`. Branch: `codex/type-safety-pass-1`.

## Changes

- Await Next 15 asynchronous URL parameters in 13 INVU, host and payout route handlers across 12 files. Existing authorization and business operations remain unchanged.
- Correct the authentication POST context type; preserve distributed rate limiting. The installed NextAuth adapter already awaits context.params.
- Query Order.payment and Ticket.ticketStatus, preserving the existing customer payments-array and admin ticket-status response shapes.
- Resolve the session before reading the waitlist email on the event page.

## Evidence

- Existing release regression suite plus six new route/query tests: 214 passed, 31 files.
- Two additional auth context/rate-limit tests passed.
- No live database, payment, refund, payout or customer invitation executed. No schema, financial settings, permission policy or TypeScript exclusions changed.
- Full local TypeScript check remains failing (451 diagnostics). This checkout uses a shared, older generated Prisma client: it lacks fields such as attendeeEmailNormalized present in the schema. This count is NOT comparable to the user's 347-diagnostic Replit check. Application typing failures and mockup-project inclusion also remain unresolved.
- No production deployment and no full build certification for this batch. Keep the PR draft pending further verification.

## Next gates

Generate Prisma client in an isolated dependency installation; rerun the full type check with Next-generated route types. Continue repairing invalid runtime queries, session typings, translations and other application errors. Separate independently configured mockup source from application type checking without excluding production code. Verify a clean build before any release decision.

After a tested PR is merged, Replit commands (not before):

```sh
git status
GIT_EDITOR=true git pull --no-rebase origin main
npx prisma generate
npx vitest run tests/server/payments tests/server/cybersource tests/server/commerce tests/server/reservations tests/server/rbac/roleSplitAuthz.test.ts tests/server/dashboardNavigation.test.ts tests/server/referrerShareSurface.test.ts
npx tsc --noEmit --pretty false
npm run build
```

`prisma generate` generates code; do not substitute db push, migrate reset or accept-data-loss. Stop on conflicts or failing release checks; do not republish this batch alone.
