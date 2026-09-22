ALTER TYPE "RoleKey" ADD VALUE IF NOT EXISTS 'PARTNER_SELLER';

INSERT INTO "Role" ("key", "label", "createdAt")
VALUES ('PARTNER_SELLER', 'Partner Seller', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "label" = EXCLUDED."label";

-- Existing provisioned seller seats must receive the same restricted portal
-- role as newly invited sellers. UserRole IDs are opaque application IDs.
INSERT INTO "UserRole" ("id", "userId", "roleKey", "createdAt")
SELECT
  CONCAT('psr_', MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || seat."id")),
  seat."provisionedUserId",
  'PARTNER_SELLER',
  CURRENT_TIMESTAMP
FROM "PartnerCommerceSeat" AS seat
WHERE seat."provisionedUserId" IS NOT NULL
  AND seat."status" <> 'REVOKED'
ON CONFLICT ("userId", "roleKey") DO NOTHING;
