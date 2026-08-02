-- Add beneficiary preference to opt out of informational status-change emails.
-- Action-required transitions (ON_HOLD, REJECTED) ignore this flag in code.
ALTER TABLE "BeneficiaryProfile"
  ADD COLUMN "statusEmailOptOut" BOOLEAN NOT NULL DEFAULT false;
