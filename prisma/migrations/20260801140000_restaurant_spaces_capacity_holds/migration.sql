-- Migration: Task #181 — RestaurantSpace and CapacityHold
--
-- Adds:
--   1. CapacityHoldStatus enum
--   2. RestaurantSpace table (per-venue dining spaces with capacity)
--   3. CapacityHold table (overlap-aware covers tracking)
--   4. requestedSpaceId / assignedSpaceId FK columns on Reservation
--   5. FK constraint + index for LedgerEvent.capacityHoldId → CapacityHold
--      (the TEXT column itself was added in migration 20260731120000_add_ledger_event_proofpay
--       as a placeholder; this migration promotes it to a real FK)
--
-- All new Reservation columns are nullable — fully default-safe for existing rows.

-- Step 1: Create CapacityHoldStatus enum
CREATE TYPE "CapacityHoldStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'OVERRIDDEN', 'CANCELLED');

-- Step 2: Create RestaurantSpace table
CREATE TABLE "RestaurantSpace" (
  "id"                TEXT         NOT NULL,
  "venueId"           TEXT         NOT NULL,
  "name"              TEXT         NOT NULL,
  "capacity"          INTEGER      NOT NULL,
  "reservable"        BOOLEAN      NOT NULL DEFAULT true,
  "requiresApproval"  BOOLEAN      NOT NULL DEFAULT false,
  "weatherSensitive"  BOOLEAN      NOT NULL DEFAULT false,
  "sortOrder"         INTEGER      NOT NULL DEFAULT 0,
  "isActive"          BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RestaurantSpace_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one space name per venue
ALTER TABLE "RestaurantSpace"
  ADD CONSTRAINT "RestaurantSpace_venueId_name_key" UNIQUE ("venueId", "name");

-- FK: RestaurantSpace → Venue
ALTER TABLE "RestaurantSpace"
  ADD CONSTRAINT "RestaurantSpace_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index for venue-scoped lookups
CREATE INDEX "RestaurantSpace_venueId_idx" ON "RestaurantSpace"("venueId");

-- Step 3: Create CapacityHold table
CREATE TABLE "CapacityHold" (
  "id"            TEXT                  NOT NULL,
  "spaceId"       TEXT                  NOT NULL,
  "reservationId" TEXT                  NOT NULL,
  "startAt"       TIMESTAMP(3)          NOT NULL,
  "endAt"         TIMESTAMP(3)          NOT NULL,
  "partySize"     INTEGER               NOT NULL,
  "status"        "CapacityHoldStatus"  NOT NULL DEFAULT 'ACTIVE',
  "expiresAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CapacityHold_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one hold per (space, reservation) pair
ALTER TABLE "CapacityHold"
  ADD CONSTRAINT "CapacityHold_spaceId_reservationId_key" UNIQUE ("spaceId", "reservationId");

-- FK: CapacityHold → RestaurantSpace
ALTER TABLE "CapacityHold"
  ADD CONSTRAINT "CapacityHold_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "RestaurantSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: CapacityHold → Reservation
ALTER TABLE "CapacityHold"
  ADD CONSTRAINT "CapacityHold_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite index for overlap-aware availability query (spaceId + status + window)
CREATE INDEX "CapacityHold_spaceId_status_startAt_endAt_idx"
  ON "CapacityHold"("spaceId", "status", "startAt", "endAt");

-- Index for expiry sweep (status + expiresAt)
CREATE INDEX "CapacityHold_status_expiresAt_idx"
  ON "CapacityHold"("status", "expiresAt");

-- Step 4: Add space FK columns to Reservation
--   (Both nullable; no backfill required for existing rows.)
ALTER TABLE "Reservation"
  ADD COLUMN "requestedSpaceId" TEXT,
  ADD COLUMN "assignedSpaceId"  TEXT;

-- FK: Reservation.requestedSpaceId → RestaurantSpace
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_requestedSpaceId_fkey"
  FOREIGN KEY ("requestedSpaceId") REFERENCES "RestaurantSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: Reservation.assignedSpaceId → RestaurantSpace
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_assignedSpaceId_fkey"
  FOREIGN KEY ("assignedSpaceId") REFERENCES "RestaurantSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for space FK lookups on Reservation
CREATE INDEX "Reservation_requestedSpaceId_idx" ON "Reservation"("requestedSpaceId");
CREATE INDEX "Reservation_assignedSpaceId_idx"  ON "Reservation"("assignedSpaceId");

-- Step 5: Promote LedgerEvent.capacityHoldId to a real FK.
--   The TEXT column was added as a placeholder in migration
--   20260731120000_add_ledger_event_proofpay. Now that CapacityHold exists,
--   we add the FK constraint and index here.
ALTER TABLE "LedgerEvent"
  ADD CONSTRAINT "LedgerEvent_capacityHoldId_fkey"
  FOREIGN KEY ("capacityHoldId") REFERENCES "CapacityHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LedgerEvent_capacityHoldId_idx" ON "LedgerEvent"("capacityHoldId");
