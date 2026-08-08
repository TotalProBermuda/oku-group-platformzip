# foodie.bm — Architecture Export from OKU Hospitality Platform
> Structured export of schemas, patterns, RBAC, and engine blueprints from the OKU platform.
> Use this document to bootstrap the foodie.bm multi-restaurant discovery and operations platform.
> Comparable to: Degusta Panama (degustapanama.com)

---

## Table of Contents

1. [Platform Vision Mapping](#1-platform-vision-mapping)
2. [Tech Stack](#2-tech-stack)
3. [Core Data Models (Prisma Schema)](#3-core-data-models)
4. [RBAC — Roles & Permissions System](#4-rbac-roles--permissions)
5. [Referrer Network Engine](#5-referrer-network-engine)
6. [Compensation & Commission Ledger](#6-compensation--commission-ledger)
7. [Restaurant Operations Layer](#7-restaurant-operations-layer)
8. [Events & Ticketing Engine](#8-events--ticketing-engine)
9. [Membership Tier System](#9-membership-tier-system)
10. [Influencer & Partner Engine](#10-influencer--partner-engine)
11. [Sponsorship Placement Engine](#11-sponsorship-placement-engine)
12. [Hiring & HR System](#12-hiring--hr-system)
13. [Notifications & Communications](#13-notifications--communications)
14. [Multilingual / i18n System](#14-multilingual--i18n-system)
15. [Admin Suite Architecture](#15-admin-suite-architecture)
16. [foodie.bm Adaptation Guide](#16-foodiebm-adaptation-guide)
17. [Recommended First Build Sequence](#17-recommended-first-build-sequence)

---

## 1. Platform Vision Mapping

| OKU Concept | foodie.bm Equivalent |
|---|---|
| Single hospitality group (OKU + CATCH venues) | Multi-restaurant network (any city) |
| Series = Dining experience / event | Restaurant listing / dining event |
| Influencer host | Food creator / food blogger |
| Streetside Host / Taxi referrer | Hospitality concierge / hotel partner |
| Membership (EXPLORER → FOUNDER) | Foodie passport / diner loyalty tier |
| Compensation Plan | Restaurant partner referral plan |
| Admin Commercial | Restaurant owner dashboard |
| Superadmin | foodie.bm platform ops |
| Sponsorship Slot | Brand placement within restaurant discovery pages |
| Attribution (UTM + refCode) | Referral tracking for bookings and orders |

---

## 2. Tech Stack

```
Framework:       Next.js 14+ (App Router)
Language:        TypeScript
Database:        PostgreSQL via Prisma ORM
Auth:            NextAuth.js (credentials + JWT strategy)
Job Queue:       BullMQ (Redis-backed async jobs)
File Storage:    Replit Object Storage (swap for S3/Cloudflare R2 in prod)
Email:           Resend (transactional)
Payments:        Authorize.Net (swap for Stripe in foodie.bm)
i18n:            Custom useTranslation hook with JSON locale files (EN/ES/PT)
Styling:         Tailwind CSS + CSS custom properties (glassmorphism tokens)
State:           React context + SWR for data fetching
```

---

## 3. Core Data Models

### 3.1 User & Identity

```prisma
model User {
  id        String     @id @default(cuid())
  email     String     @unique
  name      String?
  imageUrl  String?
  phone     String?
  status    UserStatus @default(ACTIVE)

  roles     UserRole[]
  profile   UserProfile?

  // Role-specific profiles (one per role type)
  influencer InfluencerProfile?
  partner    PartnerProfile?
  investor   InvestorProfile?
  staff      StaffProfile?
  membership Membership?
  referrer   Referrer?
  restaurantHost RestaurantHostProfile?

  orders    Order[]
  tickets   Ticket[]
  checkins  ExperienceCheckin[] @relation("CheckedInBy")
}

enum UserStatus { ACTIVE | SUSPENDED | PENDING | LOCKED | ARCHIVED | BANNED | PASSWORD_RESET_REQUIRED }

model UserProfile {
  userId         String    @unique
  language       String?
  preferredVenue VenueKey?
  marketingOptIn Boolean   @default(false)
}
```

**foodie.bm adaptation:** Replace `preferredVenue` with `preferredCuisine String[]` and `preferredCity String`. Add `dietaryPreferences String[]`.

---

### 3.2 Roles

```prisma
enum RoleKey {
  VISITOR
  ATTENDEE          // → foodie.bm: DINER
  INFLUENCER        // → foodie.bm: FOOD_CREATOR
  PARTNER           // → foodie.bm: RESTAURANT_PARTNER
  INVESTOR
  REFERRER          // → foodie.bm: CONCIERGE / HOTEL_PARTNER
  STAFF_OKU         // → foodie.bm: RESTAURANT_STAFF
  ADMIN_COMMERCIAL  // → foodie.bm: RESTAURANT_OWNER
  ADMIN_IR
  ADMIN_HR
  SUPERADMIN        // → foodie.bm: PLATFORM_ADMIN
  RESTAURANT_HOST   // → foodie.bm: FLOOR_HOST
  STREETSIDE_HOST   // → foodie.bm: PARTNER_AMBASSADOR
}

model UserRole {
  userId  String
  roleKey RoleKey

  @@unique([userId, roleKey])
}
```

---

### 3.3 Venue & Zone (Restaurant Spatial Model)

```prisma
model Venue {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  addressLine String?
  city        String?
  country     String?
  description String?
  commissionValidationMode CommissionValidationMode @default(ON_SEATED)

  zones              Zone[]
  reservations       Reservation[]
  waitlistEntries    ResWaitlistEntry[]
  restaurantHostProfiles RestaurantHostProfile[]
}

model Zone {
  id             String   @id @default(cuid())
  venueId        String
  name           String
  slug           String
  zoneType       ZoneType   // FINE_DINING | NIGHTLIFE | TERRACE | PRIVATE
  conceptKey     String     // logical area identifier
  capacityCovers Int
  isBookable     Boolean  @default(true)
  currentWaitMinutes Int?

  tables         VenueTable[]
  reservations   Reservation[]
  waitlistEntries ResWaitlistEntry[]
}

model VenueTable {
  id           String  @id @default(cuid())
  zoneId       String
  name         String
  minPartySize Int
  maxPartySize Int
  seats        Int
  mergeable    Boolean @default(false)
  isVip        Boolean @default(false)
  positionX    Float?  // for floor plan drag/drop
  positionY    Float?
}
```

**foodie.bm adaptation:** Add `cuisineType String[]`, `priceRange PriceRange`, `googleMapsUrl String?`, `openingHours Json?` to `Venue`. Add `photoGalleryJson Json?`, `featuredDishesJson Json?`.

---

### 3.4 Guest Profile (CRM)

```prisma
model ResGuestProfile {
  id                  String  @id @default(cuid())
  fullName            String
  email               String
  phone               String?
  whatsapp            String?
  preferredConceptKey String?
  dietaryNotes        String?
  accessibilityNotes  String?
  celebrationNotes    String?
  noShowCount         Int     @default(0)
  guestTagsJson       Json?   // VIP, regular, etc.
  preferencesJson     Json?

  reservations    Reservation[]
  waitlistEntries ResWaitlistEntry[]
  privateRequests PrivateRequest[]
}
```

---

### 3.5 Reservation

```prisma
model Reservation {
  id             String            @id @default(cuid())
  venueId        String
  zoneId         String?
  guestProfileId String?
  source         ReservationSource // UMBRELLA_SITE | OKU_SITE | STREETSIDE_HOST | TAXI_DRIVER | HOTEL_CONCIERGE | ADMIN | WALK_IN | QR_CODE
  status         ReservationStatus // PENDING | CONFIRMED | WAITLISTED | ARRIVED | SEATED | COMPLETED | CANCELLED | NO_SHOW

  reservationDate     DateTime
  partySize           Int
  durationMinutes     Int?
  conceptRequested    String?
  occasion            String?
  seatingPreference   String?
  notes               String?
  dietaryRestrictions String?

  // Upsells
  bringOwnBottle     Boolean @default(false)
  corkageFeeCents    Int?
  celebrationDessert Boolean @default(false)
  celebrationMessage String?

  contactName      String
  contactEmail     String
  contactPhone     String?
  contactWhatsapp  String?
  confirmationCode String   @unique

  estimatedRevenueCents Int?
  actualRevenueCents    Int?

  assignedTableLabel       String?
  assignedRestaurantHostId String?
  commissionEligible       Boolean   @default(false)
  commissionValidatedAt    DateTime?
  arrivalConfirmedAt       DateTime?
  seatedAt                 DateTime?

  addons         ReservationAddon[]
  communications ReservationCommunication[]
  attributions   ReservationAttribution[]
  handoffs       ReservationHandoff[]
  commissions    CommissionEntry[]
  statusLogs     ReservationStatusLog[]
}

enum ReservationSource {
  UMBRELLA_SITE | OKU_SITE | CATCH_SITE | TERRACE_SITE
  STREETSIDE_HOST | TAXI_DRIVER | TOUR_GUIDE | HOTEL_CONCIERGE
  ADMIN | WALK_IN | QR_CODE
}

// foodie.bm: Add FOODIE_APP | GOOGLE_RESERVE | OPENTABLE | INSTAGRAM_LINK
```

---

## 4. RBAC — Roles & Permissions

### Permission Map

```typescript
export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  VISITOR:          ["public:read", "series:read"],
  ATTENDEE:         ["public:read", "account:read", "account:write", "series:read", "series:purchase"],
  INFLUENCER:       ["public:read", "account:read", "account:write", "series:read", "influencer:read", "influencer:write"],
  PARTNER:          ["public:read", "account:read", "account:write", "series:read", "partner:read", "partner:write"],
  INVESTOR:         ["public:read", "account:read", "ir:read"],
  STAFF_OKU:        ["public:read", "account:read", "staff:sops:read", "staff:sops:ack"],
  ADMIN_COMMERCIAL: ["public:read", "account:read", "series:read", "influencer:read", "partner:read",
                     "admin:payments:refund", "admin:payouts:write", "admin:audit:read",
                     "admin:compensation:read", "admin:compensation:write"],
  ADMIN_IR:         ["public:read", "account:read", "ir:read", "ir:write", "admin:audit:read"],
  ADMIN_HR:         ["public:read", "account:read", "hr:read", "hr:write", "admin:audit:read"],
  SUPERADMIN:       ["*"], // all permissions
};

export function hasPermission(roles: RoleKey[], perm: PermissionKey): boolean {
  if (roles.includes("SUPERADMIN")) return true;
  return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(perm));
}
```

### Middleware Pattern

```typescript
// src/middleware.ts pattern
import { decode } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const token = await decode({
    token: req.cookies.get("next-auth.session-token")?.value,
    secret: process.env.NEXTAUTH_SECRET!,
    salt: "next-auth.session-token",
  });

  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  const roles = token.roles as RoleKey[];
  const pathname = req.nextUrl.pathname;

  // Route-to-permission guard
  if (pathname.startsWith("/admin") && !hasPermission(roles, "admin:audit:read")) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
}
```

### foodie.bm Permission Extensions

```
RESTAURANT_OWNER: ["restaurant:read", "restaurant:write", "restaurant:reservations:read",
                   "restaurant:staff:manage", "restaurant:analytics:read", "referrer:manage"]
FOOD_CREATOR:     ["public:read", "account:read", "creator:profile:write", "creator:bookings:read"]
DINER:            ["public:read", "account:read", "reservation:create", "review:write"]
CONCIERGE:        ["public:read", "referral:create", "referral:track"]
PLATFORM_ADMIN:   ["*"]
```

---

## 5. Referrer Network Engine

This is the most portable and valuable module for foodie.bm. It tracks who sent guests to a restaurant and rewards them.

### Models

```prisma
enum ReferrerType {
  STREETSIDE_HOST    // → HOTEL_LOBBY_REP
  TAXI_DRIVER        // → RIDESHARE_DRIVER
  TOUR_GUIDE         // → TOUR_OPERATOR
  HOTEL_CONCIERGE    // → stays the same
  PARTNER            // → AFFILIATE_PARTNER
}

model Referrer {
  id               String       @id @default(cuid())
  fullName         String
  referrerType     ReferrerType
  phone            String?
  email            String?
  whatsapp         String?
  organizationName String?
  referralCode     String       @unique
  isActive         Boolean      @default(true)
  userId           String?      @unique   // optional platform account link
  compensationPlanId String?

  attributions   ReservationAttribution[]
  commissions    CommissionEntry[]
  benefits       ReferralBenefit[]
}

// Unified abstraction layer (add this ABOVE legacy Referrer)
model ReferralActor {
  id           String              @id @default(cuid())
  actorType    ReferralActorType   // STREETSIDE_HOST | TAXI_DRIVER | UBER_DRIVER | TOUR_GUIDE | HOTEL_CONCIERGE | PROMOTER | PRIVATE_NETWORK
  displayName  String
  organizationName String?
  phone        String?
  email        String?
  whatsapp     String?
  status       ReferralActorStatus @default(ACTIVE)

  userId              String? @unique  // optional login
  legacyReferrerId    String? @unique  // backward compat

  assignments  ReferralAssignment[]
  links        ReferralLink[]
}

model ReferralAssignment {
  referralActorId      String
  scopeType            ReferralScopeType        // GLOBAL | VENUE | SERIES | CAMPAIGN
  scopeId              String?                  // which venue/restaurant/event
  isCommissionEligible Boolean                  @default(false)
  compensationMode     ReferralCompensationMode // NONE | PERCENT_OF_TRANSACTION | FLAT_PER_COVER | FLAT_PER_PARTY
  rateBps              Int?                     // basis points (1000 = 10%)
  flatAmountCents      Int?
}

model ReferralLink {
  referralActorId String
  code            String   @unique
  url             String?
  qrCodeDataUrl   String?
  clickCount      Int      @default(0)
  isActive        Boolean  @default(true)
}
```

### Attribution Flow

```
Guest arrives / clicks link
  → ReferralLink.code matched → ReferralActor identified
  → Reservation created with source = HOTEL_CONCIERGE (etc.)
  → ReservationAttribution record created:
      referrerId, sourceType, conversionStage = INITIATED
  → Host seats party → commissionValidatedAt set
  → CommissionEntry created (PENDING)
  → Admin reviews → CommissionEntry.status = APPROVED → PAID
```

### ConversionStage Tracking

```prisma
enum ConversionStage {
  INITIATED          // referrer brought guest to door
  REFERRED_UPSTAIRS  // guest agreed to go up
  ARRIVED            // guest physically arrived
  OFFERED            // table/menu presented
  PATRONIZED         // guest sat and ordered
  DECLINED           // guest refused
  LOST               // guest left
}

enum LossReasonType {
  PREFERRED_SEATING_UNAVAILABLE | WAIT_TOO_LONG | TABLE_NOT_READY
  GROUP_TOO_LARGE | NOT_INTERESTED_IN_MENU | PRICE_CONCERN
  BAD_SERVICE | CHANGED_MIND | WENT_ELSEWHERE | OTHER
}
```

**foodie.bm value:** This funnel data is gold for restaurant partners. You can show them their referral conversion rate by source.

---

## 6. Compensation & Commission Ledger

### Compensation Plans

```prisma
enum CompensationModelType {
  COMMISSION_ONLY
  COMMISSION_PLUS_HOURLY
  HOURLY_ONLY
  FIXED_SALARY
  FIXED_SALARY_PLUS_COMMISSION
  FLAT_PER_SEATED_PARTY          // e.g. $10 per party brought in
  FLAT_PER_SEATED_COVER          // e.g. $3 per person seated
  CUSTOM
}

model CompensationPlan {
  id                String                @id @default(cuid())
  name              String
  appliesToType     String                // "REFERRER" | "INFLUENCER" | etc.
  modelType         CompensationModelType
  commissionPercent Decimal?              // e.g. 10.00 = 10%
  hourlyRateCents   Int?
  fixedSalaryCents  Int?
  flatPerPartyCents Int?
  flatPerCoverCents Int?
  isActive          Boolean               @default(true)

  referrers Referrer[]
}
```

### Commission Lifecycle

```prisma
model CommissionEntry {
  referrerId    String
  reservationId String?
  amountCents   Int
  status        CommissionStatus  // PENDING | APPROVED | REJECTED | PAID
  reason        String?
  covers        Int?
  conceptKey    String?
}

// Auto-suggestion (computed by engine, human approves)
model CommissionSuggestion {
  reservationId        String
  referrerId           String
  compensationPlanId   String?
  suggestedAmountCents Int
  rationaleJson        Json?     // shows calculation breakdown
  status               CommissionSuggestionStatus  // SUGGESTED | APPROVED | REJECTED | CONVERTED_TO_ENTRY
}
```

### Influencer Ledger (Digital Commissions)

```prisma
enum LedgerEntryType {
  COMMISSION_EARNED
  COMMISSION_REVERSED
  COMMISSION_PAID
}

model LedgerEntry {
  influencerId  String
  orderId       String?
  type          LedgerEntryType
  amountCents   Int
  payoutBatchId String?
}

model PayoutBatch {
  status   PayoutBatchStatus  // OPEN | CLOSED
  from     DateTime
  to       DateTime
  entries  LedgerEntry[]
}
```

### Referral Benefit System (Comp Meals / Drinks)

```prisma
enum BenefitType {
  NONE | COMP_DRINK | COMP_MEAL | COMP_DINNER | DISCOUNT | CUSTOM
}

model ReferralBenefit {
  referrerId    String
  reservationId String?
  benefitType   BenefitType
  valueCents    Int?
  notes         String?
}
```

---

## 7. Restaurant Operations Layer

### Reservation Lifecycle State Machine

```
PENDING → CONFIRMED → ACKNOWLEDGED → ARRIVED → SEATED → COMPLETED
                  ↘ WAITLISTED                 ↘ NO_SHOW
                  ↘ CANCELLED
```

### Handoff System (streetside → restaurant host)

```prisma
model ReservationHandoff {
  reservationId     String
  sentByRole        String        // "STREETSIDE_HOST" | "TAXI_DRIVER" etc.
  sentByLabel       String?
  receivedByHostId  String?
  handoffStatus     HandoffStatus // PENDING | ACKNOWLEDGED | GUEST_EN_ROUTE | GUEST_ARRIVED | SEATED | CLOSED
  estimatedArrivalAt DateTime?
  waitTimeMinutes   Int?
}
```

**foodie.bm:** This enables a "hospitality concierge app" where hotel staff can send a guest ahead to a restaurant and the restaurant sees them coming. Huge differentiator vs Degusta.

### Restaurant Host Profile

```prisma
model RestaurantHostProfile {
  userId      String  @unique
  displayName String
  isActive    Boolean @default(true)
  badgeColor  String?   // for floor management UI
  venueId     String?

  reservations Reservation[]  // reservations currently assigned to this host
}
```

### Communication Templates

```prisma
model ReservationCommunication {
  reservationId String
  type          ResCommunicationType  // EMAIL | SMS | INTERNAL | WHATSAPP
  templateKey   String?
  recipient     String?
  subject       String?
  bodySnapshot  String?
  status        ResCommunicationStatus  // PENDING | SENT | FAILED
  sentAt        DateTime?
}
```

### Private Requests / Buyouts

```prisma
model PrivateRequest {
  venueId         String
  guestProfileId  String?
  contactName     String
  contactEmail    String
  partySize       Int
  conceptKey      String?
  occasion        String?
  budgetNotes     String?
  preferredDate   DateTime?
  status          String    @default("pending")
}
```

---

## 8. Events & Ticketing Engine

### Series → Session → Ticket hierarchy

```
Series (the event brand / dining experience concept)
  └── Session (a specific date/time occurrence)
        └── TicketType (GA, VIP, Member-only tiers)
              └── Ticket (individual issued ticket with QR code)
                    └── AttendanceEvent (arrival, seating, departure)
```

### Series (Event / Dining Experience)

```prisma
model Series {
  slug        String   @unique
  title       String
  hostType    SeriesHostType   // OKU | CATCH | INFLUENCER | PARTNER
  status      SeriesStatus     // DRAFT | SCHEDULED | PUBLISHED | SOLD_OUT | COMPLETED | CANCELLED

  // Capacity
  capacityTotal    Int
  capacitySold     Int

  // Visibility & Access
  seriesVisibilityMode     SeriesVisibilityMode  // PUBLIC | PRIVATE_SHELL | PRIVATE_HIDDEN
  membershipRuleMode       MembershipRuleMode    // NONE | MEMBERS_ONLY | MEMBERS_EARLY_ACCESS | MEMBERS_DISCOUNT
  allowInviteOnlyAccess    Boolean
  allowReferrerAccess      Boolean

  // Membership gating
  minMembershipTier        MembershipTier?
  salePriorityMode         SalePriorityMode  // PUBLIC_ONLY | MEMBERS_EARLY_ACCESS | PATRON_THEN_PUBLIC | FOUNDER_FIRST

  // Invitation engine
  inviteAudienceMode       InviteAudienceMode

  // SEO
  seoTitle       String?
  seoDescription String?

  sessions             Session[]
  ticketTypes          TicketType[]
  orders               Order[]
  eventReferrers       EventReferrerAssignment[]
  sponsorshipSlots     SponsorshipSlot[]
}
```

### Order & Payment

```prisma
model Order {
  userId    String
  seriesId  String
  sessionId String
  status    OrderStatus   // PENDING | PAID | FAILED | REFUNDED | CANCELLED

  orderType  OrderType    // TICKET | EXPERIENCE | MEMBERSHIP | DINING | PRIVATE_BOOKING
  channel    OrderChannel // DIRECT | REFERRER | INFLUENCER | PARTNER | ADMIN | QR

  subtotalCents   Int
  totalCents      Int
  commissionCents Int   // portion going to influencer/referrer
  netRevenueCents Int   // what restaurant keeps

  attributedInfluencerId String?
  attributionSource      AttributionSource  // INFLUENCER_HOST | EVENT_REFERRER_QR | EVENT_REFERRER_LINK | DIRECT | COMP_PLAN_REFERRER

  lineItems OrderLineItem[]
  payment   Payment?
  tickets   Ticket[]
}
```

### Check-In System

```prisma
model ExperienceCheckin {
  ticketId      String
  sessionId     String
  checkedInById String
  method        CheckinMethod  // QR | MANUAL | ADMIN_OVERRIDE
}

model CheckInLog {
  ticketId      String?
  scannedCode   String
  valid         Boolean
  result        CheckInResult  // VALID | INVALID | ALREADY_CHECKED_IN | EXPIRED
  scannedByUserId String?
}

model AttendanceEvent {
  ticketId         String @unique
  sessionId        String
  userId           String
  status           AttendanceStatus  // ARRIVED | SEATED | COMPLETED | LEFT_EARLY | NO_SHOW
  arrivalTime      DateTime
  seatedTime       DateTime?
  departureTime    DateTime?
  durationMinutes  Int?
}
```

---

## 9. Membership Tier System

```prisma
enum MembershipTier {
  EXPLORER   // free / entry level
  INSIDER    // paid tier 1
  PATRON     // paid tier 2
  FOUNDER    // invite-only, highest tier
}

enum MembershipStatus {
  ACTIVE | PAUSED | EXPIRED | CANCELLED | PENDING_APPROVAL
}

model Membership {
  userId               String           @unique
  tier                 MembershipTier   @default(PATRON)
  status               MembershipStatus @default(ACTIVE)
  startsAt             DateTime
  renewsAt             DateTime?
  cancelAtPeriodEnd    Boolean          @default(false)
  stripeSubscriptionId String?
  priceAnnualCents     Int?
  benefitsJson         Json?
}

model MembershipPlanConfig {
  tier                 MembershipTier @unique
  displayName          String
  tagline              String?
  priceAnnualCents     Int
  isPubliclyJoinable   Boolean
  isInviteOnly         Boolean
  maxActiveMembers     Int?
  benefitsJson         Json?
}
```

**foodie.bm adaptation:** Rename tiers to `EXPLORER | REGULAR | GOURMET | CONNOISSEUR`. Benefits can include priority reservations, exclusive dining events, partner restaurant discounts.

---

## 10. Influencer & Partner Engine

### Influencer Profile

```prisma
model InfluencerProfile {
  userId            String                   @unique
  handle            String?
  refCode           String                   @unique
  commissionRateBps Int                      @default(1000)  // 1000 = 10%
  approved          Boolean                  @default(false)

  // Public profile
  displayName    String?
  headline       String?
  shortBio       String?
  profileImageUrl String?
  coverImageUrl  String?
  instagramUrl   String?
  tiktokUrl      String?
  youtubeUrl     String?
  websiteUrl     String?
  isPublic       Boolean                  @default(true)
  isVerified     Boolean                  @default(false)
  approvalStatus InfluencerApprovalStatus @default(PENDING)

  series               Series[]   @relation("SeriesHost")    // events they host
  ledgerEntries        LedgerEntry[]                          // earnings
  eventReferrersManaged EventReferrerAssignment[]              // their referrer sub-network
}
```

### Event Referrer Sub-Network (Influencer manages their own referrers)

```prisma
model EventReferrerAssignment {
  parentInfluencerId    String       // the influencer who owns this referrer
  seriesId              String?      // which event/series they're assigned to
  assignedUserId        String?
  displayName           String
  referralCode          String       @unique
  referralUrl           String?
  qrCodeImageUrl        String?
  isCommissionEligible  Boolean      @default(false)
  commissionMode        EventReferrerCommissionMode  // NONE | PERCENT_OF_INFLUENCER_COMMISSION
  commissionShareBps    Int?         // how much of influencer's commission goes to this referrer

  orders              Order[]       // orders attributed to this referrer
  subCommissionLedger InfluencerSubCommissionLedger[]
}
```

---

## 11. Sponsorship Placement Engine

### Slot → Application → Deal → Placement pipeline

```prisma
enum SponsorshipSlotCategory {
  TITLE | BEVERAGE | SPIRITS | CULINARY | LUXURY | WELLNESS | REAL_ESTATE | MEDIA | EXPERIENCE | OTHER
}

enum SponsorPlacementType {
  EMAIL_HEADER | CHECK_IN_SCREEN | EVENT_PAGE | TICKET_PDF | INVITATION
  DIGITAL_MENU | SOCIAL_STORY | SIGNAGE | WELCOME_CARD | BRAND_MOMENT
}

model SponsorshipSlot {
  seriesId    String?
  sessionId   String?
  scopeType   SponsorshipScopeType   // SERIES | EVENT | PRIVATE_DINING | CURATED_TABLE
  title       String
  category    SponsorshipSlotCategory
  benefits    Json?                  // what the sponsor gets
  deliverables Json?                 // what the platform promises to deliver
  isExclusive Boolean @default(true)
  askPriceCents Int?
  status      SponsorshipSlotStatus  // OPEN | FILLED | SUSPENDED
}

model SponsorPlacement {
  dealId        String
  placementType SponsorPlacementType
  assetUrl      String?              // brand logo / banner
  linkUrl       String?
  impressions   Int     @default(0)
  clicks        Int     @default(0)
  isActive      Boolean @default(true)
  activatedAt   DateTime?
  expiresAt     DateTime?
}
```

**foodie.bm:** Beverage brands, food producers, credit cards — all can sponsor discovery pages, email digests, restaurant check-in screens. Same engine, same models, new context.

---

## 12. Hiring & HR System

### Dynamic Form-Based Application System

```prisma
model Opportunity {
  title             String
  slug              String           @unique
  engagementType    EngagementType   // FULL_TIME | PART_TIME | SEASONAL | CONTRACT | FREELANCE | TALENT | INTERN
  employmentCategory EmploymentCategory // EMPLOYEE | INDEPENDENT_CONTRACTOR | CONSULTANT | PERFORMER | AGENCY | VENDOR
  compensationType  CompensationType  // SALARY | HOURLY | PER_SHIFT | PER_PROJECT | RETAINER | NEGOTIABLE
  compensationMin   Int?
  compensationMax   Int?
  status            OpportunityStatus // DRAFT | PUBLISHED | PAUSED | CLOSED | ARCHIVED
  visibility        OpportunityVisibility // PUBLIC | INVITE_ONLY | INTERNAL_ONLY

  formTemplateId    String           // which form captures the application
  applicationPipelineId String?      // which pipeline processes it
}

model FormTemplate {
  schemaJson     Json    // JSON Schema (field definitions)
  uiSchemaJson   Json?   // display configuration
  validationJson Json?   // validation rules
}

model ApplicationSubmission {
  status               ApplicationStatus  // SUBMITTED | UNDER_REVIEW | HR_SCREEN | MANAGER_REVIEW | INTERVIEW_SCHEDULED | TRIAL_SHIFT | OFFER_PENDING | HIRED | REJECTED
  submissionDataJson   Json               // all applicant answers
  normalizedSnapshotJson Json?            // processed/extracted fields

  documents        ApplicationDocument[]
  workflowEvents   ApplicationWorkflowEvent[]
  stageTransitions ApplicationStageTransition[]
}
```

**foodie.bm:** Use for restaurant staff hiring on behalf of partner restaurants. Platform takes a placement fee.

---

## 13. Notifications & Communications

```prisma
model Notification {
  userId    String
  title     String
  body      String?
  href      String?     // deep link
  readAt    DateTime?
}

model ReservationCommunication {
  reservationId String
  type          ResCommunicationType  // EMAIL | SMS | INTERNAL | WHATSAPP
  templateKey   String?
  recipient     String?
  status        ResCommunicationStatus
  sentAt        DateTime?
}
```

### Email via Resend

```typescript
// Pattern used in OKU — port directly
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: "noreply@foodie.bm",
  to: guest.email,
  subject: `Reservation Confirmed at ${venue.name}`,
  react: <ReservationConfirmationEmail reservation={reservation} venue={venue} />,
});
```

---

## 14. Multilingual / i18n System

### Translation Hook

```typescript
// Usage:
const t = useTranslation();
t("common", "button.confirm")    // → "Confirm"
t("reservation", "status.seated") // → "Seated"

// Locale files: /public/locales/[en|es|pt]/[namespace].json
```

### Locale Structure

```
/public/locales/
  en/
    common.json
    reservation.json
    referrer.json
    membership.json
  es/
    common.json
    reservation.json
    ...
  pt/
    ...
```

**foodie.bm:** Add `fr` (French) for Martinique/Guadeloupe reach. Add `zh` for Asian market expansion.

---

## 15. Admin Suite Architecture

### Route Structure

```
/admin
  /admin/dashboard             → Overview tiles (revenue, reservations, referrers)
  /admin/reservations          → Live reservations board
  /admin/referrers             → Referrer CRM + compensation ledger
  /admin/compensation          → Commission dashboard (4 tiles: referrers / entries / pending / plans)
  /admin/users                 → User registry + role management
  /admin/influencers           → Influencer profiles + approval
  /admin/series                → Event/experience management
  /admin/orders                → Order registry
  /admin/memberships           → Membership management
  /admin/hr                    → Hiring pipeline
  /admin/ir                    → Investor relations documents
  /admin/sponsorship           → Sponsor slots + deals
  /admin/analytics             → Revenue + attribution analytics
  /admin/sop                   → Standard Operating Procedures
```

### Role-Based Route Guards (Middleware)

```typescript
const ROUTE_PERMISSIONS: Record<string, PermissionKey> = {
  "/admin/compensation":  "admin:compensation:read",
  "/admin/hr":            "hr:read",
  "/admin/ir":            "ir:read",
  "/admin/users":         "admin:audit:read",
};
```

---

## 16. foodie.bm Adaptation Guide

### What Maps Directly (Zero Re-work)

| OKU Module | foodie.bm Usage |
|---|---|
| `Referrer` + `CompensationPlan` | Hotel concierges, taxi drivers, tour operators earning per seated cover |
| `ReferralActor` + `ReferralLink` | QR codes for ambassadors distributed across the island |
| `ReservationAttribution` + `ConversionStage` | Funnel analytics per restaurant per referral source |
| `CommissionEntry` + `CommissionSuggestion` | Auto-suggested payouts, human approval workflow |
| `ResGuestProfile` | Cross-restaurant guest CRM (knows their dietary prefs everywhere) |
| `ReservationHandoff` | Hotel sends guest to restaurant, host sees them coming |
| `InfluencerProfile` | Food creator profiles with public pages and referral codes |
| `LedgerEntry` + `PayoutBatch` | Creator earnings + monthly payouts |
| `SponsorshipSlot` + `SponsorPlacement` | Brand integration on discovery pages, emails, check-in screens |
| `Notification` | Real-time updates to diners and referrers |
| Resend email integration | Reservation confirmations, waitlist notifications |
| `FormTemplate` + `ApplicationSubmission` | Restaurant onboarding applications to join foodie.bm |

### What Needs Adaptation

| OKU Concept | foodie.bm Change |
|---|---|
| `VenueKey` enum (OKU/CATCH) | Replace with `restaurantId String` — multi-tenant |
| `Series` (single-brand events) | Expand to cross-restaurant events and dining experiences |
| `MembershipTier` names | Rename: EXPLORER → REGULAR → GOURMET → CONNOISSEUR |
| `RoleKey` enum | Add RESTAURANT_OWNER, FOOD_CREATOR, DINER, CONCIERGE |
| `ReservationSource` | Add FOODIE_APP, GOOGLE_RESERVE, INSTAGRAM_LINK |
| Payment (Authorize.Net) | Replace with Stripe (global, better developer experience) |

### New Models for foodie.bm

```prisma
// Multi-restaurant discovery
model Restaurant {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  cuisineTypes    String[]
  priceRange      PriceRange  // BUDGET | MID | UPSCALE | LUXURY
  city            String
  country         String
  geoLat          Float?
  geoLng          Float?
  googleMapsUrl   String?
  openingHoursJson Json?
  photoGallery    Json?
  featuredDishes  Json?
  averageRating   Decimal?
  reviewCount     Int    @default(0)

  // Linked to existing Venue model
  venueId         String? @unique
}

// Review system
model RestaurantReview {
  id             String   @id @default(cuid())
  restaurantId   String
  authorUserId   String
  rating         Int      // 1-5
  body           String?
  visitDate      DateTime?
  isVerified     Boolean  @default(false)  // verified diner
  dishPhotos     Json?
  createdAt      DateTime @default(now())
}

// Foodie passport (cross-restaurant loyalty)
model FoodiePassport {
  userId         String   @unique
  restaurantsVisited Int  @default(0)
  stampsJson     Json?    // per-restaurant stamps
  tier           String   @default("EXPLORER")
}

// Restaurant partnership agreement
model RestaurantPartnership {
  restaurantId   String   @unique
  commissionRateBps Int   // what foodie.bm earns per reservation
  onboardedAt    DateTime
  contractUrl    String?
  isActive       Boolean  @default(true)
}
```

---

## 17. Recommended First Build Sequence

Build foodie.bm in this order to get to a working platform fastest:

### Phase 1 — Foundation (Weeks 1–3)
1. ✅ Set up Next.js App Router + Prisma + PostgreSQL
2. ✅ Copy User/Role/UserRole/UserProfile models exactly
3. ✅ Set up NextAuth with credentials strategy (copy OKU auth.ts pattern)
4. ✅ Implement RBAC middleware (copy OKU permissions.ts + middleware.ts)
5. ✅ Create Restaurant model (extends Venue model pattern)
6. ✅ Seed demo restaurants and users

### Phase 2 — Reservation Core (Weeks 4–6)
7. ✅ Port Reservation system models verbatim (Reservation, Zone, ResGuestProfile, etc.)
8. ✅ Build restaurant reservation booking flow (public-facing)
9. ✅ Build restaurant host dashboard (live reservations board)
10. ✅ Build reservation confirmation emails (Resend integration)

### Phase 3 — Referrer Network (Weeks 7–9)
11. ✅ Port Referrer + CompensationPlan + CommissionEntry models
12. ✅ Port ReferralActor + ReferralLink models
13. ✅ Build concierge/ambassador QR code system
14. ✅ Build ReservationAttribution + handoff flow
15. ✅ Build commission review admin panel

### Phase 4 — Discovery & Creators (Weeks 10–13)
16. ✅ Build public restaurant discovery pages (like Degusta)
17. ✅ Port InfluencerProfile → FoodCreatorProfile
18. ✅ Build creator public pages + referral tracking
19. ✅ Port LedgerEntry + PayoutBatch for creator earnings
20. ✅ Build review system (RestaurantReview model)

### Phase 5 — Membership & Monetization (Weeks 14–17)
21. ✅ Port Membership + MembershipPlanConfig models
22. ✅ Integrate Stripe for membership subscriptions
23. ✅ Port SponsorshipSlot + SponsorPlacement engine
24. ✅ Build restaurant partner onboarding (FormTemplate system)

### Phase 6 — Analytics & Growth (Weeks 18–20)
25. ✅ Port ExperienceAnalyticsDaily → RestaurantAnalyticsDaily
26. ✅ Build referral funnel analytics (ConversionStage reports)
27. ✅ Build restaurant partner dashboard (revenue, covers, referrals)
28. ✅ Multi-language: EN + ES + PT

---

## Appendix: Key Files to Copy from OKU

| File | What it provides |
|---|---|
| `src/lib/auth.ts` | NextAuth config, JWT strategy, session types |
| `src/lib/permissions.ts` | Role-permission matrix |
| `src/lib/rbac.ts` | Permission guard helper |
| `src/middleware.ts` | Route-level RBAC enforcement |
| `src/lib/prisma.ts` | Singleton Prisma client |
| `src/lib/object-storage.ts` | File upload helpers |
| `src/components/admin/profiles/ProfileDrawer.tsx` | Admin user profile panel pattern |
| `src/components/compensation/CompensationDashboard.tsx` | Commission management UI |
| `prisma/schema.prisma` | Full data model (adapt as above) |
| `prisma/seed.ts` | Demo data population patterns |

---

*Exported from OKU Hospitality Group Platform — April 2026*
*For internal use in foodie.bm architecture planning only.*
