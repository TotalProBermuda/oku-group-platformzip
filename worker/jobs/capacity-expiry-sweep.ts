import type { Job } from "bullmq";
import { expireStaleHolds } from "../../src/server/spaces/capacityService";

/**
 * BullMQ handler for the periodic capacity hold expiry sweep.
 * Transitions ACTIVE CapacityHolds to EXPIRED when their service window has
 * passed with no terminal status. Thin wrapper — all logic lives in
 * capacityService so it can be invoked from admin triggers or tests too.
 */
export async function handleCapacityExpirySweepJob(job: Job): Promise<unknown> {
  console.log("[capacity-expiry-sweep] starting", job.id, job.name);
  const expired = await expireStaleHolds();
  console.log("[capacity-expiry-sweep] finished", { expired });
  return { expired };
}
