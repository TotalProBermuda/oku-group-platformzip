CREATE TYPE "SessionTicketSalesMode" AS ENUM ('INHERIT', 'OVERRIDE');

ALTER TABLE "Session"
  ADD COLUMN "ticketSalesMode" "SessionTicketSalesMode" NOT NULL DEFAULT 'INHERIT',
  ADD COLUMN "ticketSalesStartAt" TIMESTAMP(3),
  ADD COLUMN "ticketSalesEndAt" TIMESTAMP(3);
