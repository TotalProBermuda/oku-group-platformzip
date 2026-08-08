-- ProofPay canonical event foundation (Task #182)
-- Adds the LedgerEvent model with its enums, indexes, and FK relations.
--
-- Deduplication strategy:
--   1. Standard unique index on (sourceRecordId, idempotencyKey) — handles
--      external-source events where both fields are non-null. PostgreSQL's
--      NULL != NULL semantics mean this index correctly ignores NULL-source rows.
--   2. Partial unique index on (idempotencyKey) WHERE sourceRecordId IS NULL —
--      enforces idempotency for internal app events that carry no external
--      source record ID, since standard unique constraints cannot deduplicate
--      NULL-valued columns in PostgreSQL.

-- CreateEnum
CREATE TYPE "LedgerEventType" AS ENUM (
  'REFERRAL_SCANNED',
  'RESERVATION_REQUESTED',
  'RESERVATION_CONFIRMED',
  'RESERVATION_MODIFIED',
  'RESERVATION_CANCELLED',
  'RESERVATION_NO_SHOW',
  'GUEST_ARRIVED',
  'GUEST_SEATED',
  'CAPACITY_HOLD_CREATED',
  'CAPACITY_HOLD_RELEASED',
  'CAPACITY_WARNING_SHOWN',
  'CAPACITY_OVERRIDDEN_BY_HOST',
  'ATTRIBUTION_ANCHOR_PENDING',
  'ATTRIBUTION_ANCHOR_RESOLVED',
  'ATTRIBUTION_ANCHOR_FAILED'
);

-- CreateEnum
CREATE TYPE "ConfidenceClass" AS ENUM (
  'VERIFIED_POS_EVENT',
  'PARTNER_REPORTED_EVENT',
  'CUSTOMER_CLAIMED_EVENT',
  'MANUAL_REVIEW_EVENT',
  'ESTIMATED_EVENT'
);

-- CreateTable
CREATE TABLE "LedgerEvent" (
    "id"                     TEXT        NOT NULL,
    "eventType"              "LedgerEventType" NOT NULL,
    "sourceSystem"           TEXT        NOT NULL,
    "sourceConnector"        TEXT,
    "sourceRecordId"         TEXT,
    "idempotencyKey"         TEXT        NOT NULL,
    "occurredAt"             TIMESTAMP(3) NOT NULL,
    "receivedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidenceClass"        "ConfidenceClass" NOT NULL,
    "rawPayloadRef"          TEXT,
    "auditTraceId"           TEXT,
    "duplicateCount"         INTEGER     NOT NULL DEFAULT 0,
    "lastDuplicateAt"        TIMESTAMP(3),
    "attributionSessionId"   TEXT,
    "reservationId"          TEXT,
    "capacityHoldId"         TEXT,
    "commissionAllocationId" TEXT,
    "payload"                JSONB,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEvent_pkey" PRIMARY KEY ("id")
);

-- Standard unique index for external-source deduplication (non-null sourceRecordId).
-- Prisma uses this index name for `findUnique` via the @@unique schema directive.
-- PostgreSQL's NULL != NULL semantics naturally exclude null-source rows here.
CREATE UNIQUE INDEX "LedgerEvent_sourceRecordId_idempotencyKey_key"
  ON "LedgerEvent"("sourceRecordId", "idempotencyKey");

-- Partial unique index for internal-event deduplication (null sourceRecordId).
-- Raises P2002 on concurrent duplicate emits — caught by emitLedgerEvent's
-- race-handler. Without this index, two simultaneous internal emits with the
-- same idempotencyKey would both succeed and produce duplicate rows.
CREATE UNIQUE INDEX "LedgerEvent_null_src_idempotencyKey_unique"
  ON "LedgerEvent"("idempotencyKey")
  WHERE "sourceRecordId" IS NULL;

-- Regular indexes for query patterns
CREATE INDEX "LedgerEvent_eventType_idx"              ON "LedgerEvent"("eventType");
CREATE INDEX "LedgerEvent_idempotencyKey_idx"         ON "LedgerEvent"("idempotencyKey");
CREATE INDEX "LedgerEvent_attributionSessionId_idx"   ON "LedgerEvent"("attributionSessionId");
CREATE INDEX "LedgerEvent_reservationId_idx"          ON "LedgerEvent"("reservationId");
CREATE INDEX "LedgerEvent_commissionAllocationId_idx" ON "LedgerEvent"("commissionAllocationId");
CREATE INDEX "LedgerEvent_occurredAt_idx"             ON "LedgerEvent"("occurredAt");
CREATE INDEX "LedgerEvent_confidenceClass_idx"        ON "LedgerEvent"("confidenceClass");

-- FK: LedgerEvent → AttributionSession (optional)
ALTER TABLE "LedgerEvent"
  ADD CONSTRAINT "LedgerEvent_attributionSessionId_fkey"
  FOREIGN KEY ("attributionSessionId")
  REFERENCES "AttributionSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: LedgerEvent → Reservation (optional)
ALTER TABLE "LedgerEvent"
  ADD CONSTRAINT "LedgerEvent_reservationId_fkey"
  FOREIGN KEY ("reservationId")
  REFERENCES "Reservation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: LedgerEvent → CommissionAllocation (optional)
ALTER TABLE "LedgerEvent"
  ADD CONSTRAINT "LedgerEvent_commissionAllocationId_fkey"
  FOREIGN KEY ("commissionAllocationId")
  REFERENCES "CommissionAllocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
