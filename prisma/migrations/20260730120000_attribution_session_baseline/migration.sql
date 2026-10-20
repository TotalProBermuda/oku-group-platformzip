-- AttributionSession was introduced in the application schema before its table
-- was captured in Prisma migration history. Production already has this table;
-- this baseline is therefore a no-op there and makes a clean install reproducible.
DO $$ BEGIN
  CREATE TYPE "AttributionSessionKind" AS ENUM ('RESERVATION', 'WALKIN', 'TICKET_PURCHASE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttributionSessionSource" AS ENUM ('QR_RESERVATION', 'HOST_CHECKIN', 'HOST_WALKIN', 'MANUAL_ADMIN', 'DIRECT', 'TICKET_PURCHASE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttributionSessionStatus" AS ENUM ('CAPTURED', 'SEATED', 'POS_BIND_INTENT_RECORDED', 'BOUND_TO_POS', 'VERIFIED_POS_SALE', 'CANCELED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AttributionSession" (
  "id" TEXT NOT NULL,
  "kind" "AttributionSessionKind" NOT NULL,
  "venueId" TEXT NOT NULL,
  "reservationId" TEXT,
  "orderId" TEXT,
  "walkinContactName" TEXT,
  "walkinPartySize" INTEGER,
  "walkinNotes" TEXT,
  "bookingCode" TEXT NOT NULL,
  "tableLabel" TEXT,
  "zoneId" TEXT,
  "hostUserId" TEXT,
  "hostProfileId" TEXT,
  "referralActorId" TEXT,
  "legacyReferrerId" TEXT,
  "referralLinkId" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "source" "AttributionSessionSource" NOT NULL DEFAULT 'HOST_CHECKIN',
  "status" "AttributionSessionStatus" NOT NULL DEFAULT 'CAPTURED',
  "seatedAt" TIMESTAMP(3),
  "boundAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "invuOrderId" TEXT,
  "bindMethod" TEXT,
  CONSTRAINT "AttributionSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttributionSession_reservationId_key" ON "AttributionSession"("reservationId");
CREATE UNIQUE INDEX IF NOT EXISTS "AttributionSession_orderId_key" ON "AttributionSession"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "AttributionSession_bookingCode_key" ON "AttributionSession"("bookingCode");
CREATE INDEX IF NOT EXISTS "AttributionSession_venueId_openedAt_idx" ON "AttributionSession"("venueId", "openedAt");
CREATE INDEX IF NOT EXISTS "AttributionSession_referralActorId_idx" ON "AttributionSession"("referralActorId");
CREATE INDEX IF NOT EXISTS "AttributionSession_hostUserId_idx" ON "AttributionSession"("hostUserId");
CREATE INDEX IF NOT EXISTS "AttributionSession_zoneId_idx" ON "AttributionSession"("zoneId");
CREATE INDEX IF NOT EXISTS "AttributionSession_status_idx" ON "AttributionSession"("status");
CREATE INDEX IF NOT EXISTS "AttributionSession_source_idx" ON "AttributionSession"("source");
CREATE INDEX IF NOT EXISTS "AttributionSession_orderId_idx" ON "AttributionSession"("orderId");

DO $$ BEGIN
  IF to_regclass('"Venue"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttributionSession_venueId_fkey') THEN
    ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF to_regclass('"Reservation"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttributionSession_reservationId_fkey') THEN
    ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF to_regclass('"Order"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttributionSession_orderId_fkey') THEN
    ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF to_regclass('"Zone"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttributionSession_zoneId_fkey') THEN
    ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF to_regclass('"Referrer"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttributionSession_legacyReferrerId_fkey') THEN
    ALTER TABLE "AttributionSession" ADD CONSTRAINT "AttributionSession_legacyReferrerId_fkey" FOREIGN KEY ("legacyReferrerId") REFERENCES "Referrer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
