-- Migration: LedgerEvent — add POS_CHECK_CLOSED event type and fix deduplication index
--
-- Two changes:
--   1. Add POS_CHECK_CLOSED to the LedgerEventType enum — distinct from attribution
--      lifecycle events so POS/financial events are independently queryable.
--   2. Replace the (sourceRecordId, idempotencyKey) unique index with a 3-column
--      (sourceSystem, sourceRecordId, idempotencyKey) index. Including sourceSystem
--      (non-nullable) prevents cross-connector collision: two different external
--      systems that use the same recordId + idempotencyKey format no longer conflict.
--      sourceConnector is excluded because it is nullable and PostgreSQL NULL!=NULL
--      semantics would silently skip deduplication when the connector is absent.

-- 1. Extend the enum
ALTER TYPE "LedgerEventType" ADD VALUE IF NOT EXISTS 'POS_CHECK_CLOSED';

-- 2. Drop old unique index (sourceRecordId, idempotencyKey)
DROP INDEX IF EXISTS "LedgerEvent_sourceRecordId_idempotencyKey_key";

-- 3. Create replacement unique index (sourceSystem, sourceRecordId, idempotencyKey)
--    Only covers rows where sourceRecordId IS NOT NULL — the partial index below
--    handles null-sourceRecordId deduplication separately.
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEvent_dedup_key"
  ON "LedgerEvent" ("sourceSystem", "sourceRecordId", "idempotencyKey")
  WHERE "sourceRecordId" IS NOT NULL;

-- 4. The partial unique index for null-source internal events remains unchanged:
--    CREATE UNIQUE INDEX "LedgerEvent_null_src_idempotencyKey_unique"
--      ON "LedgerEvent" ("idempotencyKey") WHERE "sourceRecordId" IS NULL;
--    (created in the previous migration; no action needed here)
