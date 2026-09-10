-- Shared fixed-window request limiter. The application stores only an HMAC
-- digest of its rate-limit key, never a raw client IP address or request body.
-- This migration may be re-run after a deployment interruption. Keep these
-- statements idempotent so a partially-created rate-limit table can be
-- reconciled without touching application, reservation, or payment data.
CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RateLimitBucket_keyHash_windowStart_key"
  ON "RateLimitBucket"("keyHash", "windowStart");

CREATE INDEX IF NOT EXISTS "RateLimitBucket_expiresAt_idx"
  ON "RateLimitBucket"("expiresAt");
