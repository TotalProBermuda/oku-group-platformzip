-- Store only one-way token hashes. Raw magic-link credentials never enter the database.
CREATE TYPE "PasswordlessTokenPurpose" AS ENUM ('SIGN_IN', 'REFERRER_INVITE');

CREATE TABLE "PasswordlessToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "PasswordlessTokenPurpose" NOT NULL DEFAULT 'SIGN_IN',
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "callbackUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordlessToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Reservation"
ADD COLUMN "contactEmailNormalized" TEXT,
ADD COLUMN "customerLocale" TEXT NOT NULL DEFAULT 'en';

ALTER TABLE "Ticket"
ADD COLUMN "attendeeEmailNormalized" TEXT;

UPDATE "Reservation"
SET "contactEmailNormalized" = LOWER(BTRIM("contactEmail"))
WHERE "contactEmail" IS NOT NULL;

UPDATE "Ticket"
SET "attendeeEmailNormalized" = LOWER(BTRIM("attendeeEmail"))
WHERE "attendeeEmail" IS NOT NULL;

CREATE UNIQUE INDEX "PasswordlessToken_tokenHash_key"
ON "PasswordlessToken"("tokenHash");

CREATE INDEX "PasswordlessToken_email_purpose_createdAt_idx"
ON "PasswordlessToken"("email", "purpose", "createdAt");

CREATE INDEX "PasswordlessToken_userId_purpose_createdAt_idx"
ON "PasswordlessToken"("userId", "purpose", "createdAt");

CREATE INDEX "PasswordlessToken_expiresAt_idx"
ON "PasswordlessToken"("expiresAt");

CREATE INDEX "Reservation_contactEmailNormalized_reservationDate_idx"
ON "Reservation"("contactEmailNormalized", "reservationDate");

CREATE INDEX "Ticket_attendeeEmailNormalized_createdAt_idx"
ON "Ticket"("attendeeEmailNormalized", "createdAt");

ALTER TABLE "PasswordlessToken"
ADD CONSTRAINT "PasswordlessToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;