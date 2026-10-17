ALTER TABLE "ContentTranslation"
  ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "processingUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastErrorCode" TEXT;
CREATE INDEX IF NOT EXISTS "ContentTranslation_status_nextAttemptAt_idx" ON "ContentTranslation"("status", "nextAttemptAt");
