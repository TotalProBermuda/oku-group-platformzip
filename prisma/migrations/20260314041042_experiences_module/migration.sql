/*
  Warnings:

  - Added the required column `nameSnapshot` to the `OrderLineItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AvailableSeatsMode" AS ENUM ('HIDDEN', 'EXACT', 'APPROXIMATE');

-- CreateEnum
CREATE TYPE "AttendeeListMode" AS ENUM ('HIDDEN', 'PUBLIC', 'BUYERS_ONLY', 'PARTIAL');

-- CreateEnum
CREATE TYPE "MembershipRuleMode" AS ENUM ('NONE', 'MEMBERS_ONLY', 'MEMBERS_EARLY_ACCESS', 'MEMBERS_DISCOUNT');

-- CreateEnum
CREATE TYPE "TicketVisibilityMode" AS ENUM ('VISIBLE', 'HIDDEN', 'MEMBERS_ONLY', 'NEWSLETTER_ONLY', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "TicketTypeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'SOLD_OUT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ISSUED', 'CHECKED_IN', 'CANCELLED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PricingRuleType" AS ENUM ('TIME_WINDOW', 'INVENTORY_THRESHOLD', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "InfluencerApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExperienceInfluencerRole" AS ENUM ('FEATURED_HOST', 'GUEST_HOST', 'PARTNER_PERSONALITY', 'SPECIAL_GUEST');

-- CreateEnum
CREATE TYPE "WaitlistSource" AS ENUM ('EVENT_PAGE', 'COUNTDOWN', 'NEWSLETTER', 'SOLD_OUT_PAGE');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('ACTIVE', 'NOTIFIED', 'CONVERTED', 'EXPIRED', 'REMOVED');

-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('EXPLORER', 'INSIDER', 'PATRON', 'FOUNDER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckinMethod" AS ENUM ('QR', 'MANUAL', 'ADMIN_OVERRIDE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventLogType" ADD VALUE 'EXPERIENCE_VIEWED';
ALTER TYPE "EventLogType" ADD VALUE 'WAITLIST_JOINED';
ALTER TYPE "EventLogType" ADD VALUE 'NEWSLETTER_JOINED';
ALTER TYPE "EventLogType" ADD VALUE 'CHECKIN_COMPLETED';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'DEMO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SeriesStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "SeriesStatus" ADD VALUE 'SOLD_OUT';
ALTER TYPE "SeriesStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "SeriesStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "OrderLineItem" DROP CONSTRAINT "OrderLineItem_ticketTypeId_fkey";

-- AlterTable
ALTER TABLE "InfluencerProfile" ADD COLUMN     "approvalStatus" "InfluencerApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "longBio" TEXT,
ADD COLUMN     "profileImageUrl" TEXT,
ADD COLUMN     "shortBio" TEXT,
ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "websiteUrl" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;

-- AlterTable
ALTER TABLE "OrderLineItem" ADD COLUMN     "addonId" TEXT,
ADD COLUMN     "itemType" TEXT NOT NULL DEFAULT 'ticket',
ADD COLUMN     "nameSnapshot" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "ticketTypeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "attendeeListMode" "AttendeeListMode" NOT NULL DEFAULT 'HIDDEN',
ADD COLUMN     "availableSeatsMode" "AvailableSeatsMode" NOT NULL DEFAULT 'HIDDEN',
ADD COLUMN     "capacityReserved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "capacitySold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "capacityTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "countdownLabel" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "earlyReleaseAt" TIMESTAMP(3),
ADD COLUMN     "galleryJson" JSONB,
ADD COLUMN     "geoLat" DOUBLE PRECISION,
ADD COLUMN     "geoLng" DOUBLE PRECISION,
ADD COLUMN     "heroImageUrl" TEXT,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "membershipRuleMode" "MembershipRuleMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "newsletterCaptureEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicReleaseAt" TIMESTAMP(3),
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "showCountdown" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "venueAddress" TEXT,
ADD COLUMN     "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "attendeeEmail" TEXT,
ADD COLUMN     "attendeeName" TEXT,
ADD COLUMN     "checkedInById" TEXT,
ADD COLUMN     "isPubliclyVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ticketStatus" "TicketStatus" NOT NULL DEFAULT 'ISSUED',
ADD COLUMN     "ticketTypeId" TEXT;

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "earlyAccessOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minPerOrder" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "requiresMembership" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saleEndsAt" TIMESTAMP(3),
ADD COLUMN     "saleStartsAt" TIMESTAMP(3),
ADD COLUMN     "soldCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ticketStatus" "TicketTypeStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tierCode" TEXT,
ADD COLUMN     "visibilityMode" "TicketVisibilityMode" NOT NULL DEFAULT 'VISIBLE';

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL DEFAULT 'EXPLORER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "benefitsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceInfluencer" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "influencerProfileId" TEXT NOT NULL,
    "roleLabel" "ExperienceInfluencerRole" NOT NULL DEFAULT 'FEATURED_HOST',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPubliclyVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceInfluencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPricingRule" (
    "id" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "ruleType" "PricingRuleType" NOT NULL,
    "conditionJson" JSONB NOT NULL,
    "actionJson" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketPricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceAddon" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "capacity" INTEGER,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "requiresTicketTypeId" TEXT,
    "requiresMembership" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceAddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceCheckin" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "checkedInById" TEXT NOT NULL,
    "method" "CheckinMethod" NOT NULL DEFAULT 'QR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryHold" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceWaitlist" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "source" "WaitlistSource" NOT NULL DEFAULT 'EVENT_PAGE',
    "status" "WaitlistStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscription" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "segmentKey" TEXT NOT NULL DEFAULT 'general',
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceAnalyticsDaily" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "checkoutStarts" INTEGER NOT NULL DEFAULT 0,
    "ordersPaid" INTEGER NOT NULL DEFAULT 0,
    "ticketsSold" INTEGER NOT NULL DEFAULT 0,
    "addonUnitsSold" INTEGER NOT NULL DEFAULT 0,
    "grossRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "waitlistSignups" INTEGER NOT NULL DEFAULT 0,
    "newsletterSignups" INTEGER NOT NULL DEFAULT 0,
    "memberPurchases" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceAnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceInfluencer_seriesId_influencerProfileId_key" ON "ExperienceInfluencer"("seriesId", "influencerProfileId");

-- CreateIndex
CREATE INDEX "TicketPricingRule_ticketTypeId_priority_idx" ON "TicketPricingRule"("ticketTypeId", "priority");

-- CreateIndex
CREATE INDEX "ExperienceCheckin_sessionId_createdAt_idx" ON "ExperienceCheckin"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryHold_ticketTypeId_expiresAt_idx" ON "InventoryHold"("ticketTypeId", "expiresAt");

-- CreateIndex
CREATE INDEX "ExperienceWaitlist_seriesId_status_idx" ON "ExperienceWaitlist"("seriesId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceWaitlist_seriesId_email_key" ON "ExperienceWaitlist"("seriesId", "email");

-- CreateIndex
CREATE INDEX "NewsletterSubscription_segmentKey_isActive_idx" ON "NewsletterSubscription"("segmentKey", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscription_email_segmentKey_key" ON "NewsletterSubscription"("email", "segmentKey");

-- CreateIndex
CREATE INDEX "ExperienceAnalyticsDaily_seriesId_date_idx" ON "ExperienceAnalyticsDaily"("seriesId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceAnalyticsDaily_seriesId_date_key" ON "ExperienceAnalyticsDaily"("seriesId", "date");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceInfluencer" ADD CONSTRAINT "ExperienceInfluencer_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceInfluencer" ADD CONSTRAINT "ExperienceInfluencer_influencerProfileId_fkey" FOREIGN KEY ("influencerProfileId") REFERENCES "InfluencerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPricingRule" ADD CONSTRAINT "TicketPricingRule_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceAddon" ADD CONSTRAINT "ExperienceAddon_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "ExperienceAddon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceCheckin" ADD CONSTRAINT "ExperienceCheckin_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceCheckin" ADD CONSTRAINT "ExperienceCheckin_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceCheckin" ADD CONSTRAINT "ExperienceCheckin_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceWaitlist" ADD CONSTRAINT "ExperienceWaitlist_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceWaitlist" ADD CONSTRAINT "ExperienceWaitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterSubscription" ADD CONSTRAINT "NewsletterSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceAnalyticsDaily" ADD CONSTRAINT "ExperienceAnalyticsDaily_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
