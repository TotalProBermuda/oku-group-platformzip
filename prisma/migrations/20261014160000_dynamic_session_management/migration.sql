-- Additive only. Authored for review; NOT applied to any shared/production DB.
ALTER TABLE "Series" ADD COLUMN "sessionDefaults" JSONB;
ALTER TABLE "Session" ADD COLUMN "fieldModes" JSONB;
ALTER TABLE "Order" ADD COLUMN "entitlementSnapshot" JSONB, ADD COLUMN "checkoutLocale" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "entitlementSnapshot" JSONB;

CREATE TABLE "SessionManagementChange" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PREVIEW',
  "payload" JSONB NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "preview" JSONB NOT NULL,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "SessionManagementChange_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionManagementChange_requestId_key" ON "SessionManagementChange"("requestId");
CREATE INDEX "SessionManagementChange_seriesId_createdAt_idx" ON "SessionManagementChange"("seriesId", "createdAt");

CREATE TABLE "SessionAttendeeNotice" (
  "id" TEXT NOT NULL,
  "changeId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "recipientKey" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'HELD',
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionAttendeeNotice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionAttendeeNotice_changeId_recipientKey_key" ON "SessionAttendeeNotice"("changeId", "recipientKey");
CREATE INDEX "SessionAttendeeNotice_state_createdAt_idx" ON "SessionAttendeeNotice"("state", "createdAt");
ALTER TABLE "SessionAttendeeNotice" ADD CONSTRAINT "SessionAttendeeNotice_changeId_fkey"
  FOREIGN KEY ("changeId") REFERENCES "SessionManagementChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
