-- Make commission eligibility explicit on the canonical ReferralActor.
-- Existing actors are conservatively classified from their commercial persona;
-- all other types remain attribution-only until a SUPERADMIN opts them in.
ALTER TYPE "UserAdminAction" ADD VALUE IF NOT EXISTS 'REFERRER_COMMISSION_PROGRAM_UPDATED';

ALTER TABLE "ReferralActor"
  ADD COLUMN IF NOT EXISTS "commissionEligible" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ReferralActor"
SET
  "commissionEligible" = true,
  "commissionTier" = CASE
    WHEN "actorType" IN ('TAXI_DRIVER', 'UBER_DRIVER') THEN 'STANDARD'::"CommissionTierType"
    WHEN "actorType" = 'TOUR_GUIDE' THEN 'TRUSTED'::"CommissionTierType"
    WHEN "actorType" = 'HOTEL_CONCIERGE' THEN 'PREMIUM'::"CommissionTierType"
    ELSE "commissionTier"
  END
WHERE "actorType" IN ('TAXI_DRIVER', 'UBER_DRIVER', 'TOUR_GUIDE', 'HOTEL_CONCIERGE');

UPDATE "ReferralActor"
SET "commissionEligible" = false
WHERE "actorType" = 'STREETSIDE_HOST';

-- Install the approved global policy as new immutable versions. Previous
-- versions remain available to explain historical allocations.
UPDATE "CommissionRule"
SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "scopeType" = 'GLOBAL'
  AND "scopeId" IS NULL
  AND "tier" IN ('STANDARD', 'TRUSTED', 'PREMIUM', 'PRIVATE_EVENT')
  AND "active" = true;

INSERT INTO "CommissionRule" (
  "id", "tier", "scopeType", "scopeId", "revenueBasis",
  "percentageBps", "percentageCapCents", "perPersonCents",
  "maxTakeRateBps", "version", "active", "label", "createdAt", "updatedAt"
) VALUES
  (
    'policy_20260906_standard', 'STANDARD', 'GLOBAL', NULL, 'COMMISSIONABLE_CENTS',
    500, 7500, NULL, 500,
    (SELECT COALESCE(MAX("version"), 0) + 1 FROM "CommissionRule" WHERE "scopeType" = 'GLOBAL' AND "scopeId" IS NULL AND "tier" = 'STANDARD'),
    true, 'Driver / open network — 5% up to $75', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'policy_20260906_trusted', 'TRUSTED', 'GLOBAL', NULL, 'COMMISSIONABLE_CENTS',
    1000, 25000, NULL, 1000,
    (SELECT COALESCE(MAX("version"), 0) + 1 FROM "CommissionRule" WHERE "scopeType" = 'GLOBAL' AND "scopeId" IS NULL AND "tier" = 'TRUSTED'),
    true, 'Verified tour guide — 10% up to $250', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'policy_20260906_premium', 'PREMIUM', 'GLOBAL', NULL, 'COMMISSIONABLE_CENTS',
    1000, 35000, NULL, 1000,
    (SELECT COALESCE(MAX("version"), 0) + 1 FROM "CommissionRule" WHERE "scopeType" = 'GLOBAL' AND "scopeId" IS NULL AND "tier" = 'PREMIUM'),
    true, 'Premium hotel concierge / doorman — 10% up to $350', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'policy_20260906_private_event', 'PRIVATE_EVENT', 'GLOBAL', NULL, 'MANUAL_REVIEW',
    0, NULL, NULL, NULL,
    (SELECT COALESCE(MAX("version"), 0) + 1 FROM "CommissionRule" WHERE "scopeType" = 'GLOBAL' AND "scopeId" IS NULL AND "tier" = 'PRIVATE_EVENT'),
    true, 'Strategic events — negotiated rule required', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
