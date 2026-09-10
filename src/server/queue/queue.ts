import { Queue } from "bullmq";

const hasRedis = !!process.env.REDIS_URL;

// Connection shape consumed by both Queue() and Worker() constructors.
// When REDIS_URL is unset we never construct any of them, but we keep this
// export typed so callers (worker/index.ts) can still import without
// branching at the import site.
export const redisConnection = hasRedis
  ? {
      connection: {
        url: process.env.REDIS_URL!,
        lazyConnect: false,
        maxRetriesPerRequest: null,
        enableOfflineQueue: true,
      },
    }
  : ({ connection: { url: "" } } as { connection: { url: string } });

if (!hasRedis) {
  console.warn("REDIS_URL not set. BullMQ will use inline job execution fallback.");
}

// Queue construction is gated on REDIS_URL. Without this gate, BullMQ's
// internal blocking-mode (`bclient`) ioredis connections ignore lazyConnect
// and start dialing redis://localhost:6379 the moment a Queue object exists,
// which floods `next build`'s "Collecting page data" phase with ECONNREFUSED.
// safeEnqueue() and enqueueTranslations() already have inline fallbacks for
// the !REDIS_URL case, so the Queue references are unused in that path.
export const commerceQueue: Queue | null = hasRedis
  ? new Queue("commerce", redisConnection)
  : null;
export const translationQueue: Queue | null = hasRedis
  ? new Queue("translation", redisConnection)
  : null;
export const invuSyncQueue: Queue | null = hasRedis
  ? new Queue("invu-sync", redisConnection)
  : null;
// Recurring queue for daily INVU access-token rotation. Tokens are rotated
// every 14 days on a per-credential basis (see worker/jobs/invu-token-rotation).
// Kept on its own queue so a stuck token rotation can never starve the sync.
export const invuTokenRotationQueue: Queue | null = hasRedis
  ? new Queue("invu-token-rotation", redisConnection)
  : null;
// Daily privacy retention sweep — see src/server/privacy/retentionWorker.ts.
// Kept on its own queue so a stuck sweep can never starve commerce or INVU.
export const retentionSweepQueue: Queue | null = hasRedis
  ? new Queue("retention-sweep", redisConnection)
  : null;
// Audit-log anomaly scan — see src/server/audit/anomalyAlerter.ts.
// Runs every 15 minutes; fires alerts via captureMessage and writes an
// `audit.anomaly.alert` evidence row per signal.
export const auditAnomalyScanQueue: Queue | null = hasRedis
  ? new Queue("audit-anomaly-scan", redisConnection)
  : null;
// Attribution anchor retry — picks up PENDING_ATTRIBUTION sessions and
// attempts to fully anchor them. Escalates to FAILED_REVIEW after N retries.
// Separate queue so a stuck retry never starves commerce or INVU jobs.
export const attributionAnchorQueue: Queue | null = hasRedis
  ? new Queue("attribution-anchor", redisConnection)
  : null;
// Launch-readiness verdict-transition alerts — see
// src/server/launchReadiness/launchReadinessAlertService.ts. Runs every
// 15 minutes; emails SUPERADMIN users on GO↔NO_GO transitions via Resend.
export const launchReadinessAlertQueue: Queue | null = hasRedis
  ? new Queue("launch-readiness-alert", redisConnection)
  : null;
// Capacity hold expiry sweep — transitions ACTIVE CapacityHolds to EXPIRED
// when the service window has passed. Runs every 30 minutes.
export const capacityExpirySweepQueue: Queue | null = hasRedis
  ? new Queue("capacity-expiry-sweep", redisConnection)
  : null;
// Ledger event outbox drain — polls PENDING LedgerEventOutbox rows and
// calls emitLedgerEvent, making the proof trail retryable after transient
// failures. Runs every 60 seconds so failed events surface quickly.
export const ledgerOutboxQueue: Queue | null = hasRedis
  ? new Queue("ledger-outbox-drain", redisConnection)
  : null;

export type CommerceJob =
  | { name: "send_order_email"; data: { orderId: string } }
  | { name: "sync_monday_lead"; data: { entity: string; entityId: string } }
  | { name: "post_payment_event"; data: { orderId: string } };

export type TranslationJob =
  | {
      name: "translate_field";
      data: {
        entityType: string;
        entityId: string;
        fieldName: string;
        sourceLocale: string;
        sourceText: string;
        targetLocale: string;
      };
    }
  | {
      name: "translate_entity";
      data: {
        entityType: string;
        entityId: string;
        fields: Record<string, string>;
        sourceLocale: string;
      };
    };

export type InvuSyncJob = {
  name: "invu_sync";
  data: {
    syncRunId: string;
    credentialId: string;
    scopeType: string;
    userId?: string;
    venueId?: string;
    branchMappingId?: string;
  };
};

/**
 * safeEnqueue: tries to enqueue to BullMQ (Redis).
 * - Commerce jobs fall back to inline execution when Redis is unavailable.
 * - INVU sync jobs (invu_sync) fall back to inline execution when Redis is unavailable,
 *   so manual syncs can still run in environments without a Redis worker.
 */
export async function safeEnqueue(
  name: CommerceJob["name"] | InvuSyncJob["name"],
  data: Record<string, unknown>
): Promise<void> {
  const isInvuJob = name === "invu_sync";

  // Gate on the queue reference itself (the construction-time invariant)
  // rather than re-reading process.env.REDIS_URL. Queues are only constructed
  // when REDIS_URL was set at module load; this avoids a silent fallback if
  // env is mutated post-import.
  const queue = isInvuJob ? invuSyncQueue : commerceQueue;
  if (queue) {
    try {
      await queue.add(name, data, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      });
      return;
    } catch (err) {
      console.warn(`[queue] Redis enqueue failed for ${name}:`, err);
      // Fall through to inline execution
    }
  }

  if (isInvuJob) {
    // Inline fallback — import lazily to avoid circular deps at module load time
    console.warn("[queue] Running INVU sync inline (Redis unavailable):", data);
    try {
      const { runInvuSyncForVenue, runInvuSyncForAllEnabledVenues } = await import(
        "@/server/services/invu/invuSyncService"
      );
      const venueId = typeof data.venueId === "string" ? data.venueId : undefined;
      const branchMappingId = typeof data.branchMappingId === "string" ? data.branchMappingId : undefined;
      const existingSyncRunId = typeof data.syncRunId === "string" ? data.syncRunId : undefined;
      if (venueId && branchMappingId) {
        await runInvuSyncForVenue(venueId, branchMappingId, existingSyncRunId);
      } else {
        await runInvuSyncForAllEnabledVenues();
      }
    } catch (e) {
      console.error("[inline-invu-sync] failed:", e);
    }
    return;
  }

  // Inline execution for commerce jobs — import lazily to avoid circular deps at module load time
  try {
    const { handleSendOrderEmail } = await import("@/server/jobs/commerceHandlers");
    if (name === "send_order_email") {
      const { orderId } = data as { orderId: string };
      handleSendOrderEmail(orderId).catch((e) =>
        console.error("[inline-job] send_order_email failed:", e)
      );
    } else if (name === "post_payment_event") {
      console.log("[inline-job] post_payment_event (stub) for order:", (data as any).orderId);
    } else if (name === "sync_monday_lead") {
      console.log("[inline-job] sync_monday_lead (stub):", data);
    }
  } catch (e) {
    console.error("[inline-job] failed to execute:", name, e);
  }
}

/**
 * Enqueues a translation job for a single entity field across all target locales.
 */
export async function enqueueTranslations(params: {
  entityType: string;
  entityId: string;
  fieldName: string;
  sourceLocale: string;
  sourceText: string;
  targetLocales?: string[];
}): Promise<void> {
  const { entityType, entityId, fieldName, sourceLocale, sourceText, targetLocales = ["es", "pt"] } = params;
  if (!sourceText?.trim()) return;

  // Same construction-time invariant as safeEnqueue — translationQueue is null
  // iff REDIS_URL was unset at module load.
  if (!translationQueue) {
    console.log("[queue] Skipping translation enqueue — no REDIS_URL configured.");
    return;
  }

  for (const targetLocale of targetLocales.filter((l) => l !== sourceLocale)) {
    await translationQueue.add(
      "translate_field",
      { entityType, entityId, fieldName, sourceLocale, sourceText, targetLocale },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
    );
  }
}
