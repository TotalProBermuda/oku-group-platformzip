-- Partner-owned and seller-owned canonical attribution identities.
-- Scalar IDs deliberately remain FK-less: ReferralActor/Assignment/Link have
-- their own lifecycle and are retired rather than cascade-deleted.
ALTER TYPE "UserAdminAction" ADD VALUE IF NOT EXISTS 'PARTNER_CHANNEL_ACTIVATED';
ALTER TYPE "UserAdminAction" ADD VALUE IF NOT EXISTS 'PARTNER_CHANNEL_PAUSED';
ALTER TYPE "UserAdminAction" ADD VALUE IF NOT EXISTS 'PARTNER_CHANNEL_ROTATED';
ALTER TYPE "UserAdminAction" ADD VALUE IF NOT EXISTS 'PARTNER_SELLER_CHANNEL_ACTIVATED';

ALTER TABLE "PartnerCommerceChannel"
  ADD COLUMN IF NOT EXISTS "referralAssignmentId" TEXT;

ALTER TABLE "PartnerCommerceSeat"
  ADD COLUMN IF NOT EXISTS "referralActorId" TEXT,
  ADD COLUMN IF NOT EXISTS "referralAssignmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "referralLinkId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerCommerceChannel_referralAssignmentId_key"
  ON "PartnerCommerceChannel"("referralAssignmentId") WHERE "referralAssignmentId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerCommerceSeat_referralActorId_key"
  ON "PartnerCommerceSeat"("referralActorId") WHERE "referralActorId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerCommerceSeat_referralAssignmentId_key"
  ON "PartnerCommerceSeat"("referralAssignmentId") WHERE "referralAssignmentId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerCommerceSeat_referralLinkId_key"
  ON "PartnerCommerceSeat"("referralLinkId") WHERE "referralLinkId" IS NOT NULL;
