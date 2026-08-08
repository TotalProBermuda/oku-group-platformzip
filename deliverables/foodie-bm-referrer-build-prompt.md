# Foodie.bm — Restaurant-First Referrer, Host, Event & POS-Attribution Build Prompt

> Paste this entire document as the opening message to a Replit agent in your **Foodie.bm** project. It describes the schema, APIs, UI surfaces and integration patterns required to layer a restaurant-owned referrer/event/POS-attribution system onto your existing platform without disturbing what already ships (diner directory, claim flow, $200/mo subscription, owner dashboard, loyalty club, admin centre).
>
> The system is modeled on the production **OKÜ Hospitality Group** referrer + INVU-POS trust architecture, re-shaped from a single-operator (3 venues) world into a multi-tenant (N independent restaurants, each their own tenant) world.

---

## 0. Mission

Build a **restaurant-first referrer, host, event-ticketing and POS-attribution module** inside Foodie.bm. The platform sets the floor (KYC, payment rails, anti-fraud, trust scoring, dispute UI). Each restaurant sets the ceiling (commission rates, event pricing, who their subhosts are, what payout cadence they prefer).

The trust anchor is **the restaurant's POS** — commissions are anchored to *actual* table-checkout totals pulled from Lightspeed / Square / Toast / Aloha (and a "Generic CSV/Webhook" adapter for island-specific systems), never to estimated booking values.

Architecturally, treat every restaurant as a **tenant** with its own commission policy, host hierarchy, event catalogue, payout schedule and POS connection. The platform owns the canonical ledger; restaurants own the rules.

---

## 1. Architectural principles (non-negotiable)

1. **Restaurant = Tenant.** Every commission rate, event, host, subhost, POS connection and payout policy is scoped by `restaurantId`. There are no platform-wide commission defaults beyond an absolute floor (e.g. 1%) and ceiling (e.g. 25%) used only for sanity checks.
2. **POS is the trust anchor.** Commissions never finalize from a self-reported value. They finalize when a POS adapter posts an authoritative `actualSpendCents` for the attributed table/ticket.
3. **Append-only ledger.** Every commission state change writes a `CommissionLedgerEntry` row. Nothing is ever updated in place. Payouts settle a *range* of confirmed entries.
4. **Hierarchical hosts.** `Restaurant → Host → Subhost → Referrer`. A subhost is a Host with a `parentHostId`. Permissions and rate overrides cascade.
5. **Code-based attribution + window.** A reservation/ticket carries `referralCode` at booking time. POS check-in opens an attribution window (default 4h, configurable per restaurant). When the POS posts the close, attribution is locked.
6. **Idempotency everywhere.** Every external POS webhook, every payout job, every ledger write must accept an `idempotencyKey` and dedupe on it.
7. **Multi-tenant scale assumptions.** Plan for: 5 000 restaurants × 50 subhosts × 200 active referral codes × 30 events/yr × 50k reservations/restaurant/yr. Index every `(restaurantId, *)` lookup. Partition the ledger by month.
8. **Backwards compatible with existing Foodie.bm.** Do not break the current 5%-flat referrer dashboard; migrate it behind a feature flag (`useRestaurantOwnedCommissions`) so legacy referrers keep working until each restaurant flips the switch.

---

## 2. Data model (Prisma — adapt to Drizzle if your project uses it)

> All `cents` fields are `Int` storing the smallest currency unit. All money fields carry an explicit `currency` (`BMD` / `USD`). All timestamps are UTC.

```prisma
// ── Tenant tree ────────────────────────────────────────────────────────────

model Restaurant {
  id                       String   @id @default(cuid())
  slug                     String   @unique
  name                     String
  ownerUserId              String?
  claimStatus              ClaimStatus @default(UNCLAIMED)
  subscriptionStatus       SubStatus   @default(NONE)        // existing $200/mo
  // Restaurant-owned referral policy
  referralProgramEnabled   Boolean  @default(false)
  defaultDiningCommissionBps   Int  @default(500)            // 5.00%
  defaultEventCommissionBps    Int  @default(800)            // 8.00%
  defaultHappyHourCommissionBps Int @default(300)
  defaultVipCommissionBps      Int  @default(1200)
  attributionWindowMinutes Int      @default(240)            // POS window after check-in
  payoutSchedule           PayoutSchedule @default(MONTHLY)
  payoutMinCents           Int      @default(5000)           // $50 floor
  currency                 String   @default("BMD")
  // Trust floor/ceiling (platform-set, restaurant cannot exceed)
  // Enforced in service layer.
  createdAt                DateTime @default(now())
  hosts                    Host[]
  events                   FoodieEvent[]
  posConnection            PosConnection?
  commissionRules          CommissionRule[]
  payoutPolicies           PayoutPolicy[]
  @@index([slug])
  @@index([claimStatus])
}

enum ClaimStatus    { UNCLAIMED  PENDING  CLAIMED }
enum SubStatus      { NONE  TRIAL  ACTIVE  PAST_DUE  CANCELLED }
enum PayoutSchedule { WEEKLY  BIWEEKLY  MONTHLY  MANUAL }

// ── Host hierarchy ─────────────────────────────────────────────────────────
// Host = "the restaurant itself" (root) or a sub-organization the restaurant
// has appointed (concierge desk, agency, influencer collective).

model Host {
  id              String   @id @default(cuid())
  restaurantId    String
  parentHostId    String?                                     // null = root host
  hostType        HostType
  displayName     String
  contactEmail    String
  // Rate overrides (null = inherit from parent or restaurant default)
  diningCommissionBpsOverride   Int?
  eventCommissionBpsOverride    Int?
  happyHourCommissionBpsOverride Int?
  vipCommissionBpsOverride      Int?
  // Access controls
  canCreateReferrers   Boolean @default(true)
  canAccessAllEvents   Boolean @default(false)
  payoutScheduleOverride PayoutSchedule?
  active                Boolean @default(true)
  metadataJson          Json?
  createdAt             DateTime @default(now())

  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  parent       Host?      @relation("HostTree", fields: [parentHostId], references: [id])
  children     Host[]     @relation("HostTree")
  referrers    Referrer[]
  eventAccess  HostEventAccess[]

  @@index([restaurantId, active])
  @@index([parentHostId])
}

enum HostType {
  RESTAURANT_ROOT       // the restaurant itself
  HOTEL_CONCIERGE
  TRAVEL_AGENCY
  INFLUENCER_COLLECTIVE
  TAXI_FLEET
  TOUR_OPERATOR
  CORPORATE_PARTNER
  OTHER
}

// ── Referrers ─────────────────────────────────────────────────────────────
// A referrer is an *individual* who carries a code. They sit under a Host
// (or directly under the restaurant via the root host).

model Referrer {
  id              String   @id @default(cuid())
  hostId          String
  userId          String?                                     // optional Foodie account
  fullName        String
  email           String
  whatsapp        String?
  referralCode    String   @unique                            // e.g. PRIYA-BM
  referrerType    ReferrerType
  // Rate overrides (null = inherit from host)
  diningCommissionBpsOverride   Int?
  eventCommissionBpsOverride    Int?
  happyHourCommissionBpsOverride Int?
  vipCommissionBpsOverride      Int?
  trustScore      Int      @default(50)                       // 0-100
  trustTier       TrustTier @default(BRONZE)
  totalAttributedCents       Int @default(0)                  // verified
  totalCommissionEarnedCents Int @default(0)
  totalPaidCents             Int @default(0)
  active          Boolean  @default(true)
  bio             String?
  metadataJson    Json?
  createdAt       DateTime @default(now())

  host                Host                @relation(fields: [hostId], references: [id], onDelete: Cascade)
  reservationLinks    ReservationReferral[]
  ticketLinks         TicketReferral[]
  ledgerEntries       CommissionLedgerEntry[]
  payoutLineItems     PayoutLineItem[]

  @@index([hostId, active])
  @@index([referralCode])
}

enum ReferrerType {
  INFLUENCER
  CONCIERGE
  TRAVEL_AGENT
  TAXI_DRIVER
  TOUR_GUIDE
  RESTAURANT_PARTNER
  CORPORATE_HOST
  OTHER
}

enum TrustTier { BRONZE  SILVER  GOLD  PLATINUM }

// ── Commission rules ───────────────────────────────────────────────────────
// More granular than the per-referrer overrides. Examples:
// "8% on Wahoo Wine Night for any referrer in Hamilton Princess host"
// "15% on bookings of party >= 8 from any VIP-tier referrer"

model CommissionRule {
  id             String   @id @default(cuid())
  restaurantId   String
  scope          RuleScope
  scopeRefId     String?                                       // hostId, eventId, referrerId, or null
  context        BookingContext                                // DINING / EVENT / HAPPY_HOUR / VIP
  minPartySize   Int?
  minTrustTier   TrustTier?
  rateBps        Int
  priority       Int      @default(0)                          // higher wins
  active         Boolean  @default(true)
  effectiveFrom  DateTime?
  effectiveTo    DateTime?
  createdAt      DateTime @default(now())

  restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@index([restaurantId, active, priority])
}

enum RuleScope { RESTAURANT  HOST  REFERRER  EVENT }
enum BookingContext { DINING  EVENT  HAPPY_HOUR  VIP }

// ── Foodie Events (first-class, restaurant-owned) ─────────────────────────

model FoodieEvent {
  id                 String   @id @default(cuid())
  restaurantId       String
  hostId             String                                    // root host by default
  title              String
  slug               String   @unique
  description        String
  startsAt           DateTime
  endsAt             DateTime
  capacity           Int
  status             EventStatus @default(DRAFT)
  baseCommissionBps  Int                                       // can override restaurant default
  metadataJson       Json?
  createdAt          DateTime @default(now())

  restaurant Restaurant         @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  tiers      EventTicketTier[]
  hostAccess HostEventAccess[]
  tickets    EventTicket[]

  @@index([restaurantId, status, startsAt])
  @@index([slug])
}

enum EventStatus { DRAFT  PUBLISHED  SOLD_OUT  CANCELLED  COMPLETED }

model EventTicketTier {
  id          String  @id @default(cuid())
  eventId     String
  name        String                                         // "GA", "VIP", "Chef's Table"
  priceCents  Int
  capacity    Int
  sold        Int     @default(0)
  // Tier-specific commission override
  commissionBpsOverride Int?

  event FoodieEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@index([eventId])
}

model HostEventAccess {
  id        String  @id @default(cuid())
  eventId   String
  hostId    String
  rateBpsOverride Int?

  event FoodieEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  host  Host        @relation(fields: [hostId], references: [id], onDelete: Cascade)
  @@unique([eventId, hostId])
}

model EventTicket {
  id           String   @id @default(cuid())
  eventId      String
  tierId       String
  buyerEmail   String
  buyerName    String
  qrCode       String   @unique
  pricePaidCents Int
  status       TicketStatus @default(ISSUED)
  issuedAt     DateTime @default(now())
  redeemedAt   DateTime?

  event FoodieEvent @relation(fields: [eventId], references: [id])
  referral TicketReferral?

  @@index([eventId, status])
}

enum TicketStatus { ISSUED  REDEEMED  CANCELLED  REFUNDED }

// ── Reservation ↔ Referrer link (extends your existing Reservation model) ──

model ReservationReferral {
  id              String   @id @default(cuid())
  reservationId   String   @unique
  referrerId      String
  hostId          String
  restaurantId    String
  eventId         String?
  capturedRateBps Int                                        // snapshot at booking time
  context         BookingContext
  status          AttributionStatus @default(PENDING)
  attributionWindowOpensAt DateTime?
  attributionWindowClosesAt DateTime?
  createdAt       DateTime @default(now())

  referrer Referrer  @relation(fields: [referrerId], references: [id])
  // reservation Reservation @relation(...) — link to your existing model

  @@index([restaurantId, status])
  @@index([referrerId, status])
}

model TicketReferral {
  id            String   @id @default(cuid())
  ticketId      String   @unique
  referrerId    String
  hostId        String
  restaurantId  String
  eventId       String
  capturedRateBps Int
  status        AttributionStatus @default(PENDING)
  createdAt     DateTime @default(now())

  ticket   EventTicket @relation(fields: [ticketId], references: [id])
  referrer Referrer    @relation(fields: [referrerId], references: [id])

  @@index([restaurantId, status])
}

enum AttributionStatus {
  PENDING               // booking captured, awaiting check-in
  CHECKED_IN            // POS attribution window open
  CONFIRMED             // POS posted close, commission locked
  PAID                  // included in a settled payout
  VOIDED                // no-show / cancelled / refunded
  DISPUTED
}

// ── POS adapter layer ─────────────────────────────────────────────────────

model PosConnection {
  id             String  @id @default(cuid())
  restaurantId   String  @unique
  provider       PosProvider
  status         ConnectionStatus @default(PENDING)
  authBlobEnc    String                                       // encrypted credentials
  locationId     String?                                      // POS-side location/branch id
  webhookSecret  String                                       // we generate, POS posts here
  lastSyncAt     DateTime?
  lastErrorJson  Json?
  createdAt      DateTime @default(now())

  restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  posChecks  PosCheck[]
}

enum PosProvider     { LIGHTSPEED  SQUARE  TOAST  ALOHA  GENERIC_WEBHOOK  CSV_UPLOAD }
enum ConnectionStatus { PENDING  ACTIVE  ERROR  REVOKED }

// Authoritative table-close record from the POS.
model PosCheck {
  id                   String  @id @default(cuid())
  posConnectionId      String
  restaurantId         String
  externalCheckId      String                                 // POS's own id
  openedAt             DateTime
  closedAt             DateTime
  totalCents           Int
  tipCents             Int
  taxCents             Int
  partySize            Int?
  serverExternalId     String?
  rawJson              Json
  // Linkage
  matchedReservationId String?
  matchedTicketId      String?
  matchStrategy        MatchStrategy?
  receivedAt           DateTime @default(now())
  idempotencyKey       String   @unique

  posConnection PosConnection @relation(fields: [posConnectionId], references: [id])

  @@unique([posConnectionId, externalCheckId])
  @@index([restaurantId, closedAt])
  @@index([matchedReservationId])
}

enum MatchStrategy {
  CHECK_IN_CODE         // staff entered Foodie check-in code into POS note/cover field
  TIME_PARTY_HEURISTIC  // matched within attribution window by party size & time
  MANUAL                // owner reconciled in dashboard
}

// ── Append-only ledger ─────────────────────────────────────────────────────

model CommissionLedgerEntry {
  id              String   @id @default(cuid())
  restaurantId    String
  referrerId      String
  hostId          String
  reservationReferralId String?
  ticketReferralId      String?
  posCheckId      String?
  context         BookingContext
  // Money — ALWAYS in smallest unit
  grossSpendCents     Int                                    // 0 if entry is metadata only
  rateBps             Int
  commissionCents     Int
  currency            String   @default("BMD")
  // Movement
  entryType       LedgerEntryType
  status          AttributionStatus
  occurredAt      DateTime
  recordedAt      DateTime @default(now())
  payoutId        String?
  metadataJson    Json?

  // Snapshot for auditability — never mutate after write
  @@index([restaurantId, recordedAt])
  @@index([referrerId, status])
  @@index([payoutId])
}

enum LedgerEntryType {
  PENDING_OPENED        // booking captured
  CHECK_IN              // staff confirmed arrival
  POS_CONFIRMED         // POS close received → commission locked
  ADJUSTMENT            // manual reconciliation
  VOID
  PAID_OUT
  CLAWBACK              // refund / chargeback
}

// ── Payouts ───────────────────────────────────────────────────────────────

model PayoutPolicy {
  id              String   @id @default(cuid())
  restaurantId    String
  schedule        PayoutSchedule
  payoutDayOfWeek Int?                                       // 0-6 for WEEKLY/BIWEEKLY
  payoutDayOfMonth Int?                                      // 1-28 for MONTHLY
  minCents        Int      @default(5000)
  fundingSource   FundingSource @default(RESTAURANT_PREPAID)
  active          Boolean  @default(true)

  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
  @@index([restaurantId, active])
}

enum FundingSource { RESTAURANT_PREPAID  PLATFORM_FLOAT  RESTAURANT_INVOICED }

model Payout {
  id           String   @id @default(cuid())
  restaurantId String
  hostId       String?                                      // null = all hosts in restaurant
  periodStart  DateTime
  periodEnd    DateTime
  status       PayoutStatus @default(DRAFT)
  totalCents   Int
  currency     String   @default("BMD")
  rail         PayoutRail
  externalRef  String?
  createdAt    DateTime @default(now())
  settledAt    DateTime?

  lineItems PayoutLineItem[]
  @@index([restaurantId, status])
}

enum PayoutStatus { DRAFT  APPROVED  SENT  SETTLED  FAILED }
enum PayoutRail   { ACH  WIRE  STRIPE_CONNECT  WISE  MANUAL_CHECK }

model PayoutLineItem {
  id           String   @id @default(cuid())
  payoutId     String
  referrerId   String
  amountCents  Int
  ledgerRange  Json                                         // [firstEntryId, lastEntryId]

  payout   Payout   @relation(fields: [payoutId], references: [id])
  referrer Referrer @relation(fields: [referrerId], references: [id])
  @@index([payoutId])
  @@index([referrerId])
}

// ── Trust score (computed nightly) ────────────────────────────────────────

model TrustScoreSnapshot {
  id           String   @id @default(cuid())
  referrerId   String
  computedAt   DateTime @default(now())
  score        Int                                          // 0-100
  tier         TrustTier
  // Component breakdown for explainability
  verifiedRatio   Float                                     // confirmed / pending
  avgSpendCents   Int
  noShowRate      Float
  disputeRate     Float
  ageDays         Int

  @@index([referrerId, computedAt])
}
```

Add a feature-flag table or a single column on `Restaurant` (`useRestaurantOwnedCommissions Boolean`) so legacy 5%-flat referrers keep working until the restaurant migrates.

---

## 3. Service layer (TypeScript)

Build these as **pure functions / services** under `src/server/referrer/`, `src/server/pos/`, `src/server/ledger/`, `src/server/payouts/`. No business logic in route handlers.

### 3.1 Commission resolution
```ts
resolveCommissionBps({
  restaurantId, referrerId, hostId, eventId?, context, partySize?, trustTier
}): { rateBps: number; sourceRuleId: string | null }
```
Resolution order (first match wins; `CommissionRule.priority` breaks ties):
1. Restaurant-scoped + scopeRefId == referrerId
2. Restaurant-scoped + scopeRefId == eventId (when eventId present)
3. Restaurant-scoped + scopeRefId == hostId
4. Referrer-level override (`diningCommissionBpsOverride` etc.)
5. Host-level override
6. Restaurant-level default for the context
7. Platform floor/ceiling clamp

Always return the *snapshot* used in the booking — write it into `capturedRateBps` so future rule changes never re-price old bookings.

### 3.2 Attribution lifecycle
```ts
captureBookingReferral(reservationId, referralCode)         // PENDING_OPENED
recordCheckIn(reservationId)                                // CHECK_IN, opens window
ingestPosCheck(payload)                                     // POS_CONFIRMED on match
voidAttribution(reservationId, reason)                      // VOID + CLAWBACK if needed
```
Each call appends one `CommissionLedgerEntry`. Never mutate prior entries.

### 3.3 POS adapter pattern
One adapter per provider implementing:
```ts
interface PosAdapter {
  provider: PosProvider;
  testConnection(creds): Promise<{ ok: boolean; error?: string }>;
  fetchChecksSince(connection, since: Date): Promise<NormalizedCheck[]>;
  parseWebhook(rawBody, signature, secret): Promise<NormalizedCheck[]>;
}
```
- **Lightspeed / Square / Toast**: pull via OAuth + REST, plus webhook subscriptions.
- **Aloha**: typically no public API — implement `GENERIC_WEBHOOK` mode where the restaurant runs a small middleware (or uploads CSV nightly).
- **CSV_UPLOAD**: owner uploads daily file from `/owner/integrations/pos/upload`. Validates and emits `PosCheck` rows.

All adapters normalize to:
```ts
type NormalizedCheck = {
  externalCheckId: string;
  openedAt: Date;
  closedAt: Date;
  totalCents: number; tipCents: number; taxCents: number;
  partySize?: number;
  serverExternalId?: string;
  rawJson: unknown;
  hintCheckInCode?: string;   // if POS captured it
  idempotencyKey: string;     // sha256(connId + externalCheckId)
};
```

### 3.4 Matching engine
On every `PosCheck` insert:
1. If `hintCheckInCode` present → find reservation with that code on this restaurant within window. Match.
2. Else, look at all `CHECKED_IN` reservations for this restaurant where `closedAt ∈ [windowOpens, windowCloses + 30m]` and `partySize` matches ±1. If exactly one candidate → `TIME_PARTY_HEURISTIC` match. Otherwise mark `unmatched` and surface in owner dashboard for `MANUAL` reconciliation.
3. On match, write `LedgerEntryType.POS_CONFIRMED` with `commissionCents = floor(totalCents * capturedRateBps / 10000)`.

### 3.5 Payout engine (BullMQ job)
- Cron per `PayoutPolicy.schedule`. For each restaurant due:
  1. Aggregate `CONFIRMED` ledger entries per referrer in `[periodStart, periodEnd)` not yet attached to any payout.
  2. Skip referrers below `payoutMinCents`.
  3. Create `Payout` (DRAFT) + `PayoutLineItem` rows. Append `PAID_OUT` ledger entries with `payoutId`.
  4. Notify owner for approval (or auto-approve if policy says so).
  5. Send via `PayoutRail` adapter (Stripe Connect, Wise, ACH file, etc).
- Clawbacks (refund/chargeback) write `CLAWBACK` entries and net against the next payout.

### 3.6 Trust scoring (nightly)
Recompute per referrer. Store snapshot. Promote/demote tier with hysteresis (need 2 consecutive snapshots above threshold to upgrade, only 1 below to downgrade). Tier affects which `CommissionRule`s apply (`minTrustTier`).

---

## 4. API surface (REST under `/api/v1/...`)

All restaurant-scoped endpoints require the caller to be `OWNER` of that restaurant or `SUPERADMIN`. Use existing Foodie auth.

### Restaurant config
```
GET    /restaurants/:id/referral-program
PATCH  /restaurants/:id/referral-program       (toggle, defaults, payout schedule)
GET    /restaurants/:id/commission-rules
POST   /restaurants/:id/commission-rules
PATCH  /restaurants/:id/commission-rules/:ruleId
DELETE /restaurants/:id/commission-rules/:ruleId
```

### Hosts & subhosts
```
GET    /restaurants/:id/hosts
POST   /restaurants/:id/hosts                  (create root or subhost)
PATCH  /restaurants/:id/hosts/:hostId
DELETE /restaurants/:id/hosts/:hostId          (soft-delete: active=false)
POST   /restaurants/:id/hosts/:hostId/invite   (email invite to subhost manager)
```

### Referrers
```
GET    /restaurants/:id/referrers              (filter: hostId, status, trustTier)
POST   /restaurants/:id/referrers              (issue code)
PATCH  /referrers/:referrerId
GET    /referrers/me/dashboard                 (the referrer's own view across all restaurants)
GET    /referrers/me/links                     (list of (restaurant, code, link))
```

### Events
```
GET    /restaurants/:id/events
POST   /restaurants/:id/events
PATCH  /events/:eventId
POST   /events/:eventId/tiers
POST   /events/:eventId/host-access            (grant a host access + override)
POST   /events/:eventId/publish
GET    /events/:eventId/sales                  (per-host, per-tier breakdown)
```

### Ticketing (public)
```
POST   /public/events/:slug/checkout           (body: tierId, qty, buyerInfo, referralCode?)
GET    /public/events/:slug                    (event detail page)
```

### Reservations integration
Extend your existing reservation create endpoint to accept optional `referralCode`. On create, call `captureBookingReferral`.

### Public referrer landing
```
GET    /public/r/:referralCode                 (resolve to {restaurantSlug, referrerName, isVenueScoped, eventsAvailable})
```
This is the multi-tenant cousin of OKÜ's `/r/[code]` — but a single Foodie referral code is **scoped to one restaurant**, not a brand of multiple venues.

### POS
```
GET    /restaurants/:id/pos/connection
POST   /restaurants/:id/pos/connect            (provider, OAuth or creds)
POST   /restaurants/:id/pos/test
DELETE /restaurants/:id/pos/connection
POST   /restaurants/:id/pos/csv-upload
POST   /webhooks/pos/:provider                 (HMAC-verified, public)
GET    /restaurants/:id/pos/unmatched          (owner reconciliation queue)
POST   /restaurants/:id/pos/unmatched/:checkId/match
```

### Ledger & payouts
```
GET    /restaurants/:id/ledger                 (filter: referrerId, status, dateRange)
GET    /restaurants/:id/payouts
POST   /restaurants/:id/payouts/run-now        (manual trigger; returns DRAFT)
POST   /payouts/:payoutId/approve
POST   /payouts/:payoutId/cancel
GET    /referrers/me/payouts                   (referrer's own history)
```

### Admin (platform)
```
GET    /admin/restaurants                      (with referral-program metrics)
GET    /admin/trust-scores                     (cross-tenant)
POST   /admin/disputes/:id/resolve
GET    /admin/payouts/health                   (rail success rates)
```

---

## 5. UI surfaces

### 5.1 Owner dashboard — new tabs under `/owner`
- **Referral Program** (`/owner/referrals`)
  - Toggle: enable program. Defaults card (4 context rates). Attribution window slider. Payout schedule selector.
  - "Hosts" subtab: tree view (Restaurant > Hosts > Subhosts > Referrers). Add host, add subhost, invite subhost manager.
  - "Rules" subtab: tabular CommissionRule editor (scope × context × priority).
  - "Performance" subtab: per-host, per-referrer revenue, conversion, trust tier distribution.
- **Events** (`/owner/events`) — first-class section, separate from Campaigns.
  - Create event wizard (3 steps: details → tiers → host access & rates).
  - Event detail view with sales chart, tickets sold per tier per host.
  - "Comp tickets" + "Refund" actions.
- **POS Integrations** (`/owner/integrations/pos`)
  - Provider picker. OAuth flow per provider. Credentials test.
  - Live "last sync" indicator. Unmatched queue with one-click reconciliation.
  - CSV upload fallback.
- **Payouts** (`/owner/payouts`)
  - Upcoming run (DRAFT) → Approve / Cancel.
  - History table. Per-payout drilldown to line items and ledger range.
  - Funding-source picker (prepaid / invoiced / platform-float).

### 5.2 Subhost manager portal — `/host`
A scoped slice of the owner dashboard for the appointed subhost manager (e.g. concierge head). They see only their host subtree, can issue/revoke referrer codes, see their team's performance.

### 5.3 Referrer hub — extend existing `/referrer`
Today it's flat with one 5%. Make it multi-restaurant:
- Sidebar lists every restaurant they hold a code for.
- Per-restaurant tab with the dashboard shape Foodie already has, plus an "Events" subtab with shareable event-specific links and ticket attribution columns.
- Trust score widget with tier and what unlocks at the next tier.

### 5.4 Public guest landing — `/r/:code`
Mirror what OKÜ shipped (4 tabs: Welcome / Reserve / About / Menu) but **restaurant-scoped**:
- Header shows the restaurant the code belongs to (no concept switcher).
- Reserve tab calls existing reservations API with `referralCode`.
- Menu tab pulls the restaurant's published menu via existing menu CMS.
- About tab from the restaurant profile.

If the code is associated with an event (referrer has shared an event-specific link `/r/:code/e/:eventSlug`), the landing page swaps Reserve for an event ticket purchase flow.

### 5.5 Admin centre — extend `/admin`
- "Trust" section: cross-restaurant referrer rankings, anomaly flags, dispute queue.
- "Payouts" section: rail health, failed payouts, manual reissue.
- "POS" section: per-provider connection health, webhook delivery rates.
- Feature-flag controls for `useRestaurantOwnedCommissions` per restaurant.

---

## 6. Migration path from current 5%-flat system

1. Ship schema + services behind `useRestaurantOwnedCommissions = false` for every existing restaurant.
2. Backfill: every existing referrer becomes a `Referrer` under a synthetic `RESTAURANT_ROOT` `Host` for each restaurant they currently earn from (one per attributed restaurant). Their existing 5% becomes `defaultDiningCommissionBps = 500`.
3. Existing reservations with `referralCode` get backfilled `ReservationReferral` rows in `CONFIRMED` status (no POS data — mark `matchStrategy = MANUAL`, source = `LEGACY`).
4. Owners flip the flag in `/owner/referrals` to take control. Until they do, the platform serves the same flat 5% behaviour they have today.

---

## 7. Scaling considerations (multi-tenant, user-generated)

- **Indexes**: every query is `(restaurantId, ...)`. Add composite indexes accordingly.
- **Ledger growth**: partition `CommissionLedgerEntry` by month (Postgres declarative partitioning). Archive partitions older than 24 months to cold storage; keep aggregate snapshots in `RestaurantPerformanceMonthly`.
- **POS webhook fan-in**: front the webhook endpoints with a durable queue (BullMQ + Redis Streams). Process async. Return 200 immediately with idempotency receipt.
- **Trust score job**: shard nightly recompute by `referrerId % N` workers.
- **Code generation**: referral codes are `{NAME}-{RESTAURANT_SHORT}` (e.g. `PRIYA-BONE`). Use a 3-letter restaurant short + collision retry up to 5 times, then suffix `-2`, `-3`.
- **Hot-restaurant protection**: rate-limit referrer-creation per restaurant to prevent abuse (e.g. 100/day default).
- **Multi-currency**: every money field carries `currency`. BMD is pegged to USD 1:1 but model it explicitly so a future restaurant in another market is a config change, not a refactor.
- **PII**: encrypt `PosConnection.authBlobEnc` with envelope encryption (KMS or at minimum a per-row data key wrapped by a master key in a secret).
- **Audit log**: every `PATCH` on rates, hosts, payouts writes to a generic `AuditEvent(restaurantId, actorUserId, entity, before, after, ts)` table.

---

## 8. Build order (suggested milestones)

1. **M1 — Schema + commission resolver + ledger.** No UI. Unit tests for `resolveCommissionBps` covering every priority case. Append-only ledger writes from a stub `captureBookingReferral`.
2. **M2 — Hosts & referrers CRUD + owner Referral Program tab (defaults + tree view).** Behind flag, no POS yet.
3. **M3 — POS adapters (Square first, Lightspeed second) + matching engine + Owner unmatched queue.**
4. **M4 — Foodie Events (CRUD, public ticket checkout, ticket-level attribution).**
5. **M5 — Payout engine + first rail (Stripe Connect).** Manual approval only.
6. **M6 — Referrer multi-restaurant hub + public `/r/:code` landing.**
7. **M7 — Trust scoring + tier-gated commission rules.**
8. **M8 — Toast & generic webhook adapters, CSV upload fallback, admin POS health.**
9. **M9 — Migration job + flag flip per restaurant.**

Each milestone is releasable on its own and leaves the existing platform fully working.

---

## 9. Out of scope (do not build)

- Diner-side loyalty point math (already exists).
- Existing claim flow & subscription billing for the $200/mo (already exists).
- Existing campaign/ad surfaces (Boost/Experience/etc.) — keep them. The new Events module is additive; eventually the "Experience" campaign type can deprecate, but not in this build.
- Cross-restaurant referrer tier portability (a future feature). For now, trust score is computed cross-tenant but commission tier gates are per-restaurant.

---

## 10. Definition of done

- An owner can flip on the program, set 4 default rates, appoint a Hamilton Princess concierge as a `HOTEL_CONCIERGE` subhost, the concierge can mint 5 referrer codes for their staff, those codes resolve to a restaurant-branded landing page, a guest can book through the link, the staff check-in opens the attribution window, the Square POS posts a $312 close, the matching engine ties it to the reservation, the ledger writes a `POS_CONFIRMED` entry at 5% = $15.60 BMD, the monthly payout job rolls it into a `PayoutLineItem`, the owner approves, Stripe Connect pays the concierge, and both sides see it in their dashboards — **all without a single human touching a spreadsheet**.

When that round-trip works end-to-end for at least two POS providers and one payout rail, ship M1–M5 and call it Phase 1.
