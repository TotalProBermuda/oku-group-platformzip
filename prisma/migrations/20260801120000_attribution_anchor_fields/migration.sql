-- Migration: AttributionSession — add AnchorStatus enum and anchor tracking fields
--
-- Adds:
--   1. AnchorStatus enum: ANCHORED | PENDING_ATTRIBUTION | FAILED_REVIEW
--   2. Five columns on AttributionSession for anchor lifecycle tracking
--   3. One column for proof-chain context (referralLinkId)
--   4. Two new indexes
--
-- All new columns default-safe for existing rows:
--   anchorStatus     → ANCHORED   (all existing sessions were fully attributed)
--   anchorRetryCount → 0
--   others           → NULL

-- Step 1: Create the new enum type
CREATE TYPE "AnchorStatus" AS ENUM ('ANCHORED', 'PENDING_ATTRIBUTION', 'FAILED_REVIEW');

-- Step 2: Add anchor tracking columns to AttributionSession
ALTER TABLE "AttributionSession"
  ADD COLUMN "referralLinkId"    TEXT,
  ADD COLUMN "anchorStatus"      "AnchorStatus" NOT NULL DEFAULT 'ANCHORED',
  ADD COLUMN "anchorRetryCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "anchorLastError"   TEXT,
  ADD COLUMN "anchorLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "anchorResolvedAt"  TIMESTAMP(3);

-- Step 3: Add indexes for the new fields
CREATE INDEX "AttributionSession_anchorStatus_idx" ON "AttributionSession"("anchorStatus");
CREATE INDEX "AttributionSession_referralLinkId_idx" ON "AttributionSession"("referralLinkId");

-- Step 4: Unique constraint on CommissionSuggestion(reservationId, referrerId)
-- Prevents duplicate suggestions when anchor retry jobs race with each other.
ALTER TABLE "CommissionSuggestion"
  ADD CONSTRAINT "CommissionSuggestion_reservationId_referrerId_key"
  UNIQUE ("reservationId", "referrerId");

-- Step 5: Partial unique index on ReservationAttribution(reservationId, referrerId)
-- WHERE referrerId IS NOT NULL — prevents duplicate attributions for the same
-- (reservation, referrer) pair while allowing null-referrer rows (direct bookings).
CREATE UNIQUE INDEX "ReservationAttribution_reservationId_referrerId_key"
  ON "ReservationAttribution"("reservationId", "referrerId")
  WHERE "referrerId" IS NOT NULL;
