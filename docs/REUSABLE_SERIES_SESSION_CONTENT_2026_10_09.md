# Reusable series and session content

## Product model

This is a shared capability for every event series, not a Wine Down-specific event type.

- A **series** remains the reusable programme: common description, hero artwork, master calendar artwork, ticket products/prices, and social links.
- A **session** is one dated occurrence. It can inherit series title/description/artwork/prices or override its title, subtitle/theme, description, flyer, and ticket prices.
- A **session ticket price** overrides only that ticket type for that session. Blank/inherit means the existing series ticket price. Existing paid orders keep their order-line price snapshots; changes do not reprice prior purchases.
- Session ticket products remain in the existing series and session inventory model. There is no new event category or special-case ticket product.
- Guests can browse upcoming sessions in a list or calendar. The session list is the default; selecting a date narrows the calendar results. Checkout is linked to the selected session and recalculates the authoritative price server-side.
- The calendar and displayed session times use the venue timezone (`America/Panama`) so event dates do not shift based on the guest's device timezone.
- Admin session creation also interprets `datetime-local` input as Panama time and stores an unambiguous instant; copying a series remaps session price overrides to the copied ticket products.
- Series social links are optional HTTPS URLs (website, Instagram, Facebook, TikTok, YouTube, X and WhatsApp) displayed at the series layer.

## Safety and rollout

The database change is additive: optional Series/Session content columns and a normalized `SessionTicketPrice` table with unique `(sessionId, ticketTypeId)` rows and foreign keys. Do not use `prisma db push`, `--accept-data-loss`, or manually edit production schema. Apply the checked-in migration only after owner approval and the deployment platform's reviewed migration flow.

No production migration, deployment, payment, refund, policy, permissions, existing order, or finance setting was changed as part of this work. Validate migrations against a disposable/preview database and verify the production backup/rollback plan before approving rollout. If deployment is rolled back after the migration, keep the additive schema in place; do not drop columns or the table as a rollback action.

## Acceptance coverage

- Create and update each session's content and optional ticket price overrides.
- Reject insecure image/social URLs, duplicate price entries, and ticket types from another series.
- Confirm quote and checkout intent use the same session override and persist the price in order lines.
- Confirm list/calendar show correct Panama event dates, session flyer/content, and each session's price.
- Confirm session checkout retains its selected session and paid orders remain unchanged after later edits.
- Verify responsive public and admin screens at narrow mobile and desktop widths.
- Verify all event series kinds use the shared capability; no assumptions are tied to a particular title/category.

## Known rollout gate

This branch adds a production schema migration. It must remain unmerged/unpublished until the owner reviews and approves that migration and preview/rollback plan. Payment settlement, event cancellation/refund behavior, and other financial policies are unchanged.
