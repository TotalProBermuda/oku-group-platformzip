# Standalone session details validation

Validated on 2026-10-28 in the task workspace.

## Change scope

- The nested localized session route renders the requested session directly using
  the existing experience page and session presentation.
- The path session ID is authoritative. Hero, session-card and sidebar ticket
  links preserve query context and point to the canonical localized checkout.
- The series route retains its full session list and default ticket behavior.
- Legacy checkout redirects are unchanged.
- No catalog imports, database synchronization, schema changes, migrations, seeds,
  orders, holds, payment initialization or purchases were performed.
- The post-merge hook was not invoked. It contains `prisma migrate deploy` and
  must not be run for this change.

## Commands and results

```text
npx vitest run tests/server/commerce/publicSessionDetails.test.tsx tests/server/commerce/publicRedirects.test.ts tests/components/eventArtwork.test.tsx
Exit: 0 — 3 files passed, 26 tests passed.

npm run build
Exit: 0 — production build completed.

npx tsc --noEmit --incremental false
Exit: 2 — standalone typecheck failed.
```

The unchanged Next.js configuration skips type validation and linting during the
build. A successful build is therefore not a successful typecheck.

The standalone typecheck ran both before editing and after the final code changes.
The baseline had 172 diagnostics; the final run had 170. Comparing the full logs
showed only the removal of two existing query-typing diagnostics in the experience
page. No new diagnostics were introduced. Remaining failures include generated
admin page export checks, mockup-sandbox types/imports, and existing application,
script and test errors. They were not suppressed or changed by this fix.

The focused suites cover direct rendering of the exact path session, requested
content and ticket links, locale/query preservation, conflicting query session
IDs, missing/mismatched sessions, artwork fallbacks, unchanged series lists,
session metadata and the unrelated legacy checkout redirects.

## Runtime evidence and limits

A read-only request to the existing public catalog returned session
`cmv1ohwb40006w3f2woikjbnk`, titled **A Taste of Provence**, on October 28, 2026,
6–9 PM America/Panama, with the existing **$45 General Admission** ticket.
This verifies catalog data only, not a post-publication rendered page.

The development catalog returned no matching Wine Down series. The development
session and series requests therefore returned not-found. No production records
were imported to make the development preview render.

## Merge and publication handoff

At the user's request, publication and live verification are deferred until this
narrow fix is merged into the connected workspace. No publication was attempted.
Do not invoke the configured post-merge hook.

The inspected deployment startup script only starts Next.js, despite its legacy
migration-related filename. Before republishing, inspect the actual publication
actions and reject any schema/data mutation.

After publication, verify:

1. Direct navigation and refresh retain
   `https://www.okuhospitalitygroup.com/en/experiences/wine-down-wednesday/sessions/cmv1ohwb40006w3f2woikjbnk`
   and show the requested event and a visible Select Tickets CTA.
2. The CTA points to
   `/en/checkout/wine-down-wednesday?sessionId=cmv1ohwb40006w3f2woikjbnk`
   and the checkout displays the existing $45 option for that session.
3. `https://www.okuhospitalitygroup.com/en/experiences/wine-down-wednesday`
   retains its URL, full session list and working ticket links.

Stop at ticket selection. Do not request a quote, create an order or hold,
initialize payment, enter card data or submit a purchase.
