-- Repair the migration chain for BeneficiaryProfile.
-- Production already has this table from a historical schema push; IF NOT EXISTS
-- preserves that data. Fresh databases need the table before the documents
-- migration creates its foreign key.
DO $$ BEGIN
  CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BeneficiaryDocStatus" AS ENUM ('NOT_REQUIRED', 'MISSING', 'RECEIVED', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BankReadinessStatus" AS ENUM ('MISSING_INFO', 'READY_FOR_REVIEW', 'OKU_APPROVED', 'AWAITING_BANK_CONFIRMATION', 'BANK_READY', 'REJECTED', 'ON_HOLD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BeneficiaryProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "banescoAccountNumberEncrypted" TEXT,
  "banescoAccountLast4" TEXT,
  "bankName" TEXT,
  "accountHolderName" TEXT,
  "accountType" "BankAccountType",
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "swiftBic" TEXT,
  "proofOfAddressStatus" "BeneficiaryDocStatus" NOT NULL DEFAULT 'MISSING',
  "identificationStatus" "BeneficiaryDocStatus" NOT NULL DEFAULT 'MISSING',
  "taxOrRucStatus" "BeneficiaryDocStatus" NOT NULL DEFAULT 'MISSING',
  "sourceOfFundsStatus" "BeneficiaryDocStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "incomeCertificationRequired" BOOLEAN NOT NULL DEFAULT false,
  "incomeCertificationExpiresAt" TIMESTAMP(3),
  "bankReadinessStatus" "BankReadinessStatus" NOT NULL DEFAULT 'MISSING_INFO',
  "complianceHoldReason" TEXT,
  "adminVerificationNotes" TEXT,
  "okuApprovedAt" TIMESTAMP(3),
  "okuApprovedById" TEXT,
  "bankReadyAt" TIMESTAMP(3),
  "bankReadyById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BeneficiaryProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BeneficiaryProfile_userId_key" ON "BeneficiaryProfile"("userId");
CREATE INDEX IF NOT EXISTS "BeneficiaryProfile_bankReadinessStatus_idx" ON "BeneficiaryProfile"("bankReadinessStatus");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BeneficiaryProfile_userId_fkey') THEN
    ALTER TABLE "BeneficiaryProfile" ADD CONSTRAINT "BeneficiaryProfile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BeneficiaryProfile_okuApprovedById_fkey') THEN
    ALTER TABLE "BeneficiaryProfile" ADD CONSTRAINT "BeneficiaryProfile_okuApprovedById_fkey"
      FOREIGN KEY ("okuApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BeneficiaryProfile_bankReadyById_fkey') THEN
    ALTER TABLE "BeneficiaryProfile" ADD CONSTRAINT "BeneficiaryProfile_bankReadyById_fkey"
      FOREIGN KEY ("bankReadyById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
