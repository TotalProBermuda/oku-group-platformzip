-- Persisted point-in-time snapshots of getLaunchReadiness() (Task #131).
-- Powers the "Recent history" section on /admin/launch-readiness so operators
-- can spot gates flipping pass/fail between deploys. Rows older than 90 days
-- are pruned best-effort in application code on every persist call.
CREATE TABLE "LaunchReadinessSnapshot" (
    "id" TEXT NOT NULL,
    "overall" TEXT NOT NULL,
    "gates" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaunchReadinessSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LaunchReadinessSnapshot_checkedAt_idx"
  ON "LaunchReadinessSnapshot"("checkedAt");
