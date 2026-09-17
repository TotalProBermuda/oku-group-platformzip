ALTER TYPE "UserAdminAction" ADD VALUE IF NOT EXISTS 'PARTNER_COMMERCE_INVITED';
ALTER TABLE "PartnerCommerceSeat" ADD COLUMN "provisionedUserId" TEXT;
CREATE INDEX "PartnerCommerceSeat_provisionedUserId_idx" ON "PartnerCommerceSeat"("provisionedUserId");
ALTER TABLE "PartnerCommerceSeat" ADD CONSTRAINT "PartnerCommerceSeat_provisionedUserId_fkey"
  FOREIGN KEY ("provisionedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
