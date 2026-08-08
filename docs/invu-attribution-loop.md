# INVU ↔ OKÜ Attribution Loop — Technical Spec (v2, exhaustive)

**Audience:** OKÜ Hospitality Group platform engineers. Read every section. There are no optional sections.
**Status:** Authoritative. Reflects the **current state of this build** (not the vendor brief, which describes a target state).
**Owners:** Reservations / POS Integration squad.

> ⚠️ **Read-this-first contract.** When this doc says **GREEN**, the connection is wired and verified in production code paths. **YELLOW** means the function exists but is an intentional no-op stub. **RED** means the connection is documented in the vendor brief but is **not implemented** in this build. Do not assume any RED endpoint is live just because the brief lists it.

---

## Table of Contents

1. [What this is, in one sentence](#1-what-this-is-in-one-sentence)
2. [The end-to-end loop (essentials only)](#2-the-end-to-end-loop-essentials-only)
3. [The Earner model (every type, in depth)](#3-the-earner-model-every-type-in-depth)
4. [The Universal Earner Key — `(EarnerType, earnerRefId)`](#4-the-universal-earner-key-earnertype-earnerrefid)
5. [Adding a new earner type — step-by-step](#5-adding-a-new-earner-type-step-by-step)
6. [Internal data model — the trust chain](#6-internal-data-model--the-trust-chain)
7. [The deterministic trust string](#7-the-deterministic-trust-string)
8. [INVU API — connection-by-connection inventory](#8-invu-api--connection-by-connection-inventory)
9. [The earner portal (referral surface)](#9-the-earner-portal-referral-surface)
10. [Guest experience — what happens on the ground](#10-guest-experience--what-happens-on-the-ground)
11. [Restaurant host workflow (in-venue)](#11-restaurant-host-workflow-in-venue)
12. [Commission rule (single source of truth)](#12-commission-rule-single-source-of-truth)
13. [Trust, gaps, and unresolved items in this build](#13-trust-gaps-and-unresolved-items-in-this-build)
14. [What to ask INVU for privately](#14-what-to-ask-invu-for-privately)
15. [Implementation checklist (squad-facing)](#15-implementation-checklist-squad-facing)
16. [File map](#16-file-map)
17. [Glossary (resolve before arguing)](#17-glossary-resolve-before-arguing)

---

## 1. What this is, in one sentence

We are not moving commission logic into INVU. We are making sure the **source attribution of every reservation survives all the way through the restaurant journey** so that, when an INVU check closes, OKÜ can prove:

> *This closed ticket came from this reservation, that reservation came from this earner, therefore this earner is owed commission on the net total before tax.*

The API's only job is **trust optimization** of commission owed, calculated as a percentage of the closed reservation's net total before tax.

---

## 2. The end-to-end loop (essentials only)

```
   ┌─────────────────────────────────────────────────────────────────┐
   │ 1. Guest scans QR / clicks tracked link                         │
   │    → ?ref=Carlos01&earnerType=REFERRER                          │
   ├─────────────────────────────────────────────────────────────────┤
   │ 2. OKÜ creates Reservation + AttributionSession (CAPTURED)      │
   │    + booking_code (public business key)                         │
   ├─────────────────────────────────────────────────────────────────┤
   │ 3. Guest arrives → Restaurant Host marks SEATED + table         │
   │    → AttributionSession transitions to SEATED                   │
   │    → Snapshot frozen: earner, host, zone, table                 │
   ├─────────────────────────────────────────────────────────────────┤
   │ 4. OKÜ → INVU: write reference (CURRENTLY: local only — see §8) │
   │    → AttributionSession transitions to BOUND_TO_POS             │
   ├─────────────────────────────────────────────────────────────────┤
   │ 5. INVU → OKÜ: poll closed orders (citas/ordenesAllAdv tipo=1)  │
   │    → 3-tier deterministic match (booking_code → binding → heur) │
   │    → AttributionSession transitions to VERIFIED_POS_SALE        │
   ├─────────────────────────────────────────────────────────────────┤
   │ 6. OKÜ mints CommissionAllocation rows on net subtotal-pre-tax  │
   │    Gated on: AUTO_MATCHED + (TIER1 or TIER2). TIER3 never mints.│
   └─────────────────────────────────────────────────────────────────┘
```

That is the whole purpose of the two-way sync. Every other endpoint is in service of this loop.

### 2.1 The trust-loop break we are fixing (in three sentences)

> **Read this before anything else.** The whole reason this work exists is that, prior to this round, the trust loop was broken in **three** specific places, and a broken loop in any of them means the referrer is not paid for a real sale.

1. **Restaurant host could not see the "Referred by" tag on the reservation card.** When a guest arrived, the in-venue host had no visible signal that this booking originated from a referrer's QR / link, so the human side of the loop was blind. → **Fixed this round** (`HostOperationsBoard.tsx` now resolves the referrer through a three-tier fallback: `attributionSession.referralActor → attributionSession.legacyReferrer → reservation.attributions[0]`, then displays it on `BookingCard` and `GuestDrawer`).
2. **The referral info was not carrying through to INVU.** The booking_code (and the trust string built around it — see §7) was never written into INVU's `observations` / `customer_note`, so when the ticket eventually closed there was no in-band identifier inside the POS payload that the matcher could read back. → **Still broken** (`citas/add` is **RED** — see §8.2; `writeReferenceToInvu` is a local-only stub gated by `INVU_REFERENCE_WRITE_ENABLED`).
3. **There was no anchor coming back from INVU to the specific reserver.** Without (2), the closed-order pull from INVU returns a ticket with no link to the originating reservation, so the system cannot attribute the closed revenue to the right `(EarnerType, earnerRefId)` pair, which means commission cannot be minted with deterministic confidence. → **Partially compensated** by the Tier-2 `OperationalBinding` written when the host opens the INVU order on the right table (`table-open-bind/route.ts`), but **fully reliant on the human host** until §8.2 is wired and §8.7 (table API) lands.

**Net effect today:** the trust loop closes **operationally deterministically** (Tier-2 — anchored inside OKÜ via `OperationalBinding` when the restaurant host correctly opens the INVU order on the seated table). It does **not** yet close **POS-native deterministically** (Tier-1 — embedded inside INVU's own record via `num_cita`/`comentario`) because step (2) above is not wired. Sections §8 and §13 spell out exactly what is and isn't live. The distinction between *operationally* deterministic and *POS-native* deterministic is the exact reason Tier-1 still matters even though Tier-2 already mints commission today.

### 2.2 Current Production Truth (read with finance and operators)

> Use this section verbatim when explaining the trust posture to a non-engineer (CFO, ops lead, vendor liaison). Do not paraphrase — the precision is the point.

**In the current build, commissions can be trusted when ALL of the following hold:**

1. The booking has a valid `AttributionSession` (created on `?ref=` or by host check-in).
2. The restaurant host correctly seated the guest and opened the INVU order on the right table.
3. An `OperationalBinding` row exists linking that table session to the INVU order (`table-open-bind/route.ts` writes this in the same transaction as the table claim).
4. The INVU close arrives on the next sync tick **and** matches at Tier-1 *or* Tier-2.
5. The match status is `AUTO_MATCHED` (Tier-3 heuristic never auto-mints).

**In the current build, commissions are NOT YET fully POS-native because:**

- The reservation reference is **not yet confirmed written into INVU** through `citas/add` (§8.2 RED).
- The four satellite reads (invoice totals, payments, credit notes, order totals) are stubbed (§8.4 YELLOW), so post-hoc voids and split-payment edge cases rely on order-level total regressions on the next sync.
- There is no INVU table API (§8.7), so reservation→table binding still depends on a human getting it right.

**Practical implication for finance:** any allocation today is backed by an OKÜ-side audit trail (`AttributionSession`, `OperationalBinding`, `MatchProof`, `recordIntegrationAudit`), but *not* by a confirmed in-band reference inside INVU's own order record. Tier-1 (POS-native) closure is the next milestone, gated on `citas/add` cutover and the INVU vendor questions in §13.3.

---

## 3. The Earner model (every type, in depth)

> **Read carefully — the canonical enum is `EarnerType` in `prisma/schema.prisma` (line 3752). Every commission-bearing surface in this build resolves to one of these five values.**

```prisma
enum EarnerType {
  REFERRER     // Independent commercial actor — the dominant earner type today.
  HOST         // External commercial / streetside host. NOT the in-restaurant maître d'.
  PARTNER      // Business entity (hotel, agency, brand) that resells / co-promotes.
  INFLUENCER   // Social audience holder driving event/dining tickets.
  OTHER        // Escape hatch — used only with explicit admin tagging. Avoid for new flows.
}
```

These five values are joined to a separate **subject-record id** (`earnerRefId`) to form a unique earner. Together they make the universal key (see §4).

### 3.1 `REFERRER` — the dominant earner today

**Subject record:** `Referrer` table (`prisma/schema.prisma`) — also resolvable through the newer `ReferralActor` table when present.

**Sub-typing inside `REFERRER`** lives in two parallel enums:

```prisma
enum ReferrerType {           // Legacy — used by Referrer rows
  STREETSIDE_HOST
  TAXI_DRIVER
  TOUR_GUIDE
  HOTEL_CONCIERGE
  PARTNER                     // Note: this PARTNER is a *flavour of REFERRER*, not the PARTNER EarnerType.
}

enum ReferralActorType {      // Newer — used by ReferralActor rows
  STREETSIDE_HOST
  TAXI_DRIVER
  UBER_DRIVER
  TOUR_GUIDE
  HOTEL_CONCIERGE
  INFLUENCER_SUB_REFERRER     // Bridge into the INFLUENCER earner tree
  PROMOTER
  PRIVATE_NETWORK
  OTHER
}
```

**Resolution priority** (commission minting service):

1. `AttributionSession.referralActorId` → `ReferralActor.id`
2. `AttributionSession.legacyReferrerId` → `Referrer.id`
3. `Reservation.attributions[0].referrerId` → `Referrer.id` *(legacy fallback)*

**Where `earnerType = REFERRER` rows are minted:**
- `src/server/services/invu/commissionMintingService.ts` (auto, on `AUTO_MATCHED` + `TIER1`/`TIER2`)
- `src/app/api/v1/host/bookings/[id]/close/route.ts` line 179 (host-driven close)
- `src/lib/invu/creditNotes.ts` (negative allocation on credit-note reversal)

**Default rate when no compensation plan resolves:** `5%` (constant `FALLBACK_COMMISSION_PCT` in `commissionMintingService.ts`).

### 3.2 `HOST` — the external streetside / commercial host

**Subject record:** `RestaurantHostProfile` (preferred via `hostProfileId`) or a `User` with role `STREETSIDE_HOST` resolved through `AccountProfileLink`.

> **Naming hazard:** The `HOST` `EarnerType` is the **external commercial host** who hands out QR codes (Dani, Felix, Isla, Maya in the seed). The **restaurant host / maître d'** who marks guests `ARRIVED` and `SEATED` is **not** an earner unless explicitly opted in. They operate the OKÜ host webapp; their job is to make the trust chain become operational at SEATED.

**Resolution priority** (commission minting service):

1. `AttributionSession.hostProfileId` → `RestaurantHostProfile.id` *(preferred)*
2. `AttributionSession.hostUserId` → look up profile via `AccountProfileLink`
3. `Reservation.assignedRestaurantHostId` *(legacy / Tier-3)*

**Where `earnerType = HOST` rows are minted:**
- `commissionMintingService.ts` (auto)
- `src/app/api/v1/host/bookings/[id]/close/route.ts` line 159 (host-driven close)

**Aggregator buckets** (`/api/v1/admin/revenue/events`):
- `HOST` → `bucket.hostCents`

**Important:** a single closed table session can mint **both** a `HOST` and a `REFERRER` allocation if both subjects are present. The `@@unique([tableSessionId, earnerType, earnerRefId])` constraint prevents duplicates within (and across) earner types.

### 3.3 `PARTNER` — business entity

**Subject record:** organisation row keyed by `earnerRefId`. The `EventReferrerCommissionMode` enum has the partner-anchored modes:

```prisma
enum EventReferrerCommissionMode {
  NONE
  PERCENT_OF_INFLUENCER_COMMISSION
  PARTNER_FLAT_PER_ORDER
  PARTNER_PER_SEAT
  PARTNER_PERCENT_OF_TICKET
  PARTNER_FLAT_PLUS_PER_SEAT
  PARTNER_FLAT_PLUS_PERCENT
}
```

**Payment model:** `PARTNER` allocations in this build use the `PARTNER_*` modes above, which are **partner-paid-direct** (the partner cuts the cheque to its own seat). Platform tracks for reporting only — see the `SubCommissionParentType { INFLUENCER, PARTNER }` enum and the partner-paid disclaimers.

**Aggregator buckets** (`/api/v1/admin/revenue/events`):
- `PARTNER` → `bucket.partnerCents`

**Practical note:** historically a row with `ReferrerType = PARTNER` (legacy) and an `EarnerType = REFERRER` allocation appears. Do **not** rewrite legacy data. The aggregator handles both shapes.

### 3.4 `INFLUENCER` — audience-holder

**Subject record:** influencer entity keyed by `earnerRefId`. Also has its own sub-tree via `INFLUENCER_SUB_REFERRER` (`ReferralActorType`) for promoters working under an influencer.

**Aggregator buckets** (`/api/v1/admin/revenue/events`):
- `INFLUENCER` → `bucket.referrerCents` (intentionally bucketed with `REFERRER` for revenue rollups; the type is preserved on the row).

**Approval workflow:** see `enum InfluencerApprovalStatus`. Allocations for `INFLUENCER` may pass through an additional approval gate before payout.

### 3.5 `OTHER` — escape hatch

Use only when an admin manually tags an allocation that does not fit the four canonical types. **Do not introduce new code paths that auto-mint `OTHER`.** If a new persona is recurring, add it as a new `EarnerType` value (see §5).

---

## 4. The Universal Earner Key — `(EarnerType, earnerRefId)`

**This is the single answer to "how do we identify all current and future earners?"**

```ts
// The universal earner key — used as a Map/object key, an SQL composite,
// and a uniqueness constraint. If you need ONE thing to identify an
// earner across the platform, use this exact pair.
type EarnerKey = `${EarnerType}::${string}`;
//                  ^^^^^^^^^^^^   ^^^^^^
//                  EarnerType     earnerRefId  (the subject record id)
```

**Why the type prefix is mandatory:**
- `earnerRefId` is just a cuid that resolves against **different tables** depending on type (`Referrer`, `RestaurantHostProfile`, partner org, influencer entity).
- Without the `EarnerType` prefix you cannot dereference the id.
- The schema enforces this at the storage layer:

```prisma
model CommissionAllocation {
  // ...
  earnerType  EarnerType
  earnerRefId String
  // ...
  @@unique([tableSessionId, earnerType, earnerRefId])
  @@index([earnerType, earnerRefId])
}
```

**This shape appears verbatim throughout the platform — search-and-replace at your peril.**

| Surface                                              | Where it appears                                           |
|------------------------------------------------------|------------------------------------------------------------|
| `CommissionAllocation` row                           | `prisma/schema.prisma` line 3919                           |
| Aggregator grouping key                              | `src/app/api/v1/admin/revenue/obligations/route.ts:93`     |
| Mint service                                         | `src/server/services/invu/commissionMintingService.ts`     |
| Credit-note reversal                                 | `src/lib/invu/creditNotes.ts:63`                           |
| Admin "no commission" override                       | `…/integrations/invu/review-queue/[id]/mark-no-commission` |
| Admin reverse                                        | `…/admin/revenue/allocations/[id]/reverse`                 |
| Earner display lookup                                | `…/admin/revenue/review` and `…/sessions/[id]/details`     |

**Display name resolution rule** (mandatory for any UI surfacing earners):

```ts
// 1. Build the key.
const key: EarnerKey = `${a.earnerType}::${a.earnerRefId}`;

// 2. Resolve the subject by type.
//    Two parallel lookups by id, then merge into a single map.
const referrers = await prisma.referrer.findMany({
  where: { id: { in: earnerIds } },
  select: { id: true, fullName: true },
});
const profiles = await prisma.restaurantHostProfile.findMany({
  where: { id: { in: earnerIds } },
  select: { id: true, displayName: true },
});
const nameById = new Map<string, string>();
referrers.forEach(r => nameById.set(r.id, r.fullName));
profiles .forEach(p => nameById.set(p.id, p.displayName));

// 3. Fallback string is mandatory — never render an empty cell.
const display = nameById.get(a.earnerRefId)
             ?? `${a.earnerType} ${a.earnerRefId.slice(-6)}`;
```

This is the exact pattern used in `/api/v1/admin/revenue/obligations/route.ts` and `/admin/revenue/review/route.ts`. Reuse it; do not invent new display logic.

---

## 5. Adding a new earner type — step-by-step

If a real-world persona keeps appearing as `OTHER`, promote it. Concrete future candidates: `CONCIERGE`, `PROMOTER`, `AFFILIATE`, `HOTEL_DESK`, `EVENT_LEAD`, `BRAND_AMBASSADOR`.

**Do not skip steps — half-installed types corrupt the aggregator.**

1. **Schema:** add the value to `EarnerType` in `prisma/schema.prisma` (line 3752). Run `npx prisma db push --skip-generate && npx prisma generate`. The enum value is purely additive — Postgres handles it without table rewrite.
2. **Decide the subject record.** Pick (or create) the table whose `id` will be stored as `earnerRefId`. Document it in this file's §3.
3. **Resolution:** extend `commissionMintingService.ts` with the new resolution path (priority: `AttributionSession` → fallback). Mint allocations only when an `AUTO_MATCHED + TIER1|TIER2` session is closed.
4. **Display name:** add the lookup to **every** route in §4's table. Search for `nameById` in `src/app/api/v1/admin/revenue/**/*` — every occurrence must include the new subject table.
5. **Aggregator buckets:** decide which revenue bucket the new type rolls up into in `src/app/api/v1/admin/revenue/events/route.ts` (around line 115). Default to a new bucket; do not silently merge into `referrerCents`.
6. **Credit-note reversal:** confirm `src/lib/invu/creditNotes.ts` correctly negates allocations of the new type — it already keys on `earnerType`, but the mint side must produce a deterministic key.
7. **Backfill (if applicable):** if real rows have been mis-tagged as `OTHER`, write an idempotent SQL backfill script under `scripts/`.
8. **UI:** add the type to any filter dropdowns and chip colour maps (search `EarnerType` in `src/components/**`).
9. **Update this doc.** A new earner type without a §3.x sub-section is a documentation regression.

---

## 6. Internal data model — the trust chain

Every public-facing identifier in this loop has one job. Don't reuse them.

| Identifier                | Type            | Purpose                                                          |
|---------------------------|-----------------|------------------------------------------------------------------|
| `Reservation.id`          | Internal cuid   | DB primary key. Never exposed to guests or INVU.                 |
| `booking_code`            | Public string   | The **external immutable business key** for the reservation.     |
| `customer_id`             | Internal cuid   | Belongs to the guest. One customer can have many bookings.       |
| `AttributionSession.id`   | Internal cuid   | The trust-chain row. One per reservation (after this round).     |
| `tableSessionId`          | Internal cuid   | The seating event. Anchor for INVU `num_cita`.                   |
| `EarnerKey`               | Composite       | `${EarnerType}::${earnerRefId}` (see §4). The earner's identity. |

**Rule:** the **confirmation code shown to the guest === `booking_code`**, and that string is what we write into INVU's `num_cita`. It is *not* a database primary key, and it must remain stable for the life of the reservation.

### 6.1 `AttributionSession` lifecycle (this build, exact enums)

```prisma
enum AttributionSessionStatus {
  CAPTURED          // Created on public reservation POST when ?ref resolves
  SEATED            // Restaurant host marked SEATED + assigned table
  BOUND_TO_POS      // booking_code written into INVU (currently local-only — see §8)
  VERIFIED_POS_SALE // INVU close arrived + AUTO_MATCHED at TIER1 or TIER2
  CANCELED          // Terminal: no-show, walk-out, or admin cancel
  EXPIRED           // Terminal: TTL elapsed without progressing
}

enum AttributionSessionSource {
  QR_RESERVATION    // Public ?ref= path (the loop closed in this round)
  HOST_CHECKIN      // Restaurant host check-in flow
  HOST_WALKIN       // Streetside host books on the spot
  MANUAL_ADMIN      // Admin tooling override / dispute resolution
}
```

**Transition rules** (enforce these in code; do not mutate status freely):

```
CAPTURED ──► SEATED ──► BOUND_TO_POS ──► VERIFIED_POS_SALE
   │           │             │                  │
   ├──────────┼─────────────┼──► CANCELED       │
   │           │             │                  │
   └──────────┼─────────────┴──► EXPIRED        │
              │                                  │
              └──── (cannot regress) ────────────┘
```

- Never **downgrade** status (e.g. `VERIFIED_POS_SALE → SEATED`).
- `EXPIRED` and `CANCELED` are absorbing states.
- The mint gate is `VERIFIED_POS_SALE` plus `AUTO_MATCHED` plus tier in `{TIER1_DETERMINISTIC, TIER2_OPERATIONAL}`. **`TIER3_HEURISTIC_REVIEW` never mints automatically.**

---

## 7. The deterministic trust string

Write this exact pattern wherever this build later wires a real `citas/add` body (see §8.2 — currently RED):

```
OKU|RES:{reservation_id}|BOOK:{booking_code}|TS:{table_session_id}|REF:{referrer_code}|EARNER:{earner_type}
```

Example:

```
OKU|RES:r_9082|BOOK:OKU-2026-69ZPJ58Q|TS:ts_12345|REF:Carlos01|EARNER:REFERRER
```

**Why this exact shape:**

- `OKU|` prefix → cheap regex filter when scanning INVU comments at scale.
- Pipe-delimited, key-prefixed → stable to parse even if INVU truncates trailing chars.
- All values are short, ASCII-safe, and free of characters INVU's UI escapes.
- Every field appears even when empty (use `-`) so the parser is positional-safe.
- The `BOOK:` field MUST match the exact regex `OKU-\d{4}-[A-Z0-9]{8}` — that is what the Tier-1 matcher (`BOOKING_CODE_RE` in `invuMatchService.ts`) extracts from `observations`.

`num_cita` carries the **short** key (`booking_code`); `comentario` carries the **rich** key (the trust string above); `descripcion` carries the human summary for floor staff (e.g. `Carlos01 referral | 19:00 | Table T9 | OKÜ`).

---

## 8. INVU API — connection-by-connection inventory

> **This is the section the dev team must memorise before touching anything.** It documents what is wired in **this build**, where the code lives, and what is missing.

Legend:
- 🟢 **GREEN** — implemented, called from production code paths, tested.
- 🟡 **YELLOW** — function exists but is an **intentional no-op stub** awaiting a vendor URL or feature-flag flip.
- 🔴 **RED** — described in the vendor brief but **not implemented** in this codebase.

### 8.1 🟢 Auth — `POST /invuApiPos/userAuth`

- **Status:** GREEN. Live and exercised on every credential save.
- **Code:**
  - `src/server/services/invu/invuAuthService.ts` (canonical: stores encrypted credentials, status, masked token).
  - `src/lib/invu/client.ts` `authenticate()` (used by the worker re-auth path).
- **Storage:** `InvuIntegrationCredential` per venue, fields:
  - `apiUsernameEncrypted`, `apiPasswordEncrypted`, `accessTokenEncrypted` (AES via `invuEncryptionService`).
  - `accessTokenMasked` (e.g. `***ab12cd`) for admin display.
  - `accessTokenIssuedAt`, `accessTokenExpiresAt`, `tokenLastRotatedAt`.
  - `apiUserType` (`ApiUserType` enum) and `apiUserExpiresAt` (vendor-side user expiry).
  - `branchScoped` boolean — INVU users are branch-scoped by vendor policy.
  - `status: InvuCredentialStatus` (`CONNECTED`, `FAILED`, `DISCONNECTED`, …).
  - `lastAuthSucceededAt`, `lastAuthFailedAt`, `lastAuthError`.
- **Trust:** encrypted at rest; never logged in plaintext; revocation path exists (`revokeToken` in `client.ts`).
- **Gap:** **no scheduled token-rotation job exists.** Rotation only happens when an admin re-saves credentials (`authenticateInvu`). Vendor recommends rotation every 15 days. **TODO** is an unaddressed risk — see §13.

### 8.2 🔴 Forward write — `POST …?r=citas/add`

- **Status:** RED. **Not called anywhere in this build.**
- **What exists instead:** `src/server/services/invu/invuReferenceWriter.ts` (`writeReferenceToInvu`).
  - Writes the booking_code into the **local** `TableSession` row (`invuReferenceWritten`, `invuReferenceWrittenAt`, `invuReferenceField`).
  - Records intent in `recordIntegrationAudit("INVU_REFERENCE_WRITE_ATTEMPTED", …)`.
  - HTTP push is gated behind feature flag `INVU_REFERENCE_WRITE_ENABLED`. **The flag is off in dev and there is no production cutover yet.**
  - The header comment on the file calls this out explicitly: *"The current INVU sandbox does not expose a public PATCH endpoint for these fields."*

- **Documented `citas/add` body fields** (vendor docs):

  ```
  cliente, descripcion, cerrar_orden, invitados, pagos, comentario,
  num_cita, items, id_tipo_integracion, tipo_orden_obj
  ```

- **⚠️ Field-target mismatch — read before flipping the flag.** The current stub in `invuReferenceWriter.ts` targets:
  - Primary: `observations`
  - Fallback: `customer_note`

  …but the **vendor brief and §7 of this document** specify the canonical write strategy as:

  | Slot                   | Field         | Why                                             |
  |------------------------|---------------|-------------------------------------------------|
  | Short business key     | `num_cita`    | INVU's "appointment number" — also a search key on `citas/view tipo=0`. |
  | Rich deterministic key | `comentario`  | Holds the full `OKU\|RES:…\|BOOK:…\|TS:…\|REF:…\|EARNER:…` trust string from §7. |
  | Human summary          | `descripcion` | Floor-staff readable line (e.g. `Carlos01 referral \| 19:00 \| Table T9 \| OKÜ`). |

  **Action required when wiring `citas/add`:**
  1. Replace `PRIMARY_FIELD = "observations"` / `FALLBACK_FIELD = "customer_note"` constants in `invuReferenceWriter.ts` with the three-field strategy above (or document why we are deviating).
  2. Update `invuMatchService.ts` Tier-1 extraction sources (currently `externalReference`, `bookingCodeRef`, `observations`) to **also** scan `comentario` and `num_cita` on the read side — otherwise a forward write succeeds but the matcher cannot find it on the next sync tick. The booking-code regex `OKU-\d{4}-[A-Z0-9]{8}` is already correct.
  3. Add a smoke test that round-trips a single `num_cita` through `citas/add` → wait one sync tick → assert Tier-1 match.
  4. **Backward-compatibility scan.** Until we are confident no historical attributions were written to `observations` / `customer_note` (e.g. by an out-of-band tool, manual entry, or a stale flag flip), keep both legacy fields in the matcher's source list. Drop them only after a clean reporting window confirms zero hits.
  5. **Field priority hierarchy on the read path.** Resolve in this exact order, first non-empty match wins, and stamp `MatchProof.sourceField` with the field that produced the booking_code so the trust score and admin audit can show provenance:
     1. `num_cita` — exact match, no regex needed (highest signal).
     2. `comentario` — regex extract of `OKU-\d{4}-[A-Z0-9]{8}` from the trust string.
     3. `descripcion` — regex extract (defensive; humans sometimes paste here).
     4. `externalReference` / `bookingCodeRef` — INVU-side reference fields.
     5. `observations` / `customer_note` — legacy fall-back per (4).
  6. **Validation logging when attribution data is found in unexpected locations.** Emit a structured warning (`recordIntegrationAudit("INVU_ATTRIBUTION_UNEXPECTED_FIELD", …)`) whenever a booking_code is matched from anything *below* `num_cita` / `comentario`. The warning payload must include `tableSessionId`, `bookingCode`, `sourceField`, and `invuOrderId`, so the operations dashboard can flag drifting writers (us or the venue) before they corrupt commission allocations silently.

- **Caller:** `src/app/api/v1/host/table-open-bind/route.ts` line 193 (already invokes the writer; the writer just doesn't call out yet).
- **Implication for the trust loop today:** `BOUND_TO_POS` reflects the **local** binding state, not a confirmed INVU write. Every closed sale therefore relies on `OperationalBinding` for Tier-2 deterministic match unless the booking_code accidentally appears in a manually-edited INVU comment.

- **⚠️ Naming hazard — `BOUND_TO_POS` is currently misleading.** The status name suggests INVU has the reference; in reality it only means "OKÜ has recorded the intent to bind locally" until §8.2 is wired. **Proposed migration (do not execute unilaterally — schema change):**

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

  Today's `BOUND_TO_POS` semantically equals the proposed `POS_BIND_INTENT_RECORDED`. The split would let finance and operators distinguish "we tried" from "INVU acknowledged the write". Migration cost: enum value change + ~15 callers + a backfill UPDATE renaming existing `BOUND_TO_POS` rows. **Action:** schedule as a follow-up task before flipping `INVU_REFERENCE_WRITE_ENABLED`, so the new state can be populated truthfully on first cutover.

### 8.3 🟢 Closed-orders read — `GET …?r=citas/ordenesAllAdv/fini/{epoch}/ffin/{epoch}/tipo/1/grouping/1`

- **Status:** GREEN. The single most important read in this build.
- **Code:** `src/lib/invu/client.ts` `getClosedOrders()` (line 110).
- **Driver:** `worker/jobs/invu-sync.ts` → `src/server/services/invu/invuSyncService.ts` → `runInvuSyncForAllEnabledVenues()`.
- **Cadence:** master tick every 15 min; per-mapping cadence configurable via `IntegrationBranchMapping.syncIntervalMinutes` (default 15, with 30 s slack).
- **Data shape returned** (`storeRawAndNormalize` in `invuNormalizationService.ts`): per-order rows with `total`, `subtotal`, `impuesto`, `propinas`, status, plus the free-text fields used for booking-code extraction.
- **Constraints (vendor-imposed):**
  - All dates are **Unix epoch seconds** (`toEpochSeconds`).
  - Range **cannot exceed one month**. The worker chunks on its own; do not extend windows manually.
  - INVU groups results by Punto de Venta on the auth account, so the `branchId` arg is **informational only** — the API returns rows for whatever branch the credential is scoped to.
- **Trust:** results normalised → aggregated → matched 3-tier. Tier-1 deterministic match looks for the booking-code regex `OKU-\d{4}-[A-Z0-9]{8}` in `externalReference` / `bookingCodeRef` / `observations`.

### 8.4 🟡 Satellite reads — invoice totals, payments, credit notes, order totals

- **Status:** YELLOW. Functions exist, are wired into the aggregation pipeline, and **return `[]`** (intentional no-op). They log a single info message per process via `logSatelliteNoOpOnce()`.
- **Code (all in `src/lib/invu/client.ts`):**
  - `getInvoiceTotals(token, branchId, fromDate, toDate)` → `[]`
  - `getPayments(token, branchId, fromDate, toDate)` → `[]`
  - `getCreditNotes(token, branchId, fromDate, toDate)` → `[]`
  - `getOrderTotals(token, branchId, fromDate, toDate)` → `[]`
- **Why stubbed (verbatim from the file header):** "The vendor has four additional endpoints (invoice totals, payment breakdowns, credit notes, order totals) that would let the trust layer reconcile post-hoc voids and split payments. Their URLs are not yet published. Until then, these functions are intentional no-ops."
- **Compensating behaviour:** `invuAggregationService.ts` falls back to **order-level fields** on `citas/ordenesAllAdv` (`total`, `subtotal`, `impuesto`, `propinas`). This is sufficient for first-pass commission minting but **cannot detect post-hoc voids that arrive after the order was already closed and synced**.
- **Cutover plan:** when INVU publishes the URLs, replace each function body with a real `callInvuList(...)` — no other call-site changes are needed; the aggregation pipeline already merges results.

### 8.5 🔴 Point lookup by booking code — `GET …?r=citas/view/id/{id}/tipo/{0=num_cita, 1=invoice id}`

- **Status:** RED. Not wired.
- **Why we want it:** deterministic single-order lookup keyed on `num_cita` would let the dispute-resolution UI re-fetch a specific INVU record without scanning a date range.
- **Compensating behaviour today:** the worker scans `citas/ordenesAllAdv` with a date window; matches arrive only on the next sync tick.
- **Risk:** debugging a single missing match requires either (a) waiting for the next sync, or (b) running `scripts/test-invu-closed-orders.ts` manually with a custom window.

### 8.6 🔴 Webhooks (orders / tables / credit notes)

- **Status:** RED. INVU does not publicly document webhooks. None are subscribed.
- **Compensating behaviour:** polling, every 15 min by default.
- **Operational consequence:** end-to-end latency from "INVU close" to `VERIFIED_POS_SALE` is up to one sync interval (15 min default).

### 8.7 🔴 Table-state APIs (mesa / open-table / bind-reservation)

- **Status:** RED. Not publicly documented; not implemented.
- **Compensating behaviour:** the restaurant host opens the order on the right table by hand. The trust chain still works because `OperationalBinding` (Tier-2) anchors the binding locally.
- **Why this is the biggest gap:** this is the only step of the loop that still depends on a human getting it right. See §13 and §14.

### 8.8 Field semantics gotcha — `tipo`

`tipo` is **the same query-parameter name with different value semantics on different endpoints.** Memorise this table; do not write helper code that assumes one meaning across endpoints:

| Endpoint                                | `tipo` semantics                                                                 |
|-----------------------------------------|----------------------------------------------------------------------------------|
| `citas/ordenesAllAdv`                   | `0` open · `1` closed · `2` complete credit notes · `3` deleted · `4` partial CN |
| `citas/OrdenesAllTotales`               | Same status semantics as `ordenesAllAdv`                                         |
| `citas/view/id/{id}/tipo/{X}`           | `0` search by `num_cita` · `1` search by INVU invoice id                          |

---

## 9. The earner portal (referral surface)

Every commission earner gets a portal at `/portal/referrals` exposing:

- Unique referral links (with QR images generated server-side).
- Form-link copy/share affordance.
- Click/scan analytics.
- Reservations created.
- Ticket sales created.
- Seated sessions.
- Closed revenue.
- Approved commissions.
- Paid commissions.

### 9.1 Link shape (canonical)

Reservations:

```
https://okuhospitalitygroup.com/reserve?ref=Carlos01&earnerType=REFERRER&campaign=gold-house
```

Tickets:

```
https://okuhospitalitygroup.com/tickets/event-001?ref=Carlos01&earnerType=REFERRER
```

The `earnerType` param **must** be one of the five `EarnerType` values (case-sensitive enum value). Anything else falls through to `OTHER` and will not auto-mint.

### 9.2 Click → attribution flow

1. Landing page reads `ref`, `earnerType`, optional `campaign`.
2. Backend resolves `ref` → real `earner_id` via the 3-tier resolver in `src/server/referrals/referralActorService.ts` (`ReferralActor` → `ReferralLink` → `Referrer` legacy).
3. Backend creates a pending `AttributionSession` (`source: QR_RESERVATION`, `status: CAPTURED`).
4. When the reservation form is submitted, attribution is **silently** attached. The guest never types or sees the referrer code.

---

## 10. Guest experience — what happens on the ground

### 10.1 Scan QR / open link
Branded OKÜ landing page (venue-aware, optionally event-aware). Branded to OKÜ, **not to the earner personally**.

### 10.2 Silent bind
Backend attaches:
- `earner_id`
- `earner_type` (one of `EarnerType`)
- `campaign_id`
- `source_channel ∈ {qr, form, link}`
- `landing_session_id`

### 10.3 Reservation form
Guest enters: name, phone, email, date, requested time, covers, optional occasion, optional notes. Nothing about referrers. Ever.

### 10.4 Confirmation
Guest receives the unique `booking_code`. This is the immutable external key from reservation → seating → INVU → closed ticket.

---

## 11. Restaurant host workflow (in-venue)

The **restaurant host** uses the OKÜ host webapp to:

1. Search reservation.
2. Mark `ARRIVED`.
3. Mark `SEATED` and assign/confirm the table.

At the moment of `SEATED`, OKÜ **automatically** materialises:

- `reservation_id` (already existed)
- `booking_code` (already existed)
- `attribution_session_id` (transitions `CAPTURED → SEATED`, or minted fresh as `HOST_CHECKIN`/`HOST_WALKIN` if no prior session)
- `tableSessionId`
- Frozen snapshot of: `earner_id`, `earner_type`, `referrer_code`, `host_user_id`, `zone`, `table_label`

This is the moment the trust chain becomes operational. Immediately after, the **table-open-bind** route writes the local `OperationalBinding` and calls `writeReferenceToInvu` (which is currently local-only — see §8.2).

---

## 12. Commission rule (single source of truth)

```
commissionable_base = closed_subtotal
                    − discounts
                    − refunds_and_credit_notes
                    − excluded_items

earner_commission   = commissionable_base × commission_rate
```

- The base is **net before tax**. Tax is never commissionable.
- Refunds and credit notes (`tipo=2`, `tipo=4` on `ordenesAllAdv`) are subtracted at reconciliation time. **In this build the credit-notes endpoint is YELLOW (§8.4), so detection relies on the order-level `total` regressing on the next sync.**
- Excluded items are configured per venue (e.g. service-charge passthroughs).
- This logic stays **entirely in OKÜ**. INVU is a source of truth for revenue, never for commission.
- **Default rate when no compensation plan resolves:** `5%` (`FALLBACK_COMMISSION_PCT` in `commissionMintingService.ts`). Override via `CompensationPlan.commissionPercent`.
- Mint gate: `attributionSession.status === VERIFIED_POS_SALE` AND `match.tier IN (TIER1_DETERMINISTIC, TIER2_OPERATIONAL)` AND `match.status === AUTO_MATCHED`. **`TIER3_HEURISTIC_REVIEW` never auto-mints.**

---

## 13. Trust, gaps, and unresolved items in this build

### 13.1 What we trust today (✅)

| Trust claim                                                          | Why we trust it                                                              |
|----------------------------------------------------------------------|------------------------------------------------------------------------------|
| QR `?ref=` produces a `QR_RESERVATION / CAPTURED` session             | Live SQL verification done in this round (Dani, Felix codes).                 |
| Restaurant-host check-in transitions `CAPTURED → SEATED`              | `host/checkin/route.ts` covers both transition and fresh-mint paths.         |
| Restaurant host now sees the **"Referred by"** tag on every reservation card | `HostOperationsBoard.tsx` 3-tier fallback (`session.referralActor → session.legacyReferrer → reservation.attributions[0]`) — closes failure point #1 from §2.1. |
| Table-open-bind writes `OperationalBinding` (Tier-2 anchor)           | `host/table-open-bind/route.ts` runs in the same tx as the table claim.       |
| INVU close polling → 3-tier match → `VERIFIED_POS_SALE`               | `invuMatchService.ts` deterministic Tier-1/Tier-2; Tier-3 routes to review.  |
| Commission minting is idempotent across re-runs                       | `@@unique([tableSessionId, earnerType, earnerRefId])` on `CommissionAllocation`. |
| Earner display lookup is type-aware (`Referrer` + `RestaurantHostProfile`) | Two parallel `findMany` calls merged into a single `nameById` map.       |
| INVU credentials encrypted at rest                                    | `invuEncryptionService` AES; only masked tokens ever logged.                 |
| Aggregator buckets revenue per earner type                            | `events/route.ts` REFERRER+INFLUENCER → `referrerCents`, HOST → `hostCents`, PARTNER → `partnerCents`. |

### 13.2 Gaps (⚠️)

| Gap                                                                                    | Compensating behaviour                                          | Risk                                                                                                  |
|----------------------------------------------------------------------------------------|----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| `citas/add` not wired (§8.2). `BOUND_TO_POS` is local-only.                              | Tier-2 `OperationalBinding` carries the load.                  | If a host opens the order on the wrong table, only Tier-3 heuristic can recover, which never auto-mints. |
| `BOUND_TO_POS` enum name overstates today's reality (means "intent recorded", not "INVU acknowledged"). | Doc-level callout in §8.2; finance/ops trained to read the proposed split. | Misleads downstream consumers (UI chips, audit reports). Schedule the rename per §8.2 before flipping `INVU_REFERENCE_WRITE_ENABLED`. |
| Satellite reads (invoice/payment/credit-notes/order-totals) all return `[]` (§8.4).      | Order-level totals on `ordenesAllAdv` used as the source.      | Post-hoc voids and split-payment edge cases may not be reflected until the order-level total updates.   |
| No webhooks (§8.6). End-to-end latency = sync interval.                                  | Polling at 15 min default cadence.                             | Up to 15 min delay from INVU close → `VERIFIED_POS_SALE` → commission minting.                          |
| No INVU table-state API (§8.7).                                                         | Human host opens the right table.                              | The biggest single failure mode of the loop. Mitigated only by training and by the OKÜ host webapp UX. |
| No scheduled token rotation (§8.1). Vendor recommends every 15 days.                     | Manual re-save by admin.                                       | Token can silently expire; next sync tick will fail and surface as `lastAuthError`.                     |
| Streetside hosts' phone view (`/host/streetside`) and `/api/v1/host/bookings` do not include `attributionSession.referralActor / legacyReferrer` (out of scope this round). | Operations Board renders correctly. | Streetside hosts cannot see referrer names on their own dashboards yet.                                 |
| No retroactive `AttributionSession` for pre-loop reservations (e.g. "Jane").             | UI renders "—".                                               | Historical reporting shows attribution only for bookings made after this round.                         |
| `INVU_REFERENCE_WRITE_ENABLED` exists but is off in dev and has no production cutover plan documented. | Local-only binding (above).                              | Cutover is a one-line env flip + an HTTP call body — but no one has tested the HTTP call body itself.   |

### 13.3 Unresolved items requiring vendor input (🚫)

| Item                                                                  | What we need from INVU                                                                                                  |
|-----------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| Public PATCH endpoint for `observations` / `customer_note`            | The exact route and request body so we can flip `INVU_REFERENCE_WRITE_ENABLED=true`.                                    |
| Published URLs for invoice / payment / credit-note / order-totals     | The four URLs the satellite stubs in `client.ts` are waiting for.                                                       |
| Webhook subscription model (orders, credit notes, tables)             | A push channel — anything from a configurable HTTP webhook to a polling-with-cursor endpoint.                           |
| Table / `mesa` API (open, occupied, freed)                             | Anything resembling the OpenTable integration surface so we can bind reservation→table without a human in the loop.    |
| Confirmed semantics for `id_tipo_integracion` to identify OKÜ orders   | Lets us filter `ordenesAllAdv` to OKÜ-originated orders only on the read side.                                          |
| Per-branch `apiUserExpiresAt` semantics                                | The vendor told us users expire; we need a programmatic way to detect imminent expiry before the next sync fails.       |
| Complete `citas/add` body schema                                       | Vendor confirmation of the full request schema beyond `num_cita` / `comentario` / `descripcion`: per-field size limits, encoding (UTF-8? ASCII-safe?), reserved values, required vs optional flags, and behaviour when an unknown field is sent. |
| Attribution retention window                                            | How long INVU retains booking records (`num_cita`-keyed) so we know the maximum lookback for retroactive attribution matching and dispute resolution. Drives the upper bound on `OperationalBinding` retention too. |
| Concurrent-write behaviour on the same booking                          | Vendor confirmation of how INVU handles repeat writes to the same `num_cita`: overwrite, append, or reject. Drives our idempotency strategy in `writeReferenceToInvu` and whether we need a client-side compare-and-swap. |
| API rate limits                                                        | Documented per-token / per-branch rate limits (RPS, burst, daily). The current 15-min sync interval is conservative-by-default; without published limits we cannot safely tighten it or add on-demand retries. |
| Webhook delivery guarantees (when webhooks land — see §8.6)            | At-least-once vs at-most-once, ordering, retry policy, idempotency key, signature scheme, and SLA for `order.closed` / `creditnote.created` events. Without this we cannot deprecate polling. |

---

## 14. What to ask INVU for privately

If we get private (OpenTable-style) access, the following endpoints close the remaining gaps in §13.3 and let us delete the entire YELLOW + RED columns of §8:

- A `mesa` / table API (list, status, open).
- An `open-table` / `occupied-table` event API.
- An explicit reservation-reference field mapping (so we don't have to pack everything into `observations`).
- Webhooks for: order opened, order closed, credit note created, table freed.
- A documented PATCH for `observations` / `customer_note`.
- Confirmed `id_tipo_integracion` value reserved for OKÜ.

---

## 15. Implementation checklist (squad-facing)

- [x] **Schema:** `AttributionSession` carries `source`, `status`, `seatedAt`, `boundAt`, `verifiedAt`, `invuOrderId`, `bindMethod`, plus relations to `referralActor` and `legacyReferrer`.
- [x] **Public POST `/api/reservations`:** opens `QR_RESERVATION / CAPTURED` session when `?ref=` resolves.
- [x] **Streetside host backfill:** `EventReferrerAssignment` rows present for every active streetside host so their `SIDE-*` codes resolve.
- [x] **Host UI (Operations Board):** renders referrer name through three-tier fallback (`session.referralActor → session.legacyReferrer → legacy attributions[0]`).
- [x] **3-tier match:** `invuMatchService.ts` Tier-1 (booking code regex) / Tier-2 (operational binding) / Tier-3 (heuristic, review-only).
- [x] **Commission minting:** `commissionMintingService.ts` resolves earner per §3 and gates on `AUTO_MATCHED + TIER1|TIER2`.
- [x] **Worker:** `worker/jobs/invu-sync.ts` master tick every 15 min with per-mapping cadence (slack-protected).
- [x] **Encryption + audit:** credentials encrypted at rest; every reference-write attempt audited via `recordIntegrationAudit`.
- [ ] **`citas/add` HTTP push:** flip `INVU_REFERENCE_WRITE_ENABLED` and replace the stub body in `invuReferenceWriter.ts` with a real call. Test against sandbox first.
- [ ] **Satellite reads:** replace each YELLOW stub in `client.ts` with a real `callInvuList(...)` once URLs land.
- [ ] **Streetside host phone view + `/api/v1/host/bookings`:** roll the `attributionSession.referralActor / legacyReferrer` include out so streetside hosts see attribution on their own dashboards.
- [ ] **Token rotation cron — promoted from passive risk to scheduled deliverable.** Add a BullMQ recurring job (`worker/jobs/invu-token-rotation.ts`) that runs daily, scans `InvuIntegrationCredential` rows where `tokenLastRotatedAt < now() - 14 days` (one day inside the vendor's 15-day cap), and re-runs `authenticateInvu` per venue. Stamp `lastAuthError` on failure and emit an `INVU_TOKEN_ROTATION_FAILED` audit event so ops can alert before the next sync tick fails. **Owner:** integration squad. **Target:** ship before any new venue onboards in production.
- [ ] **Webhook listener (when available):** receive `order.closed` / `creditnote.created` and short-circuit the polling loop.
- [ ] **Backfill historical reservations:** synthesize `AttributionSession` rows for pre-loop bookings that have a legacy `ReservationAttribution.referrerId`.
- [ ] **Document any new earner type per §5** (do not skip the doc step — it's part of the contract).

---

## 16. File map

| Concern                                         | Path                                                                       |
|-------------------------------------------------|----------------------------------------------------------------------------|
| Public reservation POST                         | `src/app/api/reservations/route.ts`                                        |
| Host queue read                                 | `src/server/host/hostService.ts`                                           |
| Host "me" feed                                  | `src/app/api/v1/host/me/route.ts`                                          |
| Host bookings feed                              | `src/app/api/v1/host/bookings/route.ts`                                    |
| Host check-in                                   | `src/app/api/v1/host/checkin/route.ts`                                     |
| Host table-open-bind (calls reference writer)   | `src/app/api/v1/host/table-open-bind/route.ts`                             |
| Host close (manual mint path)                   | `src/app/api/v1/host/bookings/[id]/close/route.ts`                         |
| Host Operations Board UI                        | `src/components/host/HostOperationsBoard.tsx`                              |
| Streetside host page                            | `src/app/host/streetside/page.tsx`                                         |
| Reservation wizard                              | `src/components/reservations/ReservationWizard.tsx`                        |
| INVU low-level HTTP client                      | `src/lib/invu/client.ts`                                                   |
| INVU auth + credential lifecycle                | `src/server/services/invu/invuAuthService.ts`                              |
| INVU credential encryption                      | `src/server/services/invu/invuEncryptionService.ts`                        |
| INVU sync orchestrator (per-venue cadence)      | `src/server/services/invu/invuSyncService.ts`                              |
| INVU normalization (raw → typed rows)           | `src/server/services/invu/invuNormalizationService.ts`                     |
| INVU 3-tier match                               | `src/server/services/invu/invuMatchService.ts`                             |
| INVU aggregation → TableSession                 | `src/server/services/invu/invuAggregationService.ts`                       |
| INVU reference writer (booking-code → INVU)     | `src/server/services/invu/invuReferenceWriter.ts`                          |
| INVU closed-orders pull                         | `src/server/services/invu/invuClosedOrdersService.ts`                      |
| INVU trust score                                | `src/server/services/invu/invuTrustScoreService.ts`                        |
| Commission minting                              | `src/server/services/invu/commissionMintingService.ts`                     |
| Credit-note reversal                            | `src/lib/invu/creditNotes.ts`                                              |
| Identity / AttributionSession creation          | `src/server/services/invu/identityService.ts`                              |
| Referral actor resolver (3-tier)                | `src/server/referrals/referralActorService.ts`                             |
| Worker entrypoint                               | `worker/index.ts`                                                          |
| Worker job — INVU sync                          | `worker/jobs/invu-sync.ts`                                                 |
| Admin: revenue obligations (earner roll-up)     | `src/app/api/v1/admin/revenue/obligations/route.ts`                        |
| Admin: revenue review queue                     | `src/app/api/v1/admin/revenue/review/route.ts`                             |
| Admin: revenue events bucketing                 | `src/app/api/v1/admin/revenue/events/route.ts`                             |
| Schema                                          | `prisma/schema.prisma`                                                     |

---

## 17. Glossary (resolve before arguing)

| Term                  | Means                                                                                |
|-----------------------|--------------------------------------------------------------------------------------|
| **Earner**            | Anyone who can be paid commission. Identified by the `(EarnerType, earnerRefId)` composite key (§4). One of `REFERRER`, `HOST`, `PARTNER`, `INFLUENCER`, `OTHER`. |
| **Streetside host**   | External commercial host with a referral code. **Is** an earner (`EarnerType = HOST`). |
| **Restaurant host**   | In-venue maître d' / front-desk operator. **Is not** an earner by default.           |
| **`booking_code`**    | Public business key. Same string in OKÜ DB, in the guest's confirmation, and in INVU `num_cita`. Matches regex `OKU-\d{4}-[A-Z0-9]{8}`. |
| **Trust string**      | The `OKU|RES:…|BOOK:…` payload written into INVU `comentario`.                        |
| **`num_cita`**        | INVU field name — quite literally "appointment number". We use it as our booking key. |
| **`tipo`**            | INVU's order-status query param. Values vary by endpoint — see §8.8.                  |
| **`tableSessionId`**  | The seating event id. The anchor for both `OperationalBinding` and INVU writes.       |
| **`OperationalBinding`** | Local row that captures the host's "I opened INVU order X for table Y" intent. Tier-2 deterministic match anchor when `citas/add` is unavailable. |
| **TIER1 / TIER2 / TIER3** | Match confidence tiers in `invuMatchService.ts`. Only TIER1 + TIER2 auto-mint; TIER3 always routes to manual review. |
| **GREEN / YELLOW / RED** | Connection status in §8. GREEN = wired and verified. YELLOW = stub awaiting URL or flag flip. RED = not in this build. |
