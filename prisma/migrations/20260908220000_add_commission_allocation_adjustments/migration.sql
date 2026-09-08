-- Immutable, signed finance adjustments for pending CommissionAllocation rows.
CREATE TABLE "CommissionAllocationAdjustment" (
  "id" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "deltaCents" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionAllocationAdjustment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CommissionAllocationAdjustment"
  ADD CONSTRAINT "CommissionAllocationAdjustment_allocationId_fkey"
  FOREIGN KEY ("allocationId") REFERENCES "CommissionAllocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CommissionAllocationAdjustment_allocationId_createdAt_idx"
  ON "CommissionAllocationAdjustment"("allocationId", "createdAt");
