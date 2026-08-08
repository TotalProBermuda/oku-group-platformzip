-- ============================================================
-- Commission Rule Engine + INVU field audit
-- Adds: CommissionRevenueBasis, CommissionTierType,
--       CommissionScopeType, ServiceChargePolicy enums;
--       CommissionRule model; trace fields on CommissionAllocation;
--       commissionAllocationId on LedgerEntry;
--       serviceChargePolicy on Venue;
--       commissionTier on ReferralActor;
--       PROCESSING / HELD_FOR_REVIEW / HELD_FOR_BENEFICIARY_MAPPING
--       values on CommissionAllocationStatus.
-- Applied via `prisma migrate resolve --applied` after db push.
-- ============================================================

-- ── New enum types ────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "CommissionRevenueBasis" AS ENUM (
    'COMMISSIONABLE_CENTS',
    'GROSS_MINUS_TAX',
    'GROSS_MINUS_TAX_MINUS_TIP',
    'GROSS_MINUS_TAX_MINUS_DISCOUNT_REFUND_TIP',
    'MANUAL_REVIEW'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionTierType" AS ENUM (
    'STANDARD',
    'TRUSTED',
    'PREMIUM',
    'PRIVATE_EVENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionScopeType" AS ENUM (
    'GLOBAL',
    'VENUE',
    'REFERRER_ACTOR',
    'CAMPAIGN_OFFER',
    'PRIVATE_EVENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ServiceChargePolicy" AS ENUM (
    'ABSENT',
    'INCLUDED_UNKNOWN',
    'EXCLUDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Extend CommissionAllocationStatus ─────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE "CommissionAllocationStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "CommissionAllocationStatus" ADD VALUE IF NOT EXISTS 'HELD_FOR_REVIEW';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "CommissionAllocationStatus" ADD VALUE IF NOT EXISTS 'HELD_FOR_BENEFICIARY_MAPPING';
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── CommissionRule table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CommissionRule" (
  "id"                 TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "tier"               "CommissionTierType"  NOT NULL DEFAULT 'STANDARD',
  "scopeType"          "CommissionScopeType" NOT NULL DEFAULT 'GLOBAL',
  "scopeId"            TEXT,
  "revenueBasis"       "CommissionRevenueBasis" NOT NULL DEFAULT 'COMMISSIONABLE_CENTS',
  "percentageBps"      INTEGER      NOT NULL DEFAULT 0,
  "percentageCapCents" INTEGER,
  "perPersonCents"     INTEGER,
  "maxTakeRateBps"     INTEGER,
  "version"            INTEGER      NOT NULL DEFAULT 1,
  "active"             BOOLEAN      NOT NULL DEFAULT true,
  "label"              TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "CommissionRule"
    ADD CONSTRAINT "CommissionRule_scopeType_scopeId_tier_version_key"
    UNIQUE ("scopeType", "scopeId", "tier", "version");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "CommissionRule_scopeType_scopeId_active_idx"
  ON "CommissionRule" ("scopeType", "scopeId", "active");

CREATE INDEX IF NOT EXISTS "CommissionRule_tier_active_idx"
  ON "CommissionRule" ("tier", "active");

-- ── Venue.serviceChargePolicy ─────────────────────────────────────────────────

ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "serviceChargePolicy" "ServiceChargePolicy" NOT NULL DEFAULT 'ABSENT';

-- ── ReferralActor.commissionTier ──────────────────────────────────────────────

ALTER TABLE "ReferralActor"
  ADD COLUMN IF NOT EXISTS "commissionTier" "CommissionTierType";

-- ── LedgerEntry.commissionAllocationId ───────────────────────────────────────

ALTER TABLE "LedgerEntry"
  ADD COLUMN IF NOT EXISTS "commissionAllocationId" TEXT;

DO $$ BEGIN
  ALTER TABLE "LedgerEntry"
    ADD CONSTRAINT "LedgerEntry_commissionAllocationId_fkey"
    FOREIGN KEY ("commissionAllocationId")
    REFERENCES "CommissionAllocation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LedgerEntry"
    ADD CONSTRAINT "LedgerEntry_commissionAllocationId_key"
    UNIQUE ("commissionAllocationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "LedgerEntry_commissionAllocationId_idx"
  ON "LedgerEntry" ("commissionAllocationId");

-- ── CommissionAllocation: drop legacy idempotency unique constraint ───────────
-- The constraint CommissionAllocation_tableSessionId_earnerType_earnerRefId_key
-- prevents reversal rows (which share the same tuple with the original allocation
-- but carry status=REVERSED). Application-layer idempotency in
-- commissionMintingService.ts handles duplicates instead. The IF EXISTS guard
-- makes this safe on databases that never had the constraint.

ALTER TABLE "CommissionAllocation"
  DROP CONSTRAINT IF EXISTS "CommissionAllocation_tableSessionId_earnerType_earnerRefId_key";

-- ── Partial unique index: one live allocation per (session, earner) ───────────
-- Allows REVERSED rows (which share the same tuple as the original to enable
-- the immutable financial history / remint pattern) while still providing a
-- DB-level race-safety net for concurrent minting workers.
-- Non-REVERSED statuses (PENDING, APPROVED, PROCESSING, HELD_FOR_REVIEW,
-- HELD_FOR_BENEFICIARY_MAPPING, PAID) are covered by this index so at most
-- one live allocation can exist per earner/session pair.
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionAllocation_live_earner_unique"
  ON "CommissionAllocation" ("tableSessionId", "earnerType", "earnerRefId")
  WHERE "status" != 'REVERSED'::"CommissionAllocationStatus";

-- ── parentAllocationId: atomic one-reversal-per-original enforcement ──────────
-- The column stores the original allocation's ID on every REVERSED row.
-- The partial unique index on this column (WHERE status = 'REVERSED') ensures
-- that two concurrent reversal requests cannot both succeed: one creates the
-- REVERSED row (sets parentAllocationId), the second hits P2002 and is
-- treated as an idempotent 409.

ALTER TABLE "CommissionAllocation"
  ADD COLUMN IF NOT EXISTS "parentAllocationId" TEXT;

CREATE INDEX IF NOT EXISTS "CommissionAllocation_parentAllocationId_idx"
  ON "CommissionAllocation" ("parentAllocationId");

CREATE UNIQUE INDEX IF NOT EXISTS "CommissionAllocation_one_reversal_per_original"
  ON "CommissionAllocation" ("parentAllocationId")
  WHERE "parentAllocationId" IS NOT NULL AND "status" = 'REVERSED'::"CommissionAllocationStatus";

-- ── CommissionAllocation trace fields ────────────────────────────────────────

ALTER TABLE "CommissionAllocation"
  ADD COLUMN IF NOT EXISTS "grossCentsSnapshot"        INTEGER,
  ADD COLUMN IF NOT EXISTS "taxCentsSnapshot"          INTEGER,
  ADD COLUMN IF NOT EXISTS "tipCentsSnapshot"          INTEGER,
  ADD COLUMN IF NOT EXISTS "discountCentsSnapshot"     INTEGER,
  ADD COLUMN IF NOT EXISTS "refundCentsSnapshot"       INTEGER,
  ADD COLUMN IF NOT EXISTS "eligibleNetRevenueCents"   INTEGER,
  ADD COLUMN IF NOT EXISTS "guestCount"                INTEGER,
  ADD COLUMN IF NOT EXISTS "percentageComponentCents"  INTEGER,
  ADD COLUMN IF NOT EXISTS "percentageCapAppliedCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "perPersonComponentCents"   INTEGER,
  ADD COLUMN IF NOT EXISTS "maxTakeRateCapCents"       INTEGER,
  ADD COLUMN IF NOT EXISTS "finalCommissionCents"      INTEGER,
  ADD COLUMN IF NOT EXISTS "revenueBasis"              "CommissionRevenueBasis",
  ADD COLUMN IF NOT EXISTS "ruleVersionId"             TEXT,
  ADD COLUMN IF NOT EXISTS "sourceCheckId"             TEXT,
  ADD COLUMN IF NOT EXISTS "confidenceClass"           TEXT;

DO $$ BEGIN
  ALTER TABLE "CommissionAllocation"
    ADD CONSTRAINT "CommissionAllocation_ruleVersionId_fkey"
    FOREIGN KEY ("ruleVersionId")
    REFERENCES "CommissionRule"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "CommissionAllocation_ruleVersionId_idx"
  ON "CommissionAllocation" ("ruleVersionId");
