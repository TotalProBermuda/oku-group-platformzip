# Automatic event text translations

## Shared auth secret policy

Production startup follows the existing shell entrypoint -> supervisor ->
translation worker readiness -> Next.js chain. Auth is resolved by the shared,
dependency-free `src/lib/authSecret.ts` in Node auth options, demo-login cookie
issuance, Edge middleware cookie decoding/audit signing, and Node audit signature
verification. Middleware no longer maintains a separate resolver.

The first nonempty value wins: `NEXTAUTH_SECRET`, then `AUTH_SECRET`. Empty strings
are missing; secret bytes are never trimmed, rewritten, generated, or copied.
If both names differ, NEXTAUTH_SECRET retains precedence to preserve existing
sessions. If both are absent/empty, production throws rather than using a known
fallback; the existing development/test fallback remains non-production only.
This does not rotate or modify any stored secret or environment file.

Readiness uses the same presence check, keeps the legacy `auth.nextauth_secret`
gate/API boolean for compatibility, and returns no secret values. The Payments
label shows both supported names. Rate-limit fingerprint/encryption key policy
is separate and deliberately unchanged. DEEPL_AUTH_KEY remains independent.

Regression tests cover Node-issued cookies decoded by Edge, Edge-signed denial
audits verified by Node, precedence, empty/missing values, readiness, no resolver
logging, and a built Next.js startup using only an isolated AUTH_SECRET fixture.

## Authoring boundary and audited fields

Staff enter the English source once. The session card and advanced/defaults editor
have no language-specific text entry tabs. EN/ES/PT artwork controls are independent
and are never submitted to DeepL.

| Customer content | Shared translation entity/fields | Save paths |
| --- | --- | --- |
| Series/event | `Series`: title, subtitle, description, countdownLabel, seoTitle, seoDescription | Both creation APIs, experience PATCH, duplicate |
| Session/date | `EventSession`: title, subtitle, description | Create, PATCH, advanced preview/apply |
| Session defaults | `SeriesSessionDefaults`: title, subtitle, description | Defaults preview/apply |
| Ticket product | `TicketType`: name, description | Ticket creation/PATCH, duplicate |
| Add-on product | `ExperienceAddon`: name, description | Add-on English text PATCH |

The reusable registry also retains previously registered general-content fields;
fields not present in the current Series/Session Prisma models are not invented
or added to those models. Add-ons previously had a display-only panel; the new
text editor deliberately cannot change inventory, prices, eligibility or status.

Not translated: URLs, slugs, artwork, dates/times, prices/currencies, status and
visibility enums, addresses, country/city identity, venue/person/brand names,
host/sponsor/profile identities, ticket tier codes, reservation identifiers,
attendee/customer data, analytics, financial assignments, private operational
notes, invitation recipient selection and dispatch controls. Those are not
independently authored customer event copy. Invitations use event/series identity;
their existing segmented dispatch controls are unchanged. No mail or attendee
notification is sent by this translation feature.

Public series/experience/catalog reads share the same batch localization helper.
The existing session localizer resolves English inheritance first and then selects
a translation matching that exact English hash. Checkout now includes the active
locale in its catalog request and checkout guest locale, without changing prices,
product IDs, purchase policy or historical order/ticket snapshots.

## Storage and red-team conclusions

- Reuse ContentTranslation's unique entity/id/field/target identity. No separate
  locale text columns on Series, Session, TicketType or ExperienceAddon.
- Source and durable work records are written inside the same transaction.
  English-only records remain readable and no URL or existing content is rewritten
  as a migration/backfill.
- New hashes are full SHA-256. Readers also accept historical truncated SHA-256
  hashes, not the previous worker's raw source-text prefix.
- Changed/cleared source invalidates stale translations and any processing lease.
  Completion is a conditional update against the claimed hash and lease; an older
  provider response cannot overwrite newer work.
- Existing reviewed session/default translations remain usable only while their
  English source hash still matches. Legacy per-language mode values alone never
  override fresh English. New authoring does not create manual locale duplicates.
- Missing, stale, failed and empty generated translations fall back to English,
  including date-specific English rather than unrelated series text.
- Artwork, permissions, publication/readiness rules, commercial protections and
  preview/apply idempotency remain separate and intact.

## Provider, worker and failure behavior

DEEPL_AUTH_KEY is the only translation credential. `:fx` selects DeepL Free;
otherwise the adapter uses DeepL Pro. Source is EN, targets ES and PT-BR, and rich
HTML uses DeepL's HTML handling. Requests have a 20-second timeout. Neither source
text nor provider response bodies/credentials are written to queue payloads or
translation logs. Stored failure codes are sanitized.

The existing BullMQ worker runs a real translation drain and a recurring wake-up.
Its independent 30-second database poll also runs when Redis is absent or fails;
HTTP saves never wait for Redis/provider connectivity. Old queued source payloads
are not replayed. A DB lease prevents concurrent claims. Retryable failures use
exponential backoff (capped at one hour), with six attempts per source. Missing
configuration is deferred without consuming attempts. Permanent provider errors
stop after the bounded retry policy; failed rows remain inspectable and English
remains available. Clearing a field completes an empty record without an API call.

The BullMQ Worker service must be running for automatic processing; the web process
only writes the durable outbox. DeepL must be configured before real translations
can complete. Google OAuth credentials are never consulted.

## Migration and operational limits

`prisma/migrations/20261016090000_automatic_content_translation/migration.sql`
adds only attemptCount, nextAttemptAt, processingUntil, lastErrorCode and a due-work
index to ContentTranslation. No drops, copies, event status changes or production
DDL. Additive DDL was applied to development only; apply/review the schema through
the project's normal production schema process before activating in production.
Application startup does not run migrations. No publication was performed.

## Production startup and reviewed release sequence

The existing deployment shell entrypoint now execs a Node supervisor. It launches
only the compiled translation worker, waits for its read-only schema/database
preflight, then starts Next.js. Neither this entrypoint nor the translation worker
imports the general BullMQ worker, Redis, retention, INVU, ledger, or notifications.
The existing development/general worker remains unchanged.

The production worker is bundled during `npm run build` and needs only Node and
the existing production Prisma client at runtime, not tsx/esbuild/dev dependencies.
An unexpected exit (including exit 0) or spawn/readiness failure stops both children
and exits nonzero. SIGTERM/SIGINT stop polling, finish the current translation,
stop claiming further rows, and disconnect Prisma. After 30 seconds the supervisor
force-kills surviving child process groups; unfinished claims recover via their
existing leases. Transient polling failures retain durable rows and retry.

**Hosting release gate:** the checked-in deployment target is still Autoscale.
An operator must select **Reserved VM** in Publishing before this release:
Autoscale can go idle and is not an always-on queue consumer. This is an explicit
hosting/cost-model decision; no hosting settings or live deployment were changed
by this PR. Do not publish this startup integration on Autoscale and assume idle
backlogs will drain.

After review/merge, perform these steps in order:

1. Reconcile/pull merged main while retaining unrelated local changes. Install
   the merged lockfile and build, including `build:translations`.
2. Securely configure DEEPL_AUTH_KEY for production. Confirm the existing auth
   secret is available to a clean production build/runtime: NEXTAUTH_SECRET takes
   precedence over the AUTH_SECRET alias. No remapping or rotation is required.
   Never substitute the disposable test credential.
3. Confirm the database target is development. Review the additive translation
   migration and development schema/index parity; reconcile existing Prisma
   migration history separately if necessary. Do not run the post-merge script
   against an unidentified database.
4. Inspect Replit's managed development-to-production schema diff. It must include
   the four retry/lease columns and retry index, with no unintended drops or data
   loss. Production schema synchronization belongs to reviewed Publish, not
   `prisma migrate deploy` in application startup.
5. Select Reserved VM and review its always-on compute cost. Only after separate
   approval, publish the reviewed build with the reviewed schema synchronization.
   Do not start the broader `npm run worker` in production for this feature.
6. Confirm worker-ready precedes web-ready, the public health path responds, and
   an authorized disposable event edit progresses from English fallback to ES/PT.
   Review only status/error codes, never submitted content or credentials.

This startup fix adds no migration. Until credentials and the existing schema
change are approved, do not point a verification worker at production. The
process tests use fixture database/provider adapters and exercise real OS signals.

Tests use mocked DeepL/DB services or an explicitly isolated loopback PostgreSQL
fixture. Browser fixtures deny unstubbed API calls and never mutate real events.
