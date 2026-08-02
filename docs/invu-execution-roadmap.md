# INVU Attribution — Execution Roadmap

**Companion to:** `docs/invu-attribution-loop.md` (the spec) and `docs/invu-vendor-questions.md` (the vendor memo).
**Purpose:** Single sequenced action list. Every item ties back to the spec section that justifies it.
**Audience:** OKÜ Platform / POS Integration squad.

> **Read order:** spec → this roadmap → vendor memo. The roadmap is the "what to do tomorrow morning" view of the spec.

---

## Bucket A — DO NOW (this sprint, no external dependencies)

These items are pure in-house work. Nothing here is gated on INVU. Ship in this order.

### A1. Token rotation cron 🔴 highest operational risk
- **Why now:** Token expiry is silent. Today's only rotation path is a human re-saving credentials in the admin UI (§8.1). Every day without this is one day closer to a sync-tick outage no one sees coming.
- **Scope:** New BullMQ recurring job `worker/jobs/invu-token-rotation.ts`. Runs daily. Scans `InvuIntegrationCredential` where `tokenLastRotatedAt < now() - 14 days`. Calls `authenticateInvu` per venue. Stamps `lastAuthError` on failure. Emits `INVU_TOKEN_ROTATION_FAILED` audit event for ops.
- **Definition of done:** the job is registered in `worker/index.ts`, runs in dev against a back-dated credential, and the resulting audit row is visible in the admin integration log.
- **Risk if skipped:** silent auth expiry → next sync tick fails → no alert → commission backlog grows invisibly.

### A2. Streetside-host attribution visibility 🟡 product gap
- **Why now:** The Operations Board renders the "Referred by" tag (§13.1, fixed this round), but the streetside host's own phone view at `/host/streetside` and the API at `/api/v1/host/bookings` do not include `attributionSession.referralActor / legacyReferrer`. That makes part of the earner-facing surface blind to its own attribution context. The reviewer flagged this as a real product gap, not cosmetic.
- **Scope:**
  1. Roll the existing 3-tier include into `getMyStreetsideBookings` (server) and `/api/v1/host/bookings` (API).
  2. Wire the same fallback resolver used in `BookingCard.tsx` into the streetside host's view component.
- **Definition of done:** A streetside host on a phone sees the originating referrer name on every booking card under their own QR.

### A3. Pre-stage the `citas/add` rewrite as a dormant PR 🟢 unblocks Bucket C cutover
- **Why now:** The implementation is straightforward; the **risk** is only in the unknowns we are asking INVU about (Bucket B). Land the code change behind the existing `INVU_REFERENCE_WRITE_ENABLED=false` flag so it ships dormant. The day INVU answers, the cutover is a single env-var flip, not a rushed PR.
- **Scope (per §8.2 of the spec):**
  1. Replace `PRIMARY_FIELD = "observations"` / `FALLBACK_FIELD = "customer_note"` constants in `invuReferenceWriter.ts` with the three-field strategy: `num_cita` (booking_code), `comentario` (full trust string from §7), `descripcion` (human summary).
  2. Implement the actual HTTP `POST …?r=citas/add` body builder; gate the call on `INVU_REFERENCE_WRITE_ENABLED`.
  3. Update `invuMatchService.ts` Tier-1 extraction to also scan `comentario` and `num_cita`, with the priority hierarchy from §8.2 item 5 (`num_cita` → `comentario` → `descripcion` → `externalReference`/`bookingCodeRef` → legacy `observations`/`customer_note`).
  4. Stamp `MatchProof.sourceField` with the field that produced the booking_code.
  5. Add the `INVU_ATTRIBUTION_UNEXPECTED_FIELD` audit event for matches found below the canonical fields.
  6. Add a sandbox round-trip test (skipped in CI when env-var is false).
- **Definition of done:** Code merged, flag off in all envs, sandbox round-trip test exists and passes when run manually with the flag on.

### A4. Backfill historical `AttributionSession` rows 🟡 reporting completeness
- **Why now:** Pre-loop reservations (e.g. "Jane") show `—` for attribution because they pre-date `AttributionSession` creation. This corrupts historical revenue reports.
- **Scope:** Idempotent SQL/TS script under `scripts/backfill-attribution-sessions.ts`. For each `Reservation` lacking an `AttributionSession` but having a `ReservationAttribution.referrerId`, synthesise an `AttributionSession` with `source: MANUAL_ADMIN`, `status: VERIFIED_POS_SALE` if a closed `TableSession` exists, else best-fit lower status.
- **Definition of done:** Script runs idempotently in dev; admin reservation list shows attribution badges on historical rows.

---

## Bucket B — BLOCKED ON INVU (vendor memo in flight)

Send `docs/invu-vendor-questions.md` to INVU integrations engineering. The nine asks in priority order:

| # | Vendor ask | Unblocks (our side) | Owner on our side |
|---|---|---|---|
| 1 | Complete `citas/add` body schema | A3 cutover & safe defaults | Integration squad |
| 4 | Table / `mesa` API (open, occupied, freed) | Removes the human-host gap entirely | Integration squad + product |
| 2 | URLs for the four satellite endpoints | YELLOW → GREEN for invoice/payment/credit-note/order-totals | Integration squad |
| 3 | Webhook subscription + delivery guarantees | Sub-15-min latency; deprecate polling | Integration squad |
| 5 | Reservable `id_tipo_integracion` for OKÜ | Clean read-side filter | Integration squad |
| 6 | Per-branch API user expiry semantics | Pre-expiry warnings inside A1 cron | Integration squad |
| 8 | Concurrent-write behaviour on same `num_cita` | Idempotency policy in `writeReferenceToInvu` | Integration squad |
| 7 | Attribution retention window | Upper bound on `OperationalBinding` retention | Integration squad |
| 9 | Documented rate limits | Tighten sync cadence; add on-demand syncs safely | Integration squad |

**Tracking:** mirror these as a single sub-task list under "INVU vendor responses" in the project tracker. Update the spec's §13.3 row-by-row as answers land.

---

## Bucket C — DO NEXT (gated on Bucket B answers)

These cannot start until the corresponding Bucket B answer arrives. They are pre-staged where possible (see A3) so the wait time is minimal.

### C1. Flip `citas/add` cutover (depends on B1, B5, B8)
1. Confirm sandbox round-trip works against vendor-confirmed schema (A3 step 6).
2. Set `INVU_REFERENCE_WRITE_ENABLED=true` in **staging** for one venue. Watch the integration audit log for one week.
3. If clean, promote to production for that venue. Watch one more week.
4. Roll out venue-by-venue with an admin kill-switch.

### C2. Wire the four satellite reads (depends on B2)
- Replace each `return [];` stub in `src/lib/invu/client.ts` with a real `callInvuList(...)`. The aggregation pipeline already merges results, so no caller-side change needed.
- Verify on staging: a manually-issued credit note in INVU should reduce the corresponding `CommissionAllocation.amountCents` on the next aggregation run.

### C3. Webhook listener (depends on B3)
- Build `src/app/api/webhooks/invu/route.ts` with HMAC verification per vendor scheme.
- On `order.closed`: short-circuit polling for that order — kick the matcher immediately.
- On `creditnote.created`: trigger `processCreditNote` directly.
- Keep polling running for ≥ 30 days as a safety net, then deprecate.

### C4. Replace human table-bind with INVU table API (depends on B4)
- Single biggest trust-loop improvement. Replaces `table-open-bind/route.ts` human action with an automated bind at table-open time.
- Once landed, `OperationalBinding` becomes a write-and-confirm record rather than a human-intent record. Tier-2 → Tier-1 promotion follows automatically.

---

## Bucket D — RENAME FOR SAFETY (schema migration, schedule before C1)

### D1. Split `BOUND_TO_POS` into two states 🚨 finance-critical naming fix
- **Why:** Today's `BOUND_TO_POS` reads as "INVU acknowledged the write". It actually means "OKÜ recorded the intent locally". Finance, ops, and the audit log all consume this name. Misleading semantics will produce wrong answers in dispute resolution once Tier-1 starts mintng alongside Tier-2.
- **Proposed enum (per §8.2 of the spec):**

  ```prisma
  enum AttributionSessionStatus {
    CAPTURED
    SEATED
    POS_BIND_INTENT_RECORDED   // local-only OperationalBinding written
    POS_REFERENCE_WRITTEN      // citas/add round-trip succeeded
    VERIFIED_POS_SALE
    CANCELED
    EXPIRED
  }
  ```

- **Migration plan:**
  1. Add the two new enum values via `npx prisma db push --skip-generate && npx prisma generate`. Postgres handles additive enum changes without table rewrite.
  2. SQL backfill: `UPDATE "AttributionSession" SET status = 'POS_BIND_INTENT_RECORDED' WHERE status = 'BOUND_TO_POS';`
  3. Update all writers (~5 callers — `table-open-bind/route.ts`, identity service, etc.) to write the new value.
  4. Update all readers (~10 callers — admin revenue routes, host UI components, audit reports) to recognise the new value. Keep `BOUND_TO_POS` in the matching/UI logic for one release cycle as a safety net.
  5. Update UI chip colour map in `BindInvuOrderControl.tsx` and `HostDashboardClient.tsx`.
  6. Once the C1 cutover lands, `POS_REFERENCE_WRITTEN` becomes the new mint precondition (alongside `VERIFIED_POS_SALE`).
  7. Drop `BOUND_TO_POS` from the enum after one clean reporting window.
- **Sequencing:** Land **before** C1 so the new state can be populated truthfully on first cutover. If we land C1 first, every successful write gets stuck on the old name and the rename becomes a much bigger backfill.

---

## Sequencing summary (one-glance Gantt)

```
Week 0  ├ A1 token rotation                          ┐
        ├ A2 streetside host visibility              │ ship in parallel
        ├ A3 pre-stage citas/add (dormant)           │ no INVU dependency
        ├ A4 historical backfill                     │
        └ Send vendor memo (Bucket B kicks off)      ┘

Week 1-2 ├ Receive vendor answers (B1, B4 prioritised)
         └ D1 enum rename (schema + writers + readers)

Week 3-4 ├ C1 citas/add cutover in staging
         └ C2 satellite reads (if B2 answered)

Week 4+  ├ C1 promotion to production, venue-by-venue
         ├ C3 webhook listener (if B3 answered)
         └ C4 INVU table API integration (if B4 answered)
```

---

## Definition of "trust loop fully closed"

We declare the loop closed when **all** of the following are true:

1. ✅ Every `?ref=` reservation produces a `QR_RESERVATION / CAPTURED` session. *(Already true.)*
2. ✅ Restaurant host can see the referrer on the reservation card. *(Already true.)*
3. ⏳ Every `SEATED` session results in a `POS_REFERENCE_WRITTEN` entry — i.e. INVU has acknowledged our reference write. *(Pending C1 + D1.)*
4. ⏳ Every closed INVU order with a referrer-attributed reservation reaches `VERIFIED_POS_SALE` at Tier-1 (POS-native), not just Tier-2 (operational). *(Pending C1.)*
5. ⏳ Credit notes and split payments are reflected in commission allocations within one sync interval of occurring in INVU. *(Pending C2.)*
6. ⏳ End-to-end "INVU close → commission minted" latency is under 60 seconds. *(Pending C3 webhooks.)*
7. ⏳ Reservation→table binding requires no human action. *(Pending C4 INVU table API.)*

Items 6 and 7 may remain "best-effort" if INVU never publishes the underlying surfaces. Items 3-5 are the non-negotiable goals.
