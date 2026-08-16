-- A series belongs to an operational Venue and may optionally target one
-- physical RestaurantSpace.  A null spaceId means venue-wide programming.
ALTER TABLE "Series" ADD COLUMN "venueId" TEXT;
ALTER TABLE "Series" ADD COLUMN "spaceId" TEXT;
ALTER TABLE "RestaurantSpace" ADD COLUMN "conceptKey" TEXT;

WITH normalized AS (
  SELECT id, "venueId",
    regexp_replace(
      regexp_replace(translate(upper("name"), 'ÜÁÉÍÓÚÑÇ', 'UAEIOUNC'), '[^A-Z0-9]+', '_', 'g'),
      '^_+|_+$', '', 'g'
    ) AS base_key
  FROM "RestaurantSpace"
), numbered AS (
  SELECT id, base_key,
    row_number() OVER (PARTITION BY "venueId", base_key ORDER BY id) AS occurrence
  FROM normalized
)
UPDATE "RestaurantSpace" rs
SET "conceptKey" = CASE WHEN n.occurrence = 1 THEN n.base_key ELSE n.base_key || '_' || n.occurrence END
FROM numbered n
WHERE rs.id = n.id AND rs."conceptKey" IS NULL;

ALTER TABLE "RestaurantSpace" ALTER COLUMN "conceptKey" SET NOT NULL;

-- First preserve direct legacy matches (for installations whose venue slug
-- is OKU/CATCH), then safely fall back only when exactly one venue exists.
UPDATE "Series" s
SET "venueId" = v."id"
FROM "Venue" v
WHERE s."venueId" IS NULL AND lower(v."slug") = lower(s."venue"::text);

UPDATE "Series" s
SET "venueId" = (SELECT v."id" FROM "Venue" v LIMIT 1)
WHERE s."venueId" IS NULL
  AND (SELECT count(*) FROM "Venue") = 1;

-- Preserve the former OKU/CATCH concept as a physical-space selection when
-- a matching space exists under the resolved venue.
UPDATE "Series" s
SET "spaceId" = rs."id"
FROM "RestaurantSpace" rs
WHERE s."venueId" = rs."venueId"
  AND s."spaceId" IS NULL
  AND rs."conceptKey" = s."venue"::text;

ALTER TABLE "Series" ADD CONSTRAINT "Series_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Series" ADD CONSTRAINT "Series_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "RestaurantSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Series_venueId_idx" ON "Series"("venueId");
CREATE INDEX "Series_spaceId_idx" ON "Series"("spaceId");
CREATE UNIQUE INDEX "RestaurantSpace_venueId_conceptKey_key" ON "RestaurantSpace"("venueId", "conceptKey");
