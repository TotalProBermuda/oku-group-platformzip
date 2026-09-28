-- Defensive production repair for deployments where the application schema
-- advanced but one or more CommerceSettings columns were not materialized.
-- IF NOT EXISTS makes this safe on databases where the original migrations
-- already completed successfully.
ALTER TABLE "CommerceSettings"
  ADD COLUMN IF NOT EXISTS "reservationServiceStartMinutes" INTEGER NOT NULL DEFAULT 1020,
  ADD COLUMN IF NOT EXISTS "reservationServiceEndMinutes" INTEGER NOT NULL DEFAULT 1410,
  ADD COLUMN IF NOT EXISTS "websiteContent" JSONB;
