-- Additive nullable mobile-specific artwork; existing session flyers remain unchanged.
ALTER TABLE "Session"
  ADD COLUMN "flyerImageUrlMobileEn" TEXT,
  ADD COLUMN "flyerImageUrlMobileEs" TEXT,
  ADD COLUMN "flyerImageUrlMobilePt" TEXT;
