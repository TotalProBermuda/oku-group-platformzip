-- The event-menu models predate the tracked migration history in some
-- environments. Create them additively when absent so clean replay and
-- installations that already have these tables both remain safe.
DO $$ BEGIN
  CREATE TYPE "VenueMenuType" AS ENUM ('FOOD', 'DRINKS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VenueMenuRecord" (
  "id" TEXT NOT NULL,
  "venueSlug" TEXT NOT NULL,
  "menuType" "VenueMenuType" NOT NULL,
  "menuTitle" JSONB NOT NULL,
  "intro" JSONB,
  "pdfUrl" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "isHouseMenu" BOOLEAN NOT NULL DEFAULT true,
  "parentMenuId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VenueMenuRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VenueMenuRecord_venueSlug_menuType_idx"
  ON "VenueMenuRecord"("venueSlug", "menuType");
CREATE INDEX IF NOT EXISTS "VenueMenuRecord_venueSlug_idx"
  ON "VenueMenuRecord"("venueSlug");
CREATE INDEX IF NOT EXISTS "VenueMenuRecord_parentMenuId_idx"
  ON "VenueMenuRecord"("parentMenuId");

CREATE TABLE IF NOT EXISTS "EventMenuLink" (
  "id" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "menuId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventMenuLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EventMenuLink_seriesId_menuId_key"
  ON "EventMenuLink"("seriesId", "menuId");
CREATE INDEX IF NOT EXISTS "EventMenuLink_seriesId_idx"
  ON "EventMenuLink"("seriesId");
CREATE INDEX IF NOT EXISTS "EventMenuLink_menuId_idx"
  ON "EventMenuLink"("menuId");

CREATE TABLE IF NOT EXISTS "MenuSectionRecord" (
  "id" TEXT NOT NULL,
  "menuId" TEXT NOT NULL,
  "title" JSONB NOT NULL,
  "subtitle" JSONB,
  "description" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuSectionRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MenuSectionRecord_menuId_idx"
  ON "MenuSectionRecord"("menuId");

CREATE TABLE IF NOT EXISTS "MenuItemRecord" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "name" JSONB NOT NULL,
  "description" JSONB,
  "price" TEXT,
  "producerName" TEXT,
  "imageUrl" TEXT,
  "dietary" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuItemRecord_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MenuItemRecord" ADD COLUMN IF NOT EXISTS "producerName" TEXT;
ALTER TABLE "MenuItemRecord" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
CREATE INDEX IF NOT EXISTS "MenuItemRecord_sectionId_idx"
  ON "MenuItemRecord"("sectionId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VenueMenuRecord_parentMenuId_fkey') THEN
    ALTER TABLE "VenueMenuRecord" ADD CONSTRAINT "VenueMenuRecord_parentMenuId_fkey"
      FOREIGN KEY ("parentMenuId") REFERENCES "VenueMenuRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventMenuLink_seriesId_fkey') THEN
    ALTER TABLE "EventMenuLink" ADD CONSTRAINT "EventMenuLink_seriesId_fkey"
      FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventMenuLink_menuId_fkey') THEN
    ALTER TABLE "EventMenuLink" ADD CONSTRAINT "EventMenuLink_menuId_fkey"
      FOREIGN KEY ("menuId") REFERENCES "VenueMenuRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MenuSectionRecord_menuId_fkey') THEN
    ALTER TABLE "MenuSectionRecord" ADD CONSTRAINT "MenuSectionRecord_menuId_fkey"
      FOREIGN KEY ("menuId") REFERENCES "VenueMenuRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MenuItemRecord_sectionId_fkey') THEN
    ALTER TABLE "MenuItemRecord" ADD CONSTRAINT "MenuItemRecord_sectionId_fkey"
      FOREIGN KEY ("sectionId") REFERENCES "MenuSectionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SessionMenuLink" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "menuId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionMenuLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SessionMenuLink_sessionId_menuId_key"
  ON "SessionMenuLink"("sessionId", "menuId");
CREATE INDEX IF NOT EXISTS "SessionMenuLink_sessionId_sortOrder_idx"
  ON "SessionMenuLink"("sessionId", "sortOrder");
CREATE INDEX IF NOT EXISTS "SessionMenuLink_menuId_idx"
  ON "SessionMenuLink"("menuId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionMenuLink_sessionId_fkey') THEN
    ALTER TABLE "SessionMenuLink" ADD CONSTRAINT "SessionMenuLink_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionMenuLink_menuId_fkey') THEN
    ALTER TABLE "SessionMenuLink" ADD CONSTRAINT "SessionMenuLink_menuId_fkey"
      FOREIGN KEY ("menuId") REFERENCES "VenueMenuRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
