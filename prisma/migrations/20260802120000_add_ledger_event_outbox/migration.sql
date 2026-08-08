-- Migration: Task #186 — LedgerEventOutbox
--
-- Adds:
--   1. LedgerEventOutboxStatus enum
--   2. LedgerEventOutbox table with all FK columns, status/retry fields, and indexes
--
-- All FK columns are nullable (SetNull on delete) so the outbox row survives
-- even when the referenced domain entity is deleted.

-- Step 1: Create LedgerEventOutboxStatus enum
CREATE TYPE "LedgerEventOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'EMITTED', 'FAILED_REVIEW');

-- Step 2: Create LedgerEventOutbox table
CREATE TABLE "LedgerEventOutbox" (
  "id"                     TEXT                        NOT NULL,
  "eventType"              "LedgerEventType"           NOT NULL,
  "sourceSystem"           TEXT                        NOT NULL,
  "sourceConnector"        TEXT,
  "sourceRecordId"         TEXT,
  "idempotencyKey"         TEXT                        NOT NULL,
  "confidenceClass"        "ConfidenceClass"           NOT NULL,
  "payload"                JSONB,
  "attributionSessionId"   TEXT,
  "reservationId"          TEXT,
  "capacityHoldId"         TEXT,
  "commissionAllocationId" TEXT,
  "status"                 "LedgerEventOutboxStatus"   NOT NULL DEFAULT 'PENDING',
  "attemptCount"           INTEGER                     NOT NULL DEFAULT 0,
  "lastAttemptAt"          TIMESTAMP(3),
  "lastError"              TEXT,
  "emittedLedgerEventId"   TEXT,
  "createdAt"              TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LedgerEventOutbox_pkey" PRIMARY KEY ("id")
);

-- Step 3: FK constraints (all nullable, SetNull on delete)
ALTER TABLE "LedgerEventOutbox"
  ADD CONSTRAINT "LedgerEventOutbox_attributionSessionId_fkey"
    FOREIGN KEY ("attributionSessionId")
    REFERENCES "AttributionSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LedgerEventOutbox"
  ADD CONSTRAINT "LedgerEventOutbox_reservationId_fkey"
    FOREIGN KEY ("reservationId")
    REFERENCES "Reservation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LedgerEventOutbox"
  ADD CONSTRAINT "LedgerEventOutbox_capacityHoldId_fkey"
    FOREIGN KEY ("capacityHoldId")
    REFERENCES "CapacityHold"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LedgerEventOutbox"
  ADD CONSTRAINT "LedgerEventOutbox_commissionAllocationId_fkey"
    FOREIGN KEY ("commissionAllocationId")
    REFERENCES "CommissionAllocation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Indexes
CREATE INDEX "LedgerEventOutbox_status_createdAt_idx"
  ON "LedgerEventOutbox"("status", "createdAt");

CREATE INDEX "LedgerEventOutbox_idempotencyKey_idx"
  ON "LedgerEventOutbox"("idempotencyKey");

CREATE INDEX "LedgerEventOutbox_reservationId_idx"
  ON "LedgerEventOutbox"("reservationId");

CREATE INDEX "LedgerEventOutbox_attributionSessionId_idx"
  ON "LedgerEventOutbox"("attributionSessionId");

CREATE INDEX "LedgerEventOutbox_commissionAllocationId_idx"
  ON "LedgerEventOutbox"("commissionAllocationId");
