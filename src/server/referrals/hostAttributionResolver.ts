import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Db = typeof prisma | Prisma.TransactionClient;

export type ResolvedHostAttribution = {
  hostProfileId: string;
  referralActorId: string | null;
  legacyReferrerId: string | null;
  legacyEventReferrerAssignmentId: string | null;
  source:
    | "EVENT_REFERRER_ASSIGNMENT"
    | "REFERRAL_ACTOR_BY_USER"
    | "LEGACY_REFERRER_BY_USER"
    | "NONE";
};

/**
 * Resolve the commission-bearing identities for a RestaurantHostProfile.
 *
 * A streetside / restaurant host is the de-facto "referrer" for any
 * reservation they own — but the platform stores commission identities
 * in three overlapping models that exist for legacy reasons:
 *
 *   1. EventReferrerAssignment.assignedHostProfileId  (the canonical
 *      "host link" — Rafael's RAFNH01 lives here). The corresponding
 *      modern ReferralActor row is found via legacyEventReferrerAssignmentId.
 *   2. ReferralActor.userId                          (a host that was
 *      provisioned natively in the v2 stack).
 *   3. Referrer.userId                               (a host that was
 *      provisioned in the legacy v1 stack and never migrated).
 *
 * We probe in the most-specific-first order so a host with both legacy
 * and modern rows always resolves to the modern actor (which carries
 * the EventReferrerAssignment / ReferralAssignment commission % rules).
 */
export async function resolveAttributionForHostProfile(
  hostProfileId: string,
  db: Db = prisma
): Promise<ResolvedHostAttribution> {
  const host = await db.restaurantHostProfile.findUnique({
    where: { id: hostProfileId },
    select: { userId: true },
  });
  if (!host) {
    return {
      hostProfileId,
      referralActorId: null,
      legacyReferrerId: null,
      legacyEventReferrerAssignmentId: null,
      source: "NONE",
    };
  }

  // 1. Most precise: a ReferralActor whose legacy EventReferrerAssignment
  // is active AND points to this host. We resolve via the ReferralActor
  // side rather than the ERA side because a single host can accumulate
  // multiple ERA rows over time (re-issued codes, partial admin edits)
  // and only ONE of them has a ReferralActor wired up — that one is the
  // real "host link" we want to attribute commission to. Querying through
  // ReferralActor guarantees we pick that row and skips the orphan ERAs.
  const actorViaEra = await db.referralActor.findFirst({
    where: {
      status: "ACTIVE",
      legacyEventReferrerAssignment: {
        is: {
          assignedHostProfileId: hostProfileId,
          status: "ACTIVE",
        },
      },
    },
    select: { id: true, legacyEventReferrerAssignmentId: true, legacyReferrerId: true },
    orderBy: { createdAt: "desc" },
  });
  if (actorViaEra) {
    return {
      hostProfileId,
      referralActorId: actorViaEra.id,
      legacyReferrerId: actorViaEra.legacyReferrerId,
      legacyEventReferrerAssignmentId: actorViaEra.legacyEventReferrerAssignmentId,
      source: "EVENT_REFERRER_ASSIGNMENT",
    };
  }

  // 2. Modern ReferralActor matched directly by user id (no host-link row).
  const actor = await db.referralActor.findFirst({
    where: { userId: host.userId, status: "ACTIVE" },
    select: { id: true, legacyReferrerId: true, legacyEventReferrerAssignmentId: true },
    orderBy: { createdAt: "desc" },
  });
  if (actor) {
    return {
      hostProfileId,
      referralActorId: actor.id,
      legacyReferrerId: actor.legacyReferrerId,
      legacyEventReferrerAssignmentId: actor.legacyEventReferrerAssignmentId,
      source: "REFERRAL_ACTOR_BY_USER",
    };
  }

  // 3. Legacy Referrer (only path some pre-migration hosts have).
  const referrer = await db.referrer.findFirst({
    where: { userId: host.userId, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (referrer) {
    return {
      hostProfileId,
      referralActorId: null,
      legacyReferrerId: referrer.id,
      legacyEventReferrerAssignmentId: null,
      source: "LEGACY_REFERRER_BY_USER",
    };
  }

  return {
    hostProfileId,
    referralActorId: null,
    legacyReferrerId: null,
    legacyEventReferrerAssignmentId: null,
    source: "NONE",
  };
}

export type EnsureHostAttributionResult = {
  resolved: ResolvedHostAttribution;
  attributionSessionUpdated: boolean;
  reservationAttributionCreated: boolean;
};

/**
 * Idempotently ensure the commission attribution chain for a reservation
 * reflects the assigned host. Safe to call repeatedly. Never overwrites
 * an existing referralActorId / legacyReferrerId on the AttributionSession
 * — a QR-driven attribution always wins over the host-fallback attribution
 * because the QR identifies a *specific* sub-referrer (e.g. an influencer
 * sub-link) that the assigned host does not represent.
 *
 * Returns a small audit shape so the backfill script + any inline caller
 * can log what they actually changed (vs what was already in place).
 */
export async function ensureHostAttributionForReservation(
  reservationId: string,
  hostProfileId: string,
  db: Db = prisma
): Promise<EnsureHostAttributionResult> {
  const resolved = await resolveAttributionForHostProfile(hostProfileId, db);

  let attributionSessionUpdated = false;
  let reservationAttributionCreated = false;

  // -- Step A: stamp AttributionSession.referralActorId / legacyReferrerId --
  // Only fill EMPTY slots — we never clobber a more-specific referrer that
  // arrived via QR. We use `updateMany` with a null guard in the WHERE
  // clause so each write is a single compare-and-set: a concurrent QR
  // claim that lands between our resolution and our write will set the
  // column non-null and our `updateMany` will match 0 rows, leaving the
  // QR-driven referrer untouched. This is the race-safe equivalent of a
  // read-then-update pair.
  if (resolved.referralActorId) {
    const r = await db.attributionSession.updateMany({
      where: { reservationId, referralActorId: null },
      data: { referralActorId: resolved.referralActorId },
    });
    if (r.count > 0) attributionSessionUpdated = true;
  }
  if (resolved.legacyReferrerId) {
    const r = await db.attributionSession.updateMany({
      where: { reservationId, legacyReferrerId: null },
      data: { legacyReferrerId: resolved.legacyReferrerId },
    });
    if (r.count > 0) attributionSessionUpdated = true;
  }

  // -- Step B: legacy ReservationAttribution row --
  // Only when a Referrer FK exists (the table cannot store a ReferralActor.id
  // since `referrerId` is a hard FK to Referrer). For host-link-only referrers
  // like Rafael (no legacy Referrer row), the AttributionSession.referralActorId
  // alone carries the commission attribution — both the manual close route
  // and the auto INVU minter consult that field directly.
  if (resolved.legacyReferrerId) {
    const existing = await db.reservationAttribution.findFirst({
      where: { reservationId, referrerId: resolved.legacyReferrerId },
      select: { id: true },
    });
    if (!existing) {
      // Reservation.source is the only required non-default field beyond
      // reservationId — pull it once so the row is internally consistent.
      const res = await db.reservation.findUnique({
        where: { id: reservationId },
        select: { source: true },
      });
      if (res) {
        await db.reservationAttribution.create({
          data: {
            reservationId,
            referrerId: resolved.legacyReferrerId,
            sourceType: res.source,
            sourceLabel: "host_assigned_backfill",
            commissionEligible: true,
          },
        });
        reservationAttributionCreated = true;
      }
    }
  }

  return { resolved, attributionSessionUpdated, reservationAttributionCreated };
}
