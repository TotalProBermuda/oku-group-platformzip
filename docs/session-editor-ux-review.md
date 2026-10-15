# Individual session editor review

## Revised implementation plan and outcome

1. Inspect the actual Dates & Capacity page, the existing bulk editor, and the protected preview/apply contracts.
2. Keep those backend contracts; replace normal editing with dated cards and an individual editor sheet. Retain creation and put bulk/default operations behind Advanced series tools.
3. Show live effective values, plain per-field resets, independent manual text/artwork locales, searchable host selection and inline host creation, ticket and sponsor controls.
4. Only introduce postponement after an actual protected date-change attempt. Keep ordinary content edits separate. Never send attendee notices.
5. Audit the diff, fix introduced initialization/focus/hold defects, test fixture-only desktop/mobile workflows, and build without external network access.

No schema or migration files were changed in this pass. No production data, live Wine Down content, attendee notifications, or deployment were modified.

## Responsive finding

At 375px the document measured 522px wide. The owning cause was the experience page's fixed 200px sidebar alongside its content panel. The fix is scoped to that layout: mobile tabs stack above the content and the content can shrink. No global overflow hiding was added. The browser assertion still checks both the full document and editor, not a narrowed editor-only scope.

## Exact verification

- Final focused Vitest run: exit 0, **37 files passed, 1 skipped; 183 tests passed, 31 skipped**.
- New individual-editor browser run: **13 passed, 1 mobile overflow failure** before the layout correction. The affected responsive case was then rerun after correction on both projects: **2/2 passed**. The prior other cases remain verified; this is not a fresh whole-suite 14/14 run.
- Targeted retained advanced-tool/role/create-flow checks after correction: **3/3 passed**.
- Prisma validation passed.
- Last completed standalone type check: exit 2, **171 baseline diagnostics**, no changed-file diagnostics. A post-build rerun timed out without output; it is not a clean type-check result.
- Isolated build: **exit 0**, generated **311 static pages**, finished optimization/traces and the route summary. External network access was blocked by the validation preload.
- Last build diagnostic before successful completion:

  ```text
  Can't reach database server at `127.0.0.1:55432`
  Please make sure your database server is running at `127.0.0.1:55432`.
  ```

  The temporary fixture PostgreSQL server was unavailable during prerendering. The build still completed, but this is not proof of successful database-backed rendering. An attempted isolated integration run failed at its connection hook, with 31 tests skipped; no claims of a new successful database integration pass are made. Production/shared database connections were not substituted.
- The build configuration already skips type checking/linting. Build success does not imply either is clean.
- The managed development workflow is running. Unauthenticated screenshot verification reaches the language/login gate; signed-in editor behavior was verified with mocked APIs and fixture authentication, not a live administrator session.

## Changed files

- `src/components/admin/SessionCardsEditor.tsx` (new)
- `src/components/admin/EventScheduleManager.tsx`
- `src/components/admin/SessionManagementEditor.tsx`
- `src/components/ui/MediaUpload.tsx`
- `src/app/admin/experiences/[id]/page.tsx`
- `src/app/api/v1/admin/series/[id]/session-management/route.ts` (history boolean only; no attendee data exposed)
- `tests/browser/session-cards.spec.ts` (new)
- `tests/browser/session-management.spec.ts`
- `tests/components/session-management.test.tsx`
- `tests/server/series/managementReadRoute.test.ts` (new)

## Boundaries

The existing dynamic-session schema release remains a separate prerequisite; this UI review does not authorize a shared/production migration. Existing authorization, inventory reconciliation, audit, idempotency and held-notice safeguards stay on the server. No automatic translation provider or delivery mechanism was added. Manual locale edits remain separate, and source text is not rewritten.
