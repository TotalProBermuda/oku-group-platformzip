# Event occurrence release audit and plan

Date: 2026-10-20  
Scope: reusable occurrence pages and administration across series and one-off events.

## Confirmed architecture

The existing `Series` + `Session` model can express the product requirement without a parallel standalone-event model: a Series is the discoverable programme, and each Session is the stable, independently bookable occurrence. A one-date programme remains a one-session Series. Keep this model and make the distinction explicit in admin and public copy.

PR #147 is open, non-draft, and GitHub currently reports it mergeable. It adds a session-specific route under `/{locale}/experiences/{seriesSlug}/sessions/{sessionId}`, routes session cards/calendar links to that route, and preserves legacy `?sessionId=` links. GitHub reports no commit status checks for its head. The PR description confirms it reuses existing event data; it does not add occurrence-specific structured menu/lineup authoring or full host-profile authoring.

Existing schema already has generic menu records, Series-level menu links, Profile records, and Series/Session profile-assignment models. Session-specific menu linkage and a compact unified editor must be verified/implemented rather than assumed. Existing localized translation services should be reused; event-authored text must not require three manually entered languages.

## Release blockers and evidence

- No CI status is attached to the PR head, so mergeability is not a quality gate.
- A fresh disposable-database migration run previously failed in `20260515120000_beneficiary_documents`: it adds a foreign key to `BeneficiaryProfile`, but no earlier committed migration creates that table. This tree confirms that the beneficiary profile appears in the Prisma schema and that the first migration reference is earlier than the status/email-opt-out ALTER. Production has the table and records this migration as applied; do not edit its SQL or resolve migration state speculatively.
- Last inspected production readiness was NO_GO with demo mode enabled and 22 `@oku.local` accounts. Those accounts have linked orders/tickets/referral or profile records; preserve all records. Recheck current status and dependencies before reversible suspension. Update the readiness rule to distinguish active demo access from retained historical records only after validating account status and login behavior.
- The last dependency audit reported no moderate/high/critical findings. Repeat it on the final candidate.
- No live event data, ticket inventory, attendee notices, payment, or reservation changes are part of this release. Preserve the October 28 session capacity at 35.

## Implementation and verification sequence

1. Recheck main/PR diff, production release SHA and rollback target, migration ledger/schema, production demo-mode configuration, and privacy-safe aggregate account dependencies.
2. Keep Session as the canonical occurrence. Add backward-compatible canonical localized occurrence URLs and tests for invalid IDs, one-session and multi-session Series, and old query URLs.
3. Add reusable occurrence-level menu/featured-lineup assignment using existing menu/item/media structures where possible. If schema changes are needed, use additive forward-only migrations and test them against both a fresh disposable database and a production-shaped clone; never reset or overwrite production.
4. Reuse Profile and assignment models for multiple hosts/co-hosts, with explicit occurrence inheritance/override behavior. Add admin authorization, editing, ordering, removal, validation, and preview.
5. Connect authored source-language text to the existing translation pipeline for event, lineup, profile, and notices. Provide a visible fallback when translation is unavailable. Keep checkout artwork and selected occurrence identity visible.
6. Add CI covering Prisma generation, lint, typecheck, tests, migration deployment on disposable PostgreSQL, dependency audit, and production build. Fix existing failures instead of masking them.
7. Verify EN/ES/PT public occurrence page → direct ticket selection → checkout in desktop/mobile browser without paying. Verify viewport-safe calendar previews, exact event selection, images, profile links, and localized text.
8. Only after all checks and production safety gates pass: merge through the repository's normal protected path, publish the exact merged SHA, and verify the published occurrence URL and launch readiness. Otherwise leave production untouched and report the precise blocker.
