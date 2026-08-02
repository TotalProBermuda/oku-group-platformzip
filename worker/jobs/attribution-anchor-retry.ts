import type { Job } from "bullmq";
import { prisma } from "../../src/lib/prisma";
import { emitLedgerEvent } from "../../src/server/services/ledger/ledgerEventService";
import { attributionAnchorQueue } from "../../src/server/queue/queue";

/**
 * Maximum number of retry attempts before a PENDING_ATTRIBUTION session is
 * escalated to FAILED_REVIEW so an admin must manually resolve it.
 */
const MAX_RETRIES = 5;

export interface AttributionAnchorRetryJobData {
  /** Set for individual retry jobs. Absent for sweep jobs. */
  attributionSessionId?: string;
}

/**
 * Idempotently ensure all anchor-side writes exist for a session's referrer
 * context. Called by both the retry job and the admin manual-resolve action.
 *
 * Performs the concrete writes that may have failed at booking time:
 *   - ReservationAttribution (if legacyReferrerId is set and row is missing)
 *   - CommissionSuggestion   (if legacyReferrerId is set and row is missing)
 *
 * Uses upsert / conflict-safe writes to tolerate concurrent retry invocations.
 * Throws on unrecoverable failures (missing actors, missing reservation).
 * The caller handles escalation vs. retry.
 */
export async function ensureAnchorWrites(session: {
  id: string;
  reservationId: string | null;
  referralActorId: string | null;
  legacyReferrerId: string | null;
}): Promise<void> {
  const hasReferrer = !!(session.referralActorId || session.legacyReferrerId);
  if (!hasReferrer) {
    throw new Error("Session has no referralActorId or legacyReferrerId — cannot anchor");
  }

  // Verify actors still exist (guard against manual deletions between writes).
  if (session.referralActorId) {
    const actor = await prisma.referralActor.findUnique({
      where: { id: session.referralActorId },
      select: { id: true },
    });
    if (!actor) throw new Error(`ReferralActor ${session.referralActorId} no longer exists`);
  }
  if (session.legacyReferrerId) {
    const referrer = await prisma.referrer.findUnique({
      where: { id: session.legacyReferrerId },
      select: { id: true },
    });
    if (!referrer) throw new Error(`Referrer ${session.legacyReferrerId} no longer exists`);
  }

  // Re-run the legacy attribution and commission suggestion writes idempotently.
  // Only applies when a legacyReferrerId + reservationId are both present.
  if (session.legacyReferrerId && session.reservationId) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: session.reservationId },
      select: { id: true, partySize: true, conceptRequested: true },
    });
    if (!reservation) {
      throw new Error(`Reservation ${session.reservationId} no longer exists`);
    }

    const legacyReferrer = await prisma.referrer.findUnique({
      where: { id: session.legacyReferrerId },
      select: { compensationPlanId: true },
    });

    // ReservationAttribution — idempotent via P2002 catch on the partial unique
    // index (reservationId, referrerId) WHERE referrerId IS NOT NULL.
    try {
      await prisma.reservationAttribution.create({
        data: {
          reservationId: session.reservationId,
          referrerId: session.legacyReferrerId,
          sourceType: "UMBRELLA_SITE",
          commissionEligible: true,
          conversionStage: "REFERRED_UPSTAIRS",
        },
      });
    } catch (err: unknown) {
      // P2002 = unique constraint — row already exists, safe to continue.
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
    }

    // CommissionSuggestion — idempotent via upsert on the @@unique constraint
    // ([reservationId, referrerId]).
    await prisma.commissionSuggestion.upsert({
      where: {
        reservationId_referrerId: {
          reservationId: session.reservationId,
          referrerId: session.legacyReferrerId,
        },
      },
      create: {
        reservationId: session.reservationId,
        referrerId: session.legacyReferrerId,
        compensationPlanId: legacyReferrer?.compensationPlanId ?? null,
        suggestedAmountCents: (reservation.partySize ?? 0) * 250,
        status: "SUGGESTED",
        rationaleJson: {
          partySize: reservation.partySize,
          conceptKey: reservation.conceptRequested,
          flatPerCover: 250,
        },
      },
      // If the row already exists, leave all fields as-is — the original write
      // already recorded the correct data; we only needed to create it once.
      update: {},
    });
  }
}

/**
 * BullMQ handler for attribution anchor retry jobs.
 *
 * Two job types:
 *  1. `attribution_anchor_retry` (has `attributionSessionId`): retries a
 *     specific PENDING_ATTRIBUTION session.
 *  2. `attribution-anchor-sweep` (no `attributionSessionId`): picks up all
 *     PENDING_ATTRIBUTION sessions that were missed by the at-booking enqueue
 *     (e.g. Redis was unavailable) and enqueues individual retry jobs.
 *
 * Retry mechanics:
 *  - Each run stamps anchorLastAttemptAt and increments anchorRetryCount.
 *  - Success path: `ensureAnchorWrites` completes all missing writes → flip
 *    to ANCHORED, stamp anchorResolvedAt, emit ATTRIBUTION_ANCHOR_RESOLVED.
 *  - After MAX_RETRIES failures: flip to FAILED_REVIEW, preserve anchorLastError,
 *    emit ATTRIBUTION_ANCHOR_FAILED; admin must manually resolve.
 */
export async function handleAttributionAnchorRetryJob(
  job: Job<AttributionAnchorRetryJobData>
): Promise<{ outcome: "anchored" | "failed_review" | "already_resolved" | "not_found" | "sweep_enqueued" }> {
  const { attributionSessionId } = job.data;

  // ── Sweep mode: no specific session; find all missed PENDING sessions ────
  if (!attributionSessionId) {
    console.log("[attribution-anchor-sweep] scanning for missed PENDING_ATTRIBUTION sessions", job.id);
    const pending = await prisma.attributionSession.findMany({
      where: {
        anchorStatus: "PENDING_ATTRIBUTION",
        // Only pick up sessions not attempted in the last 5 min to avoid
        // racing with jobs already in-flight from the at-booking enqueue.
        OR: [
          { anchorLastAttemptAt: null },
          { anchorLastAttemptAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
        ],
      },
      select: { id: true },
      take: 200,
    });

    if (attributionAnchorQueue && pending.length > 0) {
      const jobs = pending.map((s) => ({
        name: "attribution_anchor_retry" as const,
        data: { attributionSessionId: s.id },
        opts: { attempts: MAX_RETRIES, backoff: { type: "exponential" as const, delay: 10_000 } },
      }));
      await attributionAnchorQueue.addBulk(jobs);
    } else if (!attributionAnchorQueue) {
      // No Redis — run inline for each session.
      for (const s of pending) {
        await handleAttributionAnchorRetryJob({
          ...job,
          data: { attributionSessionId: s.id },
        } as Job<AttributionAnchorRetryJobData>);
      }
    }

    console.log("[attribution-anchor-sweep] enqueued", pending.length, "retry jobs");
    return { outcome: "sweep_enqueued" };
  }

  console.log("[attribution-anchor-retry] starting", job.id, attributionSessionId);

  const session = await prisma.attributionSession.findUnique({
    where: { id: attributionSessionId },
    select: {
      id: true,
      anchorStatus: true,
      anchorRetryCount: true,
      reservationId: true,
      referralActorId: true,
      legacyReferrerId: true,
      referralLinkId: true,
      source: true,
    },
  });

  if (!session) {
    console.warn("[attribution-anchor-retry] session not found", attributionSessionId);
    return { outcome: "not_found" };
  }

  if (session.anchorStatus === "ANCHORED" || session.anchorStatus === "FAILED_REVIEW") {
    console.log("[attribution-anchor-retry] already resolved", attributionSessionId, session.anchorStatus);
    return { outcome: "already_resolved" };
  }

  const newRetryCount = session.anchorRetryCount + 1;
  // Stamp the attempt time before running writes so any crash during writes
  // is visible in the retry count and not silently missed by the sweep query.
  await prisma.attributionSession.update({
    where: { id: session.id },
    data: { anchorRetryCount: newRetryCount, anchorLastAttemptAt: new Date() },
  });

  try {
    // Run all anchor-side writes idempotently. This creates any missing
    // ReservationAttribution / CommissionSuggestion rows and verifies that
    // the referrer chain is still intact. Throws on unrecoverable failures.
    await ensureAnchorWrites(session);

    // All writes completed — flip to ANCHORED.
    const now = new Date();
    await prisma.attributionSession.update({
      where: { id: session.id },
      data: {
        anchorStatus: "ANCHORED",
        anchorLastAttemptAt: now,
        anchorResolvedAt: now,
        anchorLastError: null,
      },
    });

    await emitLedgerEvent({
      eventType: "ATTRIBUTION_ANCHOR_RESOLVED",
      source: { system: "attribution_anchor_retry" },
      confidenceClass: "PARTNER_REPORTED_EVENT",
      idempotencyKey: `attribution_session:${session.id}:anchor_resolved`,
      attributionSessionId: session.id,
      reservationId: session.reservationId ?? null,
      payload: {
        retryCount: newRetryCount,
        referralActorId: session.referralActorId ?? null,
        legacyReferrerId: session.legacyReferrerId ?? null,
      },
    });

    console.log("[attribution-anchor-retry] anchored successfully", attributionSessionId);
    return { outcome: "anchored" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      "[attribution-anchor-retry] attempt failed",
      { attributionSessionId, attempt: newRetryCount, err: errorMessage }
    );

    if (newRetryCount >= MAX_RETRIES) {
      // Exhausted retries — escalate to FAILED_REVIEW for admin resolution.
      const now = new Date();
      await prisma.attributionSession.update({
        where: { id: session.id },
        data: {
          anchorStatus: "FAILED_REVIEW",
          anchorLastAttemptAt: now,
          anchorLastError: errorMessage,
        },
      });

      await emitLedgerEvent({
        eventType: "ATTRIBUTION_ANCHOR_FAILED",
        source: { system: "attribution_anchor_retry" },
        confidenceClass: "MANUAL_REVIEW_EVENT",
        idempotencyKey: `attribution_session:${session.id}:anchor_failed`,
        attributionSessionId: session.id,
        reservationId: session.reservationId ?? null,
        payload: {
          retryCount: newRetryCount,
          finalError: errorMessage,
          referralActorId: session.referralActorId ?? null,
          legacyReferrerId: session.legacyReferrerId ?? null,
        },
      });

      console.log("[attribution-anchor-retry] escalated to FAILED_REVIEW", attributionSessionId);
      return { outcome: "failed_review" };
    }

    // Preserve error state and re-throw so BullMQ retries the job.
    await prisma.attributionSession.update({
      where: { id: session.id },
      data: { anchorLastError: errorMessage },
    });

    throw err;
  }
}
