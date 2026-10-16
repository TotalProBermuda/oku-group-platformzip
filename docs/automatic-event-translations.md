# Automatic event text translations

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

Tests use mocked DeepL/DB services or an explicitly isolated loopback PostgreSQL
fixture. Browser fixtures deny unstubbed API calls and never mutate real events.
