-- CreateEnum
CREATE TYPE "BeneficiaryDocumentType" AS ENUM ('PROOF_OF_ADDRESS', 'IDENTIFICATION', 'TAX_OR_RUC', 'SOURCE_OF_FUNDS', 'INCOME_CERTIFICATION');

-- CreateEnum
CREATE TYPE "BeneficiaryDocScanStatus" AS ENUM ('PENDING', 'CLEAN', 'REJECTED');

-- CreateTable
CREATE TABLE "BeneficiaryDocument" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "docType" "BeneficiaryDocumentType" NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "objectPath" TEXT NOT NULL,
    "scanStatus" "BeneficiaryDocScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanMessage" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BeneficiaryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiaryDocument_objectPath_key" ON "BeneficiaryDocument"("objectPath");

-- CreateIndex
CREATE INDEX "BeneficiaryDocument_profileId_deletedAt_idx" ON "BeneficiaryDocument"("profileId", "deletedAt");

-- CreateIndex
CREATE INDEX "BeneficiaryDocument_profileId_docType_idx" ON "BeneficiaryDocument"("profileId", "docType");

-- AddForeignKey
ALTER TABLE "BeneficiaryDocument" ADD CONSTRAINT "BeneficiaryDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BeneficiaryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryDocument" ADD CONSTRAINT "BeneficiaryDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
