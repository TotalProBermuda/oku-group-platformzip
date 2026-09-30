CREATE TABLE "CheckoutFinanceRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "serviceFeeBps" INTEGER NOT NULL CHECK ("serviceFeeBps" BETWEEN 0 AND 10000),
  "taxBps" INTEGER NOT NULL CHECK ("taxBps" BETWEEN 0 AND 10000),
  "taxServiceFee" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CheckoutFinanceRule_effectiveFrom_key" ON "CheckoutFinanceRule"("effectiveFrom");
INSERT INTO "CheckoutFinanceRule" ("id", "effectiveFrom", "serviceFeeBps", "taxBps", "createdById")
VALUES ('legacy-ticket-rates', '1970-01-01', 500, 840, 'migration:legacy-rates');
ALTER TABLE "Session" ADD COLUMN "allowLateSales" BOOLEAN NOT NULL DEFAULT false;
