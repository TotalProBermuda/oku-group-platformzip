import type { Job } from "bullmq";
import { runRetentionSweep } from "../../src/server/privacy/retentionWorker";

/**
 * BullMQ handler for the daily privacy retention sweep. Thin wrapper around
 * `runRetentionSweep()` — all per-table policy lives in the service so it
 * can be invoked from tests + an admin "run now" button without going
 * through Redis.
 */
export async function handleRetentionSweepJob(job: Job): Promise<unknown> {
  console.log("[retention-sweep] starting", job.id, job.name);
  const result = await runRetentionSweep();
  console.log("[retention-sweep] finished", {
    paused: result.paused,
    steps: result.steps.map((s) => ({
      step: s.step,
      scanned: s.scanned,
      affected: s.affected,
      skipped: s.skipped,
      notes: s.notes,
    })),
  });
  return result;
}
