ALTER TYPE "UserAdminAction" ADD VALUE IF NOT EXISTS 'PARTNER_COMMERCE_INVITED';
ALTER TABLE "PartnerCommerceSeat" ADD COLUMN IF NOT EXISTS "provisionedUserId" TEXT;
CREATE INDEX IF NOT EXISTS "PartnerCommerceSeat_provisionedUserId_idx" ON "PartnerCommerceSeat"("provisionedUserId");

-- This migration may be retried after an interrupted deployment. PostgreSQL
-- has no ADD CONSTRAINT IF NOT EXISTS, so guard the foreign key explicitly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PartnerCommerceSeat_provisionedUserId_fkey'
      AND conrelid = '"PartnerCommerceSeat"'::regclass
  ) THEN
    ALTER TABLE "PartnerCommerceSeat"
      ADD CONSTRAINT "PartnerCommerceSeat_provisionedUserId_fkey"
      FOREIGN KEY ("provisionedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
