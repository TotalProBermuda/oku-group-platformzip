-- Additive only: retain legacy URLs and leave existing records unchanged.
ALTER TABLE "Series"
  ADD COLUMN "heroImageUrlEn" TEXT,
  ADD COLUMN "heroImageUrlEs" TEXT,
  ADD COLUMN "heroImageUrlPt" TEXT;
ALTER TABLE "Session"
  ADD COLUMN "flyerImageUrlEn" TEXT,
  ADD COLUMN "flyerImageUrlEs" TEXT,
  ADD COLUMN "flyerImageUrlPt" TEXT;
