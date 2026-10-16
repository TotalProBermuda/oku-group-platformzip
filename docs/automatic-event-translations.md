# Automatic event text translations

## Shared auth secret policy

Production startup follows the unchanged shell entrypoint -> Next.js chain on
existing Autoscale hosting. Auth is resolved by the shared,
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
logging, and a production build using only an isolated AUTH_SECRET fixture.

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

## Request-bound processing on Autoscale

DEEPL_AUTH_KEY is the only translation credential. `:fx` selects DeepL Free;
otherwise the adapter uses DeepL Pro. Source is EN, targets ES and PT-BR, and rich
HTML uses DeepL's HTML handling. Provider calls have a four-second timeout,
composed with the authenticated request's ten-second processing deadline. Neither source
text nor provider response bodies/credentials are written to queue payloads or
translation logs. Stored failure codes are sanitized.

Every successful text save first commits English and durable translation records,
then awaits at most four current-source translation claims in that same authenticated
request. The response retains its original data envelope and adds `saved: true`
plus `translation` metadata: `ready`, `pending`, or `retry`. Provider failure never
rolls back saved English or masquerades as an all-language success.

The scoped `/api/v1/admin/series/[id]/translations` endpoint uses the same
`admin:experiences:write` permission. GET only reads metadata. POST awaits a bounded
chunk; it cannot specify arbitrary entities or change source content. It applies
an authenticated request rate limit without requiring Redis. Event scope includes
the series, session defaults, sessions, ticket types and add-ons belonging to it.
Public/visitor requests never perform or schedule translations.

An open editor may await up to six sequential continuation POSTs after a save.
Opening/reopening only reads persisted status; explicit Resume/Retry restarts work.
Unmount/close aborts client continuation. Source, pending/failed status, attempt
count, next attempt and expiring leases survive browser close or instance shutdown.
There is no server interval, process-local queue, fire-and-forget processing,
translation BullMQ consumer, supervisor, or continuously running worker prerequisite.
Unrelated existing workers/jobs are not activated or otherwise changed.

The conditional claim/completion uses the current source hash and lease, so older
results cannot overwrite a newer English save and concurrent requests cannot
translate the same current field/locale twice. Unchanged source does not reset or
retranslate completed rows. Retryable failures persist exponential backoff and a
six-attempt budget; a failure stops the current chunk and gates subsequent work
until explicit Retry. Retry cannot bypass backoff or steal a live lease. Only
explicit Retry can re-arm exhausted/permanent failures. Missing configuration
does not consume attempts. Cleared fields complete without provider calls.

HTML output must retain the same balanced, simple formatting-tag sequence as
the source. Executable/unknown tags, attributes and provider-injected markup are
rejected, not stored as completed. Unsupported rich markup remains English until
the source is adjusted; safe basic paragraph/list/emphasis formatting is preserved.
Google OAuth credentials are never consulted.

## Migration and operational limits

`prisma/migrations/20261016090000_automatic_content_translation/migration.sql`
adds only attemptCount, nextAttemptAt, processingUntil, lastErrorCode and a due-work
index to ContentTranslation. No drops, copies, event status changes or production
DDL. Additive DDL was applied to development only; apply/review the schema through
the project's normal production schema process before activating in production.
Application startup does not run migrations. No publication was performed.

## Reviewed release sequence — retain Autoscale

Normal website startup/build commands are unchanged from main. The earlier
supervisor and bundled continuous worker have been removed. **Retain existing
Autoscale hosting. No Reserved VM, always-on process, or hosting change is required.**

After review/merge, perform these steps in order:

1. Reconcile/pull merged main while retaining unrelated local changes. Install
   the merged lockfile and build normally.
2. **Publishing configuration update (2026-10-16, user-reported):** the user clicked
   Add secret for DEEPL_AUTH_KEY in Publishing > Production app secrets. The
   out-of-sync section disappeared and the key is now listed masked among deployment
   secrets. This resolves the previously reported Publishing configuration warning;
   it does **not** verify the key is active in the running production app.
   **No republish has occurred.** Editor presence metadata and the earlier editor-only
   Hello world smoke test are also not proof of running-production availability.
   Keep runtime verification pending until a separately approved publish, then
   verify safely without exposing credentials or translating live customer data.
   Confirm the existing auth
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
5. Keep Autoscale unchanged. Only after separate approval, publish the reviewed
   build with the reviewed schema/secret synchronization. Do not start the broader
   `npm run worker` or any translation process for this feature.
6. Confirm the website/auth health and that an authorized disposable event save
   progresses from English fallback to ES/PT within bounded editor requests.
   Verify provider-failure Retry and closing/reopening with pending work.
   Review only status/error codes, never submitted content or credentials.

This correction adds no migration or dependency change. Tests never connect to
production. No customer text was sent to the provider during implementation.

Tests use mocked DeepL/DB services or an explicitly isolated loopback PostgreSQL
fixture. Browser fixtures deny unstubbed API calls and never mutate real events.

## Verification of the request-bound correction

- Focused translation, Series/Session, auth alias, route/RBAC and editor-status
  suite: **208 passed; 34 database-fixture tests intentionally skipped**. No
  database fixture or migration was run in this correction.
- Playwright: **8 passed**, across desktop and 375px projects. Includes explicit
  Resume after opening pending work, session editor layout, defaults/referral
  preview/apply and create-session regression checks. API traffic is fixture-only.
- Prisma validate passed. Isolated production build passed (exit 0), with an
  unreachable loopback database, external network blocked and disposable auth
  alias fixture; no production credentials or database were used.
- Full TypeScript comparison against main
  `8858a529a3bdba0b22edcfcfff48eaf2c0abf3f3`, using identical installed dependencies
  and existing generated-route checks: baseline **254**, feature **253** errors,
  **zero introduced**, one resolved. Both include 189 pre-existing sandbox errors.
  Newly added route/source checks are included only in the feature run.
  Typecheck is NOT globally green. The last baseline diagnostic is
  `tests/server/rateLimit.test.ts:59 TS2540: Cannot assign to 'NODE_ENV' because it
  is a read-only property.` The normal build's existing type-error policy is unchanged.
- A public-login screenshot confirmed normal website startup. Signed-in editor
  behavior was separately checked through Playwright's authenticated fixture
  cookies; neither test method bypassed application authentication.
