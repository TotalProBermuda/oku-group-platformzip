# Release and payment safety — 2 October 2026

## Verified this pass

- GitHub main is `94b3fc29165ed158aac0a1a8ce36fd7c1915c2d3`.
- Replit is signed in and its UI reports a fresh successful publication.
- Replit working tree is clean; HEAD is `8b5c6cc140a3ce114f299adea51f30111e79ff60`, labelled `Published your App`.
- Replit HEAD versus origin/main differs in 23 files, 499 additions and 234 deletions. This includes 352 changed schema lines, referrer authorization/navigation, build-safe font changes, package configuration and Replit ports. These are existing changes, not modifications by this pass.
- Replit's displayed prior test output confirms 183 tests across 27 files passed. This does not cover every application module or certify its full release.

## Release gate

Do not overwrite Replit with main or blindly deploy another version. Preserve local changes and compare the full schema/access differences. The publication UI and checkout commit are evidence of a publication, not an independent runtime SHA attestation. A known-good rollback deployment must still be identified.

Examples of observed configuration differences: Replit removes `prisma migrate deploy` from the development start command, and adds a port mapping. Neither was changed here. Production start still references the existing migration/repair script; do not run it locally against a real database as part of this audit.

The first schema-diff segment contains substantive changes as well as formatting: `PasswordlessTokenPurpose` with `SIGN_IN`/`REFERRER_INVITE`, a referrer commission audit enum value, and `Ticket.attendeeEmailNormalized` plus an index. Therefore invitation/token work must first reconcile these existing changes rather than introduce a competing schema design. This comparison does not establish whether those columns exist in production.

## Narrow implemented fix

Reservation webhook capture/void state transitions previously used unconditional updates and swallowed write failures with HTTP 200. They now compare the current expected status and return HTTP 503 on a lost update or database failure so delivery can retry. Duplicate durable outbox events still permit reconciliation. Terminal state protections remain unchanged.

Seven new isolated tests cover capture/void compare-and-set, competing updates, write failure followed by duplicate-event retry, and preservation of captured/refunded/cancelled states. Focused payment/commerce/reservation/RBAC suite: **190 tests, 27 files passed**. No real webhook, refund or charge submitted.

## Explicitly unfinished

- Cumulative/concurrent refund accounting and durable idempotency remain unresolved. A per-request amount check is not enough.
- Partial versus full refund correlation is unresolved. The existing unreachable reservation refund branch is deliberately not enabled: doing so without amount/correlation validation could mark a partial refund as full.
- Bundle entitlement and inventory restoration, lost synchronous checkout reconciliation and settlement verification need separate tests/design.
- Do not infer settlement from an accepted refund or successful 3DS challenge.
- All onboarding/mobile/content/operational items in LAUNCH_READINESS_RECONCILIATION_2026_10_01.md remain open unless separately evidenced.

No production deployment, schema alteration, access change, invitation, customer email, financial-setting modification or money movement was performed. Keep this safety patch reviewable independently while release drift is reconciled.
