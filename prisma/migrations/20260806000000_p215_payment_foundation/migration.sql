-- ============================================================
-- P215: Cybersource payment foundation — reservation deposits
-- ============================================================
-- Applied via `prisma db push` during development.
-- This file documents the schema changes for migration tracking.
-- To mark this as applied on a database that already received
-- `db push`, run:
--   npx prisma migrate resolve --applied 20260806000000_p215_payment_foundation
-- ============================================================

-- ── New enums ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PaymentProvider" AS ENUM ('AUTHORIZE_NET', 'CYBERSOURCE', 'DEMO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentIntentStatus" AS ENUM (
    'CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentAttemptStatus" AS ENUM (
    'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'VOIDED', 'REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── New values on existing enums ──────────────────────────────────────────────

ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "OrderType"         ADD VALUE IF NOT EXISTS 'RESERVATION_DEPOSIT';
ALTER TYPE "LedgerEventType"   ADD VALUE IF NOT EXISTS 'PAYMENT_AUTHORIZED';
ALTER TYPE "LedgerEventType"   ADD VALUE IF NOT EXISTS 'PAYMENT_CAPTURED';
ALTER TYPE "LedgerEventType"   ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "LedgerEventType"   ADD VALUE IF NOT EXISTS 'PAYMENT_VOIDED';
ALTER TYPE "LedgerEventType"   ADD VALUE IF NOT EXISTS 'PAYMENT_REFUNDED';

-- ── RestaurantSpace: deposit column ──────────────────────────────────────────

ALTER TABLE "RestaurantSpace" ADD COLUMN IF NOT EXISTS "depositRequiredCents" INTEGER;

-- ── PaymentIntent table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PaymentIntent" (
    "id"                      TEXT        NOT NULL,
    "reservationId"           TEXT,
    "orderType"               "OrderType" NOT NULL DEFAULT 'RESERVATION_DEPOSIT',
    "amountCents"             INTEGER     NOT NULL,
    "currency"                TEXT        NOT NULL DEFAULT 'USD',
    "status"                  "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey"          TEXT        NOT NULL,
    "provider"                "PaymentProvider" NOT NULL DEFAULT 'CYBERSOURCE',
    "attributionSessionId"    TEXT,
    "cybersourceTransactionId" TEXT,
    "cybersourceRequestId"    TEXT,
    "lastFailureCode"         TEXT,
    "lastFailureMessage"      TEXT,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentIntent_reservationId_key"   ON "PaymentIntent"("reservationId");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentIntent_idempotencyKey_key"  ON "PaymentIntent"("idempotencyKey");
CREATE        INDEX IF NOT EXISTS "PaymentIntent_reservationId_idx"   ON "PaymentIntent"("reservationId");
CREATE        INDEX IF NOT EXISTS "PaymentIntent_status_idx"          ON "PaymentIntent"("status");
CREATE        INDEX IF NOT EXISTS "PaymentIntent_cybersourceTransactionId_idx"
    ON "PaymentIntent"("cybersourceTransactionId");

DO $$ BEGIN
    ALTER TABLE "PaymentIntent"
        ADD CONSTRAINT "PaymentIntent_reservationId_fkey"
        FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PaymentIntent"
        ADD CONSTRAINT "PaymentIntent_attributionSessionId_fkey"
        FOREIGN KEY ("attributionSessionId") REFERENCES "AttributionSession"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── PaymentAttempt table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PaymentAttempt" (
    "id"                      TEXT        NOT NULL,
    "paymentIntentId"         TEXT        NOT NULL,
    "status"                  "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents"             INTEGER     NOT NULL,
    "currency"                TEXT        NOT NULL DEFAULT 'USD',
    "cybersourceTransactionId" TEXT,
    "cybersourceRequestId"    TEXT,
    "cybersourceAuthCode"     TEXT,
    "cybersourceResponseCode" TEXT,
    "cybersourceRawSafeJson"  JSONB,
    "failureCode"             TEXT,
    "failureMessage"          TEXT,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaymentAttempt_paymentIntentId_idx"
    ON "PaymentAttempt"("paymentIntentId");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_cybersourceTransactionId_idx"
    ON "PaymentAttempt"("cybersourceTransactionId");

DO $$ BEGIN
    ALTER TABLE "PaymentAttempt"
        ADD CONSTRAINT "PaymentAttempt_paymentIntentId_fkey"
        FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── paymentIntentId FK on outbox tables ───────────────────────────────────────

ALTER TABLE "LedgerEvent"    ADD COLUMN IF NOT EXISTS "paymentIntentId" TEXT;
ALTER TABLE "LedgerEventOutbox" ADD COLUMN IF NOT EXISTS "paymentIntentId" TEXT;

CREATE INDEX IF NOT EXISTS "LedgerEvent_paymentIntentId_idx"       ON "LedgerEvent"("paymentIntentId");
CREATE INDEX IF NOT EXISTS "LedgerEventOutbox_paymentIntentId_idx" ON "LedgerEventOutbox"("paymentIntentId");

DO $$ BEGIN
    ALTER TABLE "LedgerEvent"
        ADD CONSTRAINT "LedgerEvent_paymentIntentId_fkey"
        FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "LedgerEventOutbox"
        ADD CONSTRAINT "LedgerEventOutbox_paymentIntentId_fkey"
        FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
