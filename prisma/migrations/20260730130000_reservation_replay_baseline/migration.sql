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
