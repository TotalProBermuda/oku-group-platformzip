# Event occurrence system: red-team audit and plan

## Confirmed starting point (2026-10-20)

- PR #147 is open and mergeable but currently has no relevant automated checks; revalidate its head/base before release.
- `Series` is the programme and `Session` already provides stable occurrence identity, schedule, capacity, artwork, tickets, and profile assignments. One-off experiences can remain one-session series; a parallel standalone-event table adds risk without improving identity or checkout.
- Menu data and `EventMenuLink` currently attach to series; session profile assignments exist but need end-to-end admin/public verification.
- Production readiness is `NO_GO`: demo mode is enabled and 22 `@oku.local` users remain. Audit their references before changing access or records.
- Production migration history includes failed/rolled-back attempts; do not assume migration safety from the dashboard.

## Plan and gates

1. Trace current PR/main, schema and migration ledger, admin APIs, public/checkout routes, translation and media services, tests, deploy SHA, backup/restore, rollback, and dependency vulnerabilities.
2. Keep `Session.id` as event identity; validate localized canonical and legacy routes, series ownership, inheritance, exact-session checkout, and no silent alternate-session selection.
3. Reuse existing menus, secure uploads, profiles, and assignment records; add only the smallest additive session-menu association if the trace confirms it is missing. Support ordered generic items, optional photos, event-scoped hosts/co-hosts, and truthful translation fallback.
4. Add API/UI, authorization, route, localization, media, checkout, and inheritance tests plus CI; require tests, lint, typecheck, build, disposable-database migration validation, and zero known moderate/high/critical dependency issues.
5. Safely audit demo users and production configuration. Preserve orders, payments, ownership, audit, and referential integrity; prefer reversible deactivation only if proven safe.
6. Publish only after migration, backup/restore, rollback, CI, dependency, and production readiness checks are green; verify deployed SHA and localized occurrence-to-exact-session checkout without external side effects.
