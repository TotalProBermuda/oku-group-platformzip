CREATE TABLE "SessionMenuLink" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "menuId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionMenuLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionMenuLink_sessionId_menuId_key"
  ON "SessionMenuLink"("sessionId", "menuId");
CREATE INDEX "SessionMenuLink_sessionId_sortOrder_idx"
  ON "SessionMenuLink"("sessionId", "sortOrder");
CREATE INDEX "SessionMenuLink_menuId_idx"
  ON "SessionMenuLink"("menuId");

ALTER TABLE "SessionMenuLink"
  ADD CONSTRAINT "SessionMenuLink_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionMenuLink"
  ADD CONSTRAINT "SessionMenuLink_menuId_fkey"
  FOREIGN KEY ("menuId") REFERENCES "VenueMenuRecord"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
