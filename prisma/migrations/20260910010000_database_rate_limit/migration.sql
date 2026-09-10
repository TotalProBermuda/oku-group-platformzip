-- Shared fixed-window request limiter. The application stores only an HMAC
-- digest of its rate-limit key, never a raw client IP address or request body.
CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateLimitBucket_keyHash_windowStart_key"
  ON "RateLimitBucket"("keyHash", "windowStart");

CREATE INDEX "RateLimitBucket_expiresAt_idx"
  ON "RateLimitBucket"("expiresAt");
