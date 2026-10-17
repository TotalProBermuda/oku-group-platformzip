-- TEST/REVIEW PROPOSAL ONLY. Not a Prisma migration. Never run on real databases.
-- Enrollment requires authoritative historical capture/refund reconciliation.
CREATE TABLE "RefundSafetyAccount" (
  id text PRIMARY KEY,
  "capturedCents" integer NOT NULL CHECK ("capturedCents" > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  "historyVerified" boolean NOT NULL DEFAULT false,
  UNIQUE (id,currency)
);
CREATE TABLE "RefundSafetyOperation" (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "requestKey" text NOT NULL,
  "amountCents" integer NOT NULL CHECK ("amountCents" > 0),
  currency text NOT NULL,
  "allocationHash" text NOT NULL,
  "actorId" text NOT NULL,
  state text NOT NULL DEFAULT 'RESERVED'
    CHECK (state IN ('RESERVED','SUBMITTED','UNKNOWN','SETTLED','FAILED')),
  "providerRefundId" text UNIQUE,
  "evidenceId" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId",currency) REFERENCES "RefundSafetyAccount" (id,currency),
  UNIQUE ("accountId","requestKey")
);
