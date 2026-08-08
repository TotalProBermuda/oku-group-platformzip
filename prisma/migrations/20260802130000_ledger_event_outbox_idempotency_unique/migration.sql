-- Migration: Task #186 follow-up — unique constraint on LedgerEventOutbox.idempotencyKey
--
-- Adds a unique constraint so duplicate outbox rows (same idempotencyKey)
-- are rejected at the DB layer, preventing double-emission even if two
-- concurrent callers both attempt to enqueue the same event.

CREATE UNIQUE INDEX "LedgerEventOutbox_idempotencyKey_key"
  ON "LedgerEventOutbox"("idempotencyKey");
