-- Permit eligible customer tokens to remain unclaimed until link verification.
ALTER TABLE "PasswordlessToken"
ALTER COLUMN "userId" DROP NOT NULL,
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';