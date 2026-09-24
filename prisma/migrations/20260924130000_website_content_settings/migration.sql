ALTER TABLE "CommerceSettings"
ADD COLUMN IF NOT EXISTS "websiteContent" JSONB;
