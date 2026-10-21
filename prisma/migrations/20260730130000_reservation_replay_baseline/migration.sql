-- The original user/admin-audit enum was present in schema-pushed production
-- but missing from clean migration history. Include current labels so later
-- migrations can safely add their labels with IF NOT EXISTS.
DO $$ BEGIN
  CREATE TYPE "UserAdminAction" AS ENUM (
    'USER_CREATED', 'USER_UPDATED', 'USER_SUSPENDED', 'USER_UNSUSPENDED',
    'USER_LOCKED', 'USER_UNLOCKED', 'USER_ARCHIVED', 'USER_UNARCHIVED',
    'USER_BANNED', 'PASSWORD_RESET_TRIGGERED', 'ROLE_ASSIGNED', 'ROLE_REMOVED',
    'FORCE_LOGOUT', 'EMAIL_CHANGED', 'NOTES_UPDATED', 'STATUS_CHANGED',
    'SEAT_INVITED', 'SEAT_REINVITED', 'SEAT_ACCEPTED', 'SEAT_REVOKED',
    'SEAT_REMOVED', 'SEAT_COMMISSION_UPDATED', 'REFERRER_COMMISSION_PROGRAM_UPDATED',
    'PARTNER_SUPPORT_VIEWED', 'PARTNER_COMMERCE_INVITED', 'PARTNER_CHANNEL_ACTIVATED',
    'PARTNER_CHANNEL_PAUSED', 'PARTNER_CHANNEL_ROTATED', 'PARTNER_SELLER_CHANNEL_ACTIVATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Restore the Reservation prerequisites that were created in production by
-- historical schema pushes but never recorded in the committed migration
-- chain. This migration is intentionally additive and idempotent: production
-- already has this table and enum types, while a clean replay needs them before
-- the ledger/payment migrations add foreign keys. Do not remove or replace
-- existing reservation data.

-- Restore the payment provider label omitted from clean migration history.
-- Production already has it; ADD VALUE IF NOT EXISTS is a no-op there.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'CYBERSOURCE';

-- The payment-foundation migration adds RESERVATION_DEPOSIT to this type,
-- but clean migration history did not include its pre-existing schema-push type.
DO $$ BEGIN
  CREATE TYPE "OrderType" AS ENUM (
    'TICKET', 'EXPERIENCE', 'MEMBERSHIP', 'DINING', 'PRIVATE_BOOKING',
    'EVENT', 'OTHER', 'RESERVATION_DEPOSIT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Restore schema-push-era dining location tables before migrations add their FKs.
DO $$ BEGIN
  CREATE TYPE "CommissionValidationMode" AS ENUM ('ON_SEATED', 'ON_COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ServiceChargePolicy" AS ENUM ('ABSENT', 'INCLUDED_UNKNOWN', 'EXCLUDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ZoneType" AS ENUM ('FINE_DINING', 'NIGHTLIFE', 'TERRACE', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Venue" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "addressLine" TEXT,
  "city" TEXT,
  "country" TEXT,
  "description" TEXT,
  "commissionValidationMode" "CommissionValidationMode" NOT NULL DEFAULT 'ON_SEATED',
  "serviceChargePolicy" "ServiceChargePolicy" NOT NULL DEFAULT 'ABSENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Venue_slug_key" ON "Venue" ("slug");

CREATE TABLE IF NOT EXISTS "Zone" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "zoneType" "ZoneType" NOT NULL,
  "conceptKey" TEXT NOT NULL,
  "description" TEXT,
  "capacityCovers" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isBookable" BOOLEAN NOT NULL DEFAULT true,
  "currentWaitMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Zone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Zone_venueId_fkey" FOREIGN KEY ("venueId")
    REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Zone_venueId_slug_key" ON "Zone" ("venueId", "slug");
CREATE INDEX IF NOT EXISTS "Zone_conceptKey_idx" ON "Zone" ("conceptKey");

CREATE TABLE IF NOT EXISTS "VenueTable" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "minPartySize" INTEGER NOT NULL,
  "maxPartySize" INTEGER NOT NULL,
  "seats" INTEGER NOT NULL,
  "mergeable" BOOLEAN NOT NULL DEFAULT false,
  "isVip" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "positionX" DOUBLE PRECISION,
  "positionY" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VenueTable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VenueTable_zoneId_fkey" FOREIGN KEY ("zoneId")
    REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VenueTable_zoneId_idx" ON "VenueTable" ("zoneId");

DO $$ BEGIN
  CREATE TYPE "ReservationStatus" AS ENUM (
    'PENDING', 'CONFIRMED', 'WAITLISTED', 'ACKNOWLEDGED', 'ARRIVED',
    'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'REQUEST_ONLY',
    'PENDING_APPROVAL', 'PENDING_PAYMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReservationSource" AS ENUM (
    'UMBRELLA_SITE', 'OKU_SITE', 'CATCH_SITE', 'TERRACE_SITE',
    'STREETSIDE_HOST', 'TAXI_DRIVER', 'TOUR_GUIDE', 'HOTEL_CONCIERGE',
    'ADMIN', 'WALK_IN', 'QR_CODE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReservationAddonType" AS ENUM (
    'CORKAGE', 'CELEBRATION_DESSERT', 'CAKE_FEE', 'BOTTLE_SERVICE',
    'ROMANTIC_SETUP', 'ACCESSIBILITY', 'DIETARY_NOTE', 'SPECIAL_REQUEST'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Reservation" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "zoneId" TEXT,
  "guestProfileId" TEXT,
  "source" "ReservationSource" NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "reservationDate" TIMESTAMP(3) NOT NULL,
  "partySize" INTEGER NOT NULL,
  "durationMinutes" INTEGER,
  "conceptRequested" TEXT,
  "occasion" TEXT,
  "seatingPreference" TEXT,
  "notes" TEXT,
  "dietaryRestrictions" TEXT,
  "specialRequests" TEXT,
  "bringOwnBottle" BOOLEAN NOT NULL DEFAULT false,
  "corkageBottleCount" INTEGER,
  "corkageFeeCents" INTEGER,
  "celebrationDessert" BOOLEAN NOT NULL DEFAULT false,
  "celebrationMessage" TEXT,
  "contactName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT,
  "contactWhatsapp" TEXT,
  "confirmationCode" TEXT NOT NULL,
  "sourceContext" TEXT,
  "estimatedRevenueCents" INTEGER,
  "actualRevenueCents" INTEGER,
  "assignedTableLabel" TEXT,
  "assignedRestaurantHostId" TEXT,
  "commissionEligible" BOOLEAN NOT NULL DEFAULT false,
  "commissionValidatedAt" TIMESTAMP(3),
  "arrivalConfirmedAt" TIMESTAMP(3),
  "arrivedHeadcount" INTEGER,
  "seatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Reservation_confirmationCode_key"
  ON "Reservation"("confirmationCode");
CREATE INDEX IF NOT EXISTS "Reservation_venueId_reservationDate_idx"
  ON "Reservation"("venueId", "reservationDate");
CREATE INDEX IF NOT EXISTS "Reservation_zoneId_reservationDate_idx"
  ON "Reservation"("zoneId", "reservationDate");
CREATE INDEX IF NOT EXISTS "Reservation_status_idx" ON "Reservation"("status");
CREATE INDEX IF NOT EXISTS "Reservation_contactEmail_idx" ON "Reservation"("contactEmail");


-- CommissionAllocation is also a schema-push-era table. The later rule-engine
-- migration extends these types and adds trace columns with IF NOT EXISTS; the
-- complete current type/table shape here makes clean replay deterministic.
DO $$ BEGIN
  CREATE TYPE "EarnerType" AS ENUM ('REFERRER', 'HOST', 'PARTNER', 'INFLUENCER', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionAllocationStatus" AS ENUM (
    'PENDING', 'APPROVED', 'PAID', 'DISPUTED', 'REVERSED',
    'PROCESSING', 'HELD_FOR_REVIEW', 'HELD_FOR_BENEFICIARY_MAPPING'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionRevenueBasis" AS ENUM (
    'COMMISSIONABLE_CENTS', 'GROSS_MINUS_TAX',
    'GROSS_MINUS_TAX_MINUS_TIP',
    'GROSS_MINUS_TAX_MINUS_DISCOUNT_REFUND_TIP', 'MANUAL_REVIEW'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CommissionAllocation" (
  "id" TEXT NOT NULL,
  "tableSessionId" TEXT NOT NULL,
  "earnerType" "EarnerType" NOT NULL,
  "earnerRefId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" "CommissionAllocationStatus" NOT NULL DEFAULT 'PENDING',
  "commissionRuleSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "grossCentsSnapshot" INTEGER,
  "taxCentsSnapshot" INTEGER,
  "tipCentsSnapshot" INTEGER,
  "discountCentsSnapshot" INTEGER,
  "refundCentsSnapshot" INTEGER,
  "eligibleNetRevenueCents" INTEGER,
  "guestCount" INTEGER,
  "percentageComponentCents" INTEGER,
  "percentageCapAppliedCents" INTEGER,
  "perPersonComponentCents" INTEGER,
  "maxTakeRateCapCents" INTEGER,
  "finalCommissionCents" INTEGER,
  "revenueBasis" "CommissionRevenueBasis",
  "ruleVersionId" TEXT,
  "sourceCheckId" TEXT,
  "confidenceClass" TEXT,
  "parentAllocationId" TEXT,
  CONSTRAINT "CommissionAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CommissionAllocation_tableSessionId_idx"
  ON "CommissionAllocation" ("tableSessionId");
CREATE INDEX IF NOT EXISTS "CommissionAllocation_parentAllocationId_idx"
  ON "CommissionAllocation" ("parentAllocationId");
CREATE INDEX IF NOT EXISTS "CommissionAllocation_earnerType_earnerRefId_idx"
  ON "CommissionAllocation" ("earnerType", "earnerRefId");
CREATE INDEX IF NOT EXISTS "CommissionAllocation_status_idx"
  ON "CommissionAllocation" ("status");
CREATE INDEX IF NOT EXISTS "CommissionAllocation_ruleVersionId_idx"
  ON "CommissionAllocation" ("ruleVersionId");
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionAllocation_live_earner_unique"
  ON "CommissionAllocation" ("tableSessionId", "earnerType", "earnerRefId")
  WHERE "status" != 'REVERSED'::"CommissionAllocationStatus";
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionAllocation_one_reversal_per_original"
  ON "CommissionAllocation" ("parentAllocationId")
  WHERE "parentAllocationId" IS NOT NULL AND "status" = 'REVERSED'::"CommissionAllocationStatus";

-- CommissionSuggestion was also created by historical schema pushes without
-- a committed create-table migration. Keep the baseline additive for existing
-- deployments; the following attribution migration adds the unique pair key.
DO $$ BEGIN
  CREATE TYPE "CommissionSuggestionStatus" AS ENUM (
    'SUGGESTED', 'APPROVED', 'REJECTED', 'CONVERTED_TO_ENTRY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CommissionSuggestion" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "compensationPlanId" TEXT,
  "suggestedAmountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "rationaleJson" JSONB,
  "status" "CommissionSuggestionStatus" NOT NULL DEFAULT 'SUGGESTED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CommissionSuggestion_referrerId_status_idx"
  ON "CommissionSuggestion" ("referrerId", "status");
CREATE INDEX IF NOT EXISTS "CommissionSuggestion_reservationId_idx"
  ON "CommissionSuggestion" ("reservationId");

-- These attribution enums were also introduced through schema pushes, so
-- make their canonical Prisma values available before creating the attribution table.
DO $$ BEGIN
  CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ConversionStage" AS ENUM (
    'INITIATED', 'REFERRED_UPSTAIRS', 'ARRIVED', 'OFFERED', 'PATRONIZED', 'DECLINED', 'LOST'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "LossReasonType" AS ENUM (
    'PREFERRED_SEATING_UNAVAILABLE', 'TERRACE_UNAVAILABLE', 'WAIT_TOO_LONG',
    'TABLE_NOT_READY', 'GROUP_TOO_LARGE', 'NOT_ENOUGH_SEATS', 'NOT_INTERESTED_IN_MENU',
    'PRICE_CONCERN', 'BAD_SERVICE', 'ELEVATOR_NOT_WORKING', 'CHANGED_MIND',
    'WENT_ELSEWHERE', 'NO_RESPONSE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Restore the referrer and compensation-plan models that were created by
-- schema pushes but never entered into migration history.
DO $$ BEGIN
  CREATE TYPE "ReferrerType" AS ENUM (
    'STREETSIDE_HOST', 'TAXI_DRIVER', 'TOUR_GUIDE', 'HOTEL_CONCIERGE', 'PARTNER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "CompensationModelType" AS ENUM (
    'COMMISSION_ONLY', 'COMMISSION_PLUS_HOURLY', 'HOURLY_ONLY', 'FIXED_SALARY',
    'FIXED_SALARY_PLUS_COMMISSION', 'FLAT_PER_SEATED_PARTY',
    'FLAT_PER_SEATED_COVER', 'CUSTOM'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CompensationPlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "appliesToType" TEXT NOT NULL,
  "modelType" "CompensationModelType" NOT NULL,
  "commissionPercent" DECIMAL(6,2),
  "hourlyRateCents" INTEGER,
  "fixedSalaryCents" INTEGER,
  "flatPerPartyCents" INTEGER,
  "flatPerCoverCents" INTEGER,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompensationPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Referrer" (
  "id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "referrerType" "ReferrerType" NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "whatsapp" TEXT,
  "organizationName" TEXT,
  "referralCode" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "userId" TEXT,
  "compensationPlanId" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Referrer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Referrer_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Referrer_compensationPlanId_fkey" FOREIGN KEY ("compensationPlanId")
    REFERENCES "CompensationPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Referrer_referralCode_key" ON "Referrer" ("referralCode");
CREATE UNIQUE INDEX IF NOT EXISTS "Referrer_userId_key" ON "Referrer" ("userId");
CREATE INDEX IF NOT EXISTS "Referrer_referralCode_idx" ON "Referrer" ("referralCode");
CREATE INDEX IF NOT EXISTS "Referrer_referrerType_idx" ON "Referrer" ("referrerType");

-- ReservationAttribution was also provisioned outside the migration chain.
-- Recreate the Prisma model on a clean database before the anchor-field
-- migration adds its partial unique index. Existing production rows are kept.
CREATE TABLE IF NOT EXISTS "ReservationAttribution" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "referrerId" TEXT,
  "sourceType" "ReservationSource" NOT NULL,
  "sourceLabel" TEXT,
  "commissionEligible" BOOLEAN NOT NULL DEFAULT false,
  "commissionStatus" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
  "coversAttributed" INTEGER,
  "conversionStage" "ConversionStage" NOT NULL DEFAULT 'INITIATED',
  "lossReason" "LossReasonType",
  "lossReasonNotes" TEXT,
  "patronizedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservationAttribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReservationAttribution_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReservationAttribution_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ReservationAttribution_reservationId_idx"
  ON "ReservationAttribution" ("reservationId");
CREATE INDEX IF NOT EXISTS "ReservationAttribution_referrerId_idx"
  ON "ReservationAttribution" ("referrerId");
CREATE INDEX IF NOT EXISTS "ReservationAttribution_conversionStage_idx"
  ON "ReservationAttribution" ("conversionStage");

-- Restore the schema-push-era referral actor foundation before the commission
-- migrations alter it. Existing production tables and rows are left untouched.
DO $$ BEGIN
  CREATE TYPE "ReferralActorType" AS ENUM (
    'STREETSIDE_HOST', 'TAXI_DRIVER', 'UBER_DRIVER', 'TOUR_GUIDE',
    'HOTEL_CONCIERGE', 'INFLUENCER_SUB_REFERRER', 'PROMOTER',
    'PRIVATE_NETWORK', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ReferralActorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ReferralCompensationMode" AS ENUM (
    'NONE', 'PERCENT_OF_TRANSACTION', 'PERCENT_OF_PARENT_COMMISSION',
    'FLAT_PER_COVER', 'FLAT_PER_PARTY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ReferralActorTypeDef" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
  "legacyEnumValue" "ReferralActorType" NOT NULL,
  "defaultCompMode" "ReferralCompensationMode" NOT NULL DEFAULT 'PERCENT_OF_TRANSACTION',
  "defaultRateBps" INTEGER,
  "defaultFlatCents" INTEGER,
  "defaultRbacRole" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT,
  CONSTRAINT "ReferralActorTypeDef_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralActorTypeDef_code_key"
  ON "ReferralActorTypeDef" ("code");
CREATE INDEX IF NOT EXISTS "ReferralActorTypeDef_isActive_sortOrder_idx"
  ON "ReferralActorTypeDef" ("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "ReferralActor" (
  "id" TEXT NOT NULL,
  "actorType" "ReferralActorType" NOT NULL,
  "actorTypeCode" TEXT,
  "displayName" TEXT NOT NULL,
  "organizationName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "whatsapp" TEXT,
  "status" "ReferralActorStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadataJson" JSONB,
  "userId" TEXT,
  "legacyReferrerId" TEXT,
  "legacyEventReferrerAssignmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralActor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralActor_userId_key"
  ON "ReferralActor" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralActor_legacyReferrerId_key"
  ON "ReferralActor" ("legacyReferrerId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralActor_legacyEventReferrerAssignmentId_key"
  ON "ReferralActor" ("legacyEventReferrerAssignmentId");
CREATE INDEX IF NOT EXISTS "ReferralActor_actorType_status_idx"
  ON "ReferralActor" ("actorType", "status");
CREATE INDEX IF NOT EXISTS "ReferralActor_userId_idx"
  ON "ReferralActor" ("userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferralActor_actorTypeCode_fkey') THEN
    ALTER TABLE "ReferralActor" ADD CONSTRAINT "ReferralActor_actorTypeCode_fkey"
      FOREIGN KEY ("actorTypeCode") REFERENCES "ReferralActorTypeDef"("code")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF to_regclass('"User"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferralActor_userId_fkey') THEN
    ALTER TABLE "ReferralActor" ADD CONSTRAINT "ReferralActor_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF to_regclass('"Referrer"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferralActor_legacyReferrerId_fkey') THEN
    ALTER TABLE "ReferralActor" ADD CONSTRAINT "ReferralActor_legacyReferrerId_fkey"
      FOREIGN KEY ("legacyReferrerId") REFERENCES "Referrer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF to_regclass('"EventReferrerAssignment"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferralActor_legacyEventReferrerAssignmentId_fkey') THEN
    ALTER TABLE "ReferralActor" ADD CONSTRAINT "ReferralActor_legacyEventReferrerAssignmentId_fkey"
      FOREIGN KEY ("legacyEventReferrerAssignmentId") REFERENCES "EventReferrerAssignment"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Restore the application settings singleton omitted from committed history.
-- The service-window and public-content columns are intentionally left for
-- their later migrations, which add them in order.
DO $$ BEGIN
  CREATE TYPE "StoreStatus" AS ENUM ('OPEN', 'CLOSED', 'TEST_MODE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "DebugMode" AS ENUM ('OFF', 'ERRORS_ONLY', 'VERBOSE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ActiveCheckoutGateway" AS ENUM ('AUTHORIZE_NET', 'CYBERSOURCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CommerceSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "businessName" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "countryRegion" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "timezone" TEXT NOT NULL DEFAULT 'America/Panama',
  "storeStatus" "StoreStatus" NOT NULL DEFAULT 'OPEN',
  "capacityManagementEnabled" BOOLEAN NOT NULL DEFAULT true,
  "holdMinutes" INTEGER NOT NULL DEFAULT 15,
  "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
  "soldOutThreshold" INTEGER NOT NULL DEFAULT 0,
  "stockNotificationEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "hideSoldOutTicketTypes" BOOLEAN NOT NULL DEFAULT false,
  "allowGuestCheckout" BOOLEAN NOT NULL DEFAULT true,
  "requireAccountForMemberships" BOOLEAN NOT NULL DEFAULT true,
  "continueShoppingDestination" TEXT NOT NULL DEFAULT '/series',
  "emptyCartText" TEXT,
  "checkoutSupportEmail" TEXT,
  "cancellationPolicyText" TEXT,
  "senderName" TEXT,
  "adminNotificationEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "debugMode" "DebugMode" NOT NULL DEFAULT 'OFF',
  "activeCheckoutGateway" "ActiveCheckoutGateway" NOT NULL DEFAULT 'AUTHORIZE_NET',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommerceSettings_pkey" PRIMARY KEY ("id")
);
