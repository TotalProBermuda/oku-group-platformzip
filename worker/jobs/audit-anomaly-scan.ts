import type { Job } from "bullmq";
import { runAuditAnomalyScan } from "../../src/server/audit/anomalyAlerter";

/**
 * BullMQ handler for the audit-log anomaly scan. Thin wrapper — all logic
 * lives in `anomalyAlerter.runAuditAnomalyScan` so it can also be invoked
 * from tests and an admin "scan now" button without going through Redis.
 */
export async function handleAuditAnomalyScanJob(job: Job): Promise<unknown> {
  console.log("[audit-anomaly] starting", job.id, job.name);
  const result = await runAuditAnomalyScan();
  console.log("[audit-anomaly] finished", result);
  return result;
}
