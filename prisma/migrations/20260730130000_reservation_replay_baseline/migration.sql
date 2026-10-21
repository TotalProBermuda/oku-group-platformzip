-- Restore the Reservation prerequisites that were created in production by
-- historical schema pushes but never recorded in the committed migration
-- chain. This migration is intentionally additive and idempotent: production
-- already has this table and enum types, while a clean replay needs them before
-- the ledger/payment migrations add foreign keys. Do not remove or replace
-- existing reservation data.

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
  "contactEmailNormalized" TEXT,
  "customerLocale" TEXT NOT NULL DEFAULT 'en',
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
  "requestedSpaceId" TEXT,
  "assignedSpaceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Reservation_confirmationCode_key"
  ON "Reservation"("confirmationCode");
CREATE INDEX IF NOT EXISTS "Reservation_venueId_reservationDate_idx"
  ON "Reservation"("venueId", "reservationDate");
CREATE INDEX IF NOT EXISTS "Reservation_contactEmailNormalized_reservationDate_idx"
  ON "Reservation"("contactEmailNormalized", "reservationDate");
CREATE INDEX IF NOT EXISTS "Reservation_zoneId_reservationDate_idx"
  ON "Reservation"("zoneId", "reservationDate");
CREATE INDEX IF NOT EXISTS "Reservation_status_idx" ON "Reservation"("status");
CREATE INDEX IF NOT EXISTS "Reservation_contactEmail_idx" ON "Reservation"("contactEmail");
CREATE INDEX IF NOT EXISTS "Reservation_requestedSpaceId_idx"
  ON "Reservation"("requestedSpaceId");
CREATE INDEX IF NOT EXISTS "Reservation_assignedSpaceId_idx"
  ON "Reservation"("assignedSpaceId");


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
