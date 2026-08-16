-- Event/buyout occupancy is a first-class operational schedule. It deliberately
-- does not reuse CapacityHold: an event can close a whole venue and has a
-- conflict lifecycle independent of individual dining reservations.

ALTER TYPE "SeriesStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "SeriesStatus" ADD VALUE IF NOT EXISTS 'POSTPONED';
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'POSTPONED';

CREATE TYPE "EventOccupancyScope" AS ENUM ('SPACE', 'VENUE');
CREATE TYPE "EventOccupancyPolicy" AS ENUM ('EXCLUSIVE', 'COEXIST');
CREATE TYPE "EventOccupancyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'POSTPONED', 'CANCELLED');
CREATE TYPE "EventReservationConflictStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'REACCOMMODATED', 'CANCELLED');

CREATE TABLE "EventSpaceOccupancy" (
  "id" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "sessionId" TEXT,
  "venueId" TEXT NOT NULL,
  "spaceId" TEXT,
  "scope" "EventOccupancyScope" NOT NULL,
  "policy" "EventOccupancyPolicy" NOT NULL DEFAULT 'EXCLUSIVE',
  "status" "EventOccupancyStatus" NOT NULL DEFAULT 'DRAFT',
  "eventStartsAt" TIMESTAMP(3) NOT NULL,
  "eventEndsAt" TIMESTAMP(3) NOT NULL,
  "blockStartsAt" TIMESTAMP(3) NOT NULL,
  "blockEndsAt" TIMESTAMP(3) NOT NULL,
  "setupMinutes" INTEGER NOT NULL DEFAULT 0,
  "resetMinutes" INTEGER NOT NULL DEFAULT 0,
  "guestMessageEn" VARCHAR(160),
  "guestMessageEs" VARCHAR(160),
  "guestMessagePt" VARCHAR(160),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventSpaceOccupancy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventReservationConflict" (
  "id" TEXT NOT NULL,
  "occupancyId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "status" "EventReservationConflictStatus" NOT NULL DEFAULT 'OPEN',
  "notedByUserId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventReservationConflict_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventReservationConflict_occupancyId_reservationId_key" ON "EventReservationConflict"("occupancyId", "reservationId");
CREATE INDEX "EventSpaceOccupancy_venueId_status_blockStartsAt_blockEndsAt_idx" ON "EventSpaceOccupancy"("venueId", "status", "blockStartsAt", "blockEndsAt");
CREATE INDEX "EventSpaceOccupancy_spaceId_status_blockStartsAt_blockEndsAt_idx" ON "EventSpaceOccupancy"("spaceId", "status", "blockStartsAt", "blockEndsAt");
CREATE INDEX "EventSpaceOccupancy_seriesId_idx" ON "EventSpaceOccupancy"("seriesId");
CREATE INDEX "EventSpaceOccupancy_sessionId_idx" ON "EventSpaceOccupancy"("sessionId");
CREATE INDEX "EventReservationConflict_reservationId_status_idx" ON "EventReservationConflict"("reservationId", "status");
CREATE INDEX "EventReservationConflict_occupancyId_status_idx" ON "EventReservationConflict"("occupancyId", "status");

ALTER TABLE "EventSpaceOccupancy" ADD CONSTRAINT "EventSpaceOccupancy_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSpaceOccupancy" ADD CONSTRAINT "EventSpaceOccupancy_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventSpaceOccupancy" ADD CONSTRAINT "EventSpaceOccupancy_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSpaceOccupancy" ADD CONSTRAINT "EventSpaceOccupancy_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "RestaurantSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventReservationConflict" ADD CONSTRAINT "EventReservationConflict_occupancyId_fkey" FOREIGN KEY ("occupancyId") REFERENCES "EventSpaceOccupancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventReservationConflict" ADD CONSTRAINT "EventReservationConflict_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
