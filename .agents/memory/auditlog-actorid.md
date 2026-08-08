---
name: AuditLog actorId required
description: AuditLog.actorId is non-nullable; system-generated events need a sentinel string.
---

# AuditLog actorId is required

## The rule
`AuditLog.actorId` is a non-nullable `String` in the schema. Any `prisma.auditLog.create` call must supply it — omitting it causes a TypeScript error (`Type '{ action: string; metadata: object; }' is not assignable to ...`).

**Why:** The schema enforces actor accountability on every audit record. There is no default.

**How to apply:** For system-generated events (background jobs, fire-and-forget attribution hooks, retention workers) use a descriptive string sentinel — not a real user id. Follow the pattern established in `src/server/privacy/retentionWorker.ts`:

```ts
actorId: "system:ticket-attribution"  // or "system:retention-sweep", etc.
```

Choose a sentinel that names the subsystem (`system:<subsystem-slug>`). This makes audit queries filterable and human-readable without introducing FK constraints.

## Known sentinels in use
- `"system:retention-sweep"` — privacy retention worker
- `"system:ticket-attribution"` — ticket attribution session write failures and venue-unresolvable skips
