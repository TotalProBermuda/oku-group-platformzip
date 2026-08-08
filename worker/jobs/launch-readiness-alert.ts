import type { Job } from "bullmq";
import { runLaunchReadinessAlertScan } from "../../src/server/launchReadiness/launchReadinessAlertService";

/**
 * BullMQ handler for launch-readiness verdict-transition alerts. Thin
 * wrapper — all logic lives in `runLaunchReadinessAlertScan` so it can
 * be invoked from tests and an admin "run now" button without going
 * through Redis.
 */
export async function handleLaunchReadinessAlertJob(job: Job): Promise<unknown> {
  console.log("[launch-readiness-alert] starting", job.id, job.name);
  const result = await runLaunchReadinessAlertScan();
  console.log("[launch-readiness-alert] finished", result);
  return result;
}
