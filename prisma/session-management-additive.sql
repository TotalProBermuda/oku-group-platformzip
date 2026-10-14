-- REVIEW ONLY. Do not execute against production/shared databases in this task.
ALTER TABLE "Series" ADD COLUMN "sessionDefaults" JSONB;
ALTER TABLE "Session" ADD COLUMN "fieldModes" JSONB;
ALTER TABLE "Order" ADD COLUMN "entitlementSnapshot" JSONB, ADD COLUMN "checkoutLocale" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "entitlementSnapshot" JSONB;
CREATE TABLE "SessionManagementChange" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE,
  "actorId" TEXT NOT NULL, "seriesId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PREVIEW',
  "payload" JSONB NOT NULL, "snapshotHash" TEXT NOT NULL,
  "preview" JSONB NOT NULL, "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "appliedAt" TIMESTAMP(3)
);
CREATE INDEX "SessionManagementChange_seriesId_createdAt_idx" ON "SessionManagementChange"("seriesId", "createdAt");
CREATE TABLE "SessionAttendeeNotice" (
  "id" TEXT PRIMARY KEY, "changeId" TEXT NOT NULL REFERENCES "SessionManagementChange"("id"),
  "sessionId" TEXT NOT NULL, "recipientKey" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL, "locale" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'HELD', "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("changeId", "recipientKey")
);
CREATE INDEX "SessionAttendeeNotice_state_createdAt_idx" ON "SessionAttendeeNotice"("state", "createdAt");
