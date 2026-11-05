# Localized event artwork

## Storage/model review (before implementation)

- Artwork belongs to the reusable Series and Session records, not a specific event/host type or slug.
- Text translations must not be used as image storage: text translation automation and approval states are unrelated to asset management.
- Use explicit optional EN/ES/PT URL columns; leave legacy URLs and existing rows untouched. No backfill, renames, table copies or drops.
- Store the upload service's permanent `/api/v1/media/...` path, never its expiring signed PUT URL. Existing App Storage remains the asset store.
- Localized mutations and upload presigns require SUPERADMIN on the server, not just hidden controls. Keep other roles' non-artwork permissions intact.
- Reject script/data/protocol-relative URLs, credentials and common expiring signed URL parameters. No server-side arbitrary URL fetches (avoids introducing SSRF).
- Locale removal clears only the reference. Do not delete the underlying object: another locale, series or copied session may still reference it.
- Treat missing, invalid and failed image loads separately. Retry selected locale → English → legacy; session cards may then inherit series artwork. Remove exhausted images rather than rendering a broken icon.

## Controls and public behavior

Superadmins manage series artwork in **Experiences → Basic Info** and session artwork in **Dates & Capacity → create/edit event content**. Each editor labels English (EN), Spanish (ES) and Portuguese (PT) independently. Saving/removing one locale does not clear another locale or the legacy image.

The locale route/selector controls guest detail heroes, listings, home cards, session list/calendar cards, invitations and member series cards. Sharing metadata uses the same initial URL selection. Existing public routes and response keys remain unchanged; APIs additionally carry all localized URLs so clients can retry on image errors.

## Migration and release boundary

`prisma/migrations/20261011120000_localized_event_artwork/migration.sql` adds six nullable TEXT columns only. Development schema has these columns; production schema must acquire them before this code is released. Do not run schema changes during application startup or build.

No production migration, publish/republish, event-status change or event-content edit is part of this implementation.

## Existing upload limitations

The new dedicated upload route checks role, claimed MIME, filename and declared size; it accepts raster images only. The existing storage signer does not enforce byte size or inspect file contents, and the generic upload route remains unchanged for other features. Superadmin uploads are trusted writers, not a malware scanning boundary. External artwork URLs are validated syntactically, not fetched or certified; unavailable/non-image resources fall through in the guest renderer. A future app-wide upload hardening effort should verify stored metadata and file signatures.

## Verification

- 100 focused Vitest tests passed across 13 files (new artwork tests plus existing Series/Session tests).
- Five Playwright cases passed on both desktop and mobile: EN/ES/PT calendar artwork, failed-image retry/exhaustion, and signed-in superadmin editor controls. The editor checks also passed again after the legacy media-path compatibility fix.
- Browser tests use fixture images and mocked event responses; no real event content is created or edited.
- Prisma validation and client generation passed.
- Next production build passed with existing warnings. The project's existing build configuration skips type validation.
- Separate `tsc --noEmit` reports 181 project-wide diagnostics, none in the changed artwork files. A clean project-wide type check remains blocked by unrelated errors.
- Development server restarted successfully with public/admin routes returning HTTP 200. Public screenshot inspection was limited by the existing first-visit language chooser; the browser tests verified the rendered artwork and authenticated controls independently.

## Files

Schema/migration:
- `prisma/schema.prisma`
- `prisma/migrations/20261011120000_localized_event_artwork/migration.sql`

Shared validation, selection and editors:
- `src/lib/eventArtwork.ts`
- `src/server/series/artworkInput.ts`
- `src/server/series/createSeriesInput.ts`
- `src/server/series/createSessionInput.ts`
- `src/components/ui/EventArtwork.tsx`
- `src/components/ui/MediaUpload.tsx`
- `src/components/admin/LocalizedArtworkEditor.tsx`
- `src/components/admin/EventScheduleManager.tsx`
- `src/app/admin/experiences/[id]/page.tsx`

Admin API mapping/authorization:
- `src/app/api/v1/admin/event-artwork/upload/route.ts`
- `src/app/api/v1/admin/experiences/route.ts`
- `src/app/api/v1/admin/experiences/[id]/route.ts`
- `src/app/api/v1/admin/experiences/[id]/duplicate/route.ts`
- `src/app/api/v1/admin/series/route.ts`
- `src/app/api/v1/admin/series/[id]/sessions/route.ts`
- `src/app/api/v1/admin/sessions/[id]/route.ts`

Guest rendering and API mapping:
- `src/app/[locale]/page.tsx`
- `src/app/[locale]/experiences/page.tsx`
- `src/app/[locale]/experiences/[slug]/page.tsx`
- `src/app/experiences/[slug]/page.tsx`
- `src/components/experiences/ExperienceSessionsView.tsx`
- `src/components/ui/EventsCalendarView.tsx`
- `src/components/account/MembershipDashboardContent.tsx`
- `src/app/api/v1/sessions/route.ts`
- `src/app/api/v1/membership/me/eligible-events/route.ts`
- `src/app/invite/[token]/rsvp/RsvpContent.tsx`
- `src/server/invitation/tokenService.ts`

Tests/tooling:
- `tests/lib/eventArtwork.test.ts`
- `tests/components/eventArtwork.test.tsx`
- `tests/server/series/artworkUploadRoute.test.ts`
- `tests/server/series/publicArtworkMapping.test.ts`
- `tests/server/series/seriesArtworkEditRoute.test.ts`
- `tests/server/series/createSeriesRoute.test.ts`
- `tests/server/series/createSessionInput.test.ts`
- `tests/server/series/createSessionRoute.test.ts`
- `tests/server/series/sessionContentRoute.test.ts`
- `tests/browser/event-artwork.spec.ts`
- `vitest.config.ts` (enable JSX compilation for rendered component tests)
- `package.json`, `package-lock.json` (React DOM type declarations for rendered tests)
