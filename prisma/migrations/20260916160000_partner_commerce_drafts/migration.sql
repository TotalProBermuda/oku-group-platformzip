-- Partner commerce is intentionally independent from event delegate seats.
-- The first release stores drafts only: no invitation, user grant, referral
-- attribution, commission, or banking record is created by this migration.
CREATE TYPE "PartnerCommerceChannelStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED');
CREATE TYPE "PartnerCommerceSeatStatus" AS ENUM ('DRAFT', 'INVITED', 'ACTIVE', 'PAUSED', 'REVOKED');
CREATE TYPE "PartnerCommerceRole" AS ENUM ('TEAM_SELLER', 'CONCIERGE', 'PROMOTER', 'INFLUENCER', 'SPEAKER', 'SPONSOR');

CREATE TABLE "PartnerCommerceChannel" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" "PartnerCommerceChannelStatus" NOT NULL DEFAULT 'DRAFT',
  "referralActorId" TEXT,
  "referralLinkId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerCommerceChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerCommerceSeat" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "commercialRole" "PartnerCommerceRole" NOT NULL,
  "status" "PartnerCommerceSeatStatus" NOT NULL DEFAULT 'DRAFT',
  "requestedScopeJson" JSONB,
  "notes" TEXT,
  "acceptedByUserId" TEXT,
  "invitedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerCommerceSeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerCommerceChannel_partnerId_label_key" ON "PartnerCommerceChannel"("partnerId", "label");
CREATE UNIQUE INDEX "PartnerCommerceChannel_referralActorId_key" ON "PartnerCommerceChannel"("referralActorId");
CREATE UNIQUE INDEX "PartnerCommerceChannel_referralLinkId_key" ON "PartnerCommerceChannel"("referralLinkId");
CREATE INDEX "PartnerCommerceChannel_partnerId_status_idx" ON "PartnerCommerceChannel"("partnerId", "status");
CREATE UNIQUE INDEX "PartnerCommerceSeat_partnerId_email_key" ON "PartnerCommerceSeat"("partnerId", "email");
CREATE INDEX "PartnerCommerceSeat_partnerId_status_idx" ON "PartnerCommerceSeat"("partnerId", "status");
CREATE INDEX "PartnerCommerceSeat_email_idx" ON "PartnerCommerceSeat"("email");

ALTER TABLE "PartnerCommerceChannel" ADD CONSTRAINT "PartnerCommerceChannel_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerCommerceSeat" ADD CONSTRAINT "PartnerCommerceSeat_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerCommerceSeat" ADD CONSTRAINT "PartnerCommerceSeat_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
