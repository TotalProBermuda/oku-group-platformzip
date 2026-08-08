import { Job } from "bullmq";
import { runInvuSyncForVenue, runInvuSyncForAllEnabledVenues } from "../../src/server/services/invu/invuSyncService";

export async function handleInvuSyncJob(job: Job): Promise<void> {
  const { venueId, branchMappingId, syncRunId } = job.data ?? {};

  if (venueId && branchMappingId) {
    console.log(`[invu-sync] Running venue sync: venueId=${venueId} branchMappingId=${branchMappingId} existingSyncRunId=${syncRunId ?? "none"}`);
    await runInvuSyncForVenue(venueId, branchMappingId, typeof syncRunId === "string" ? syncRunId : undefined);
  } else {
    console.log("[invu-sync] Running fan-out sync for all enabled venues");
    await runInvuSyncForAllEnabledVenues();
  }
}
