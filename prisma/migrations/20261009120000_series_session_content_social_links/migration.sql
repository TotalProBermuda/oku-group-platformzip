ALTER TABLE "Series"
  ADD COLUMN "socialLinksJson" JSONB;

ALTER TABLE "Session"
  ADD COLUMN "subtitle" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "flyerImageUrl" TEXT;

CREATE TABLE "SessionTicketPrice" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "ticketTypeId" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionTicketPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionTicketPrice_sessionId_ticketTypeId_key"
  ON "SessionTicketPrice"("sessionId", "ticketTypeId");
CREATE INDEX "SessionTicketPrice_ticketTypeId_idx"
  ON "SessionTicketPrice"("ticketTypeId");

ALTER TABLE "SessionTicketPrice"
  ADD CONSTRAINT "SessionTicketPrice_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionTicketPrice"
  ADD CONSTRAINT "SessionTicketPrice_ticketTypeId_fkey"
  FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
