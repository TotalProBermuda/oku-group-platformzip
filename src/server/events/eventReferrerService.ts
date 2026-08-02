/**
 * Event-referrer service — SEPARATE from the shared referral attribution model.
 *
 * DEFERRED FROM PURE REFERRER CONSOLE (Slice E, 2026-07-11):
 *
 * This service manages `EventReferrerAssignment` and its associated
 * `InfluencerSubCommissionLedger`. These models form a DISTINCT ticketing-
 * attribution sub-system that intentionally does NOT feed into the shared
 * `getMyReferrals` / `AttributionSession` chain — yet.
 *
 * IDENTITY BRIDGE (wired; convergence pending):
 * All three provisioning paths now create a `ReferralActor` row linked to each
 * `EventReferrerAssignment` via `ReferralActor.legacyEventReferrerAssignmentId`:
 *   - `provisionHostPersonalReferrer` / `ensureHostReferralActor` — host personal codes
 *   - `createEventReferrer` — INFLUENCER_SUB_REFERRER actors; bridge written inside the
 *     same transaction as the assignment create so a failed assignment never leaves an
 *     orphaned actor. The bridge is skipped when the slot is already taken (a matched
 *     actor bridged to a different assignment retains its existing anchor).
 * The bridge is intentionally one-way and read-only: `resolveOwnedEarnerIdentities`
 * will pick up these actor ids, but because no `AttributionSession` row is written at
 * ticket purchase time, the shared feed returns 0 matching rows for event-referrer
 * identities — correct behaviour, not a bug.
 *
 * CONVERGENCE PATH (do not migrate until all steps are complete):
 *   Step 1 — Record an `AttributionSession` row at ticket purchase time, with
 *             `referralActorId` set to the bridged actor.
 *   Step 2 — Wire sub-commission accrual into `CommissionAllocation` / Phase-2
 *             `LedgerEntry` so `getMyReferrals` surfaces ticket revenue.
 *   Step 3 — Replace `GET /api/v1/event-referrers/my-assignments` with a
 *             filtered `GET /api/v1/me/referrals` call and retire this endpoint.
 *   Step 4 — Reconcile `InfluencerSubCommissionLedger` payout history into
 *             `PayoutBatch` before decommissioning the ledger table.
 *
 * DOUBLE-COUNTING RISK:
 * The actor bridge already exists. Any code that naively queries `AttributionSession`
 * filtered by these actor ids before Step 1 above will match walk-in/reservation
 * sessions that were NOT ticket purchases. Always filter by
 * `AttributionSession.source` when event-referrer actor ids are in scope.
 *
 * See also: `src/app/influencer/referrer-dashboard/page.tsx` (full convergence docs)
 *           `.local/tasks/pure-referrer-console.md` §6 step 6
 */
import { prisma } from "@/lib/prisma";
import {
  EventReferrerStatus,
  EventReferrerScopeType,
  EventReferrerCommissionMode,
  ReferralActorType,
  Prisma,
} from "@prisma/client";
import { nanoid } from "nanoid";
import {
  findOrLinkReferralActor,
  type MatchField,
} from "@/server/referrals/referralActorDedupeService";

export interface CreateEventReferrerInput {
  parentInfluencerId: string;
  createdByInfluencerId: string;
  seriesId?: string;
  scopeType: EventReferrerScopeType;
  assignedUserId?: string;
  inviteEmail?: string;
  displayName: string;
  isCommissionEligible?: boolean;
  commissionMode?: EventReferrerCommissionMode;
  commissionShareBps?: number;
}

export type CreateEventReferrerResult =
  | { ok: true; assignment: Awaited<ReturnType<typeof prisma.eventReferrerAssignment.create>> }
  | { ok: false; mergeRequired: true; candidateActorId: string; candidateActorUserId: string | null; matchField: MatchField }
  | { ok: false; blocked: true; reason: string };

function generateReferralCode(prefix: string = "EVT"): string {
  return `${prefix}-${nanoid(8).toUpperCase()}`;
}

// ─── Internal types ───────────────────────────────────────────────────────────

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * Thrown inside a Prisma transaction when `ensureHostReferralActor` detects a
 * merge conflict. Causes the transaction to roll back (reverting any assignment
 * create/update that ran before the call), then caught outside and converted to
 * `{ ok: false, mergeRequired: true }`.
 *
 * Carries the full conflict metadata so callers can re-write the canonical
 * `referral.actor.merge_required` audit non-transactionally after the rollback
 * (the version written inside the tx is lost when the tx aborts).
 */
class HostMergeRequiredError extends Error {
  readonly candidateActorId: string;
  readonly candidateActorUserId: string | null;
  readonly matchField: MatchField | null;
  readonly provisioningPath: string;
  constructor(conflict: {
    candidateActorId: string;
    candidateActorUserId?: string | null;
    matchField: MatchField | null;
    provisioningPath: string;
  }) {
    super("merge_required");
    this.name = "HostMergeRequiredError";
    this.candidateActorId = conflict.candidateActorId;
    this.candidateActorUserId = conflict.candidateActorUserId ?? null;
    this.matchField = conflict.matchField;
    this.provisioningPath = conflict.provisioningPath;
  }
}

// ─── Return type for ensureHostReferralActor ──────────────────────────────────

type EnsureHostActorResult =
  | { id: string }
  | {
      mergeRequired: true;
      candidateActorId: string;
      candidateActorUserId: string | null;
      matchField: MatchField | null;
      provisioningPath: string;
    };

/**
 * Find or create a ReferralActor for the given host, linking it to the
 * assignment. Uses the canonical dedupe service (findOrLinkReferralActor)
 * so a host who already exists as a ReferralActor via another provisioning
 * path is matched rather than duplicated.
 *
 * `seriesId` — when the assignment is scoped to a specific series, pass it
 * here so the event bridge (step 5) can participate in dedup matching.
 * For host personal codes the value is null and step 5 is skipped.
 *
 * Returns a typed error when the dedupe chain detects a merge conflict
 * (merge_required). The AuditLog entry is written here; callers must surface
 * the error upward — no new actor is created in that case.
 */
async function ensureHostReferralActor(
  host: { id: string; userId: string; displayName: string },
  assignmentId: string,
  seriesId?: string | null,
  tx?: Prisma.TransactionClient,
): Promise<EnsureHostActorResult> {
  const db: DbClient = tx ?? prisma;

  // Fast path: already bridged to this exact assignment — no work needed.
  const actorByAssignment = await db.referralActor.findUnique({
    where: { legacyEventReferrerAssignmentId: assignmentId },
    select: { id: true },
  });
  if (actorByAssignment) return actorByAssignment;

  // Delegate to the canonical 7-step dedupe chain so this path never mints
  // a duplicate actor for a host who was already provisioned via another
  // surface (e.g. ensureStreetsideReferralIdentity, admin resolution, etc.).
  // Pass `eventId` (the assignment's seriesId) so the event bridge (step 5)
  // can fire when the assignment carries direct person evidence.
  // Pass `tx` so the dedupe service participates in the caller's transaction.
  const result = await findOrLinkReferralActor(
    {
      actorType: ReferralActorType.STREETSIDE_HOST,
      displayName: host.displayName,
      userId: host.userId,
      eventId: seriesId ?? null,
      initiatedByUserId: host.userId,
    },
    { isProvisioningCall: true },
    tx,
  );

  if (result.status === "merge_required") {
    // The dedupe service writes referral.actor.merge_required using `db` (which may
    // be a tx client). When called inside a tx, that audit row will be rolled back
    // with the tx. Callers that use a tx must re-write the canonical audit
    // non-transactionally after catching HostMergeRequiredError.
    // Return the full conflict metadata so callers can do so without re-querying.
    return {
      mergeRequired: true,
      candidateActorId: result.candidateActorId,
      candidateActorUserId: result.candidateActorUserId ?? null,
      matchField: result.matchField,
      provisioningPath: result.provisioningPath,
    };
  }

  if (result.status === "blocked") {
    throw new Error(
      `ReferralActor provisioning blocked for host ${host.id}: ${result.reason}`,
    );
  }

  const actorId = result.actorId;

  // Link actor to this assignment if the slot is still free.
  // The slot may already be taken (e.g. dedupe found an actor that was bridged
  // to a *different* assignment). In that case we leave legacyEventReferrerAssignmentId
  // alone — the actor already participates in the convergence path via its own bridge.
  const actor = await db.referralActor.findUnique({
    where: { id: actorId },
    select: { id: true, legacyEventReferrerAssignmentId: true },
  });

  if (actor && !actor.legacyEventReferrerAssignmentId) {
    await db.referralActor.update({
      where: { id: actorId },
      data: {
        actorType: ReferralActorType.STREETSIDE_HOST,
        displayName: host.displayName,
        legacyEventReferrerAssignmentId: assignmentId,
      },
    });
  }

  return { id: actorId };
}

/**
 * Streetside hosts are first-class referrers, employed by the restaurant
 * rather than externally. This idempotently provisions a personal
 * commission code for a host: their own EventReferrerAssignment anchored
 * to themselves (parentHostProfileId = host.id), with the same host as
 * the recipient (assignedHostProfileId = host.id). Commission is settled
 * by the restaurant off-platform — same payout structure as
 * partner-anchored seats — so OKU only emits a reporting row when the
 * host's bookings convert.
 *
 * Called lazily from /api/v1/host/me so every host has a working QR
 * code as soon as they sign in, without an admin having to manually
 * provision one.
 *
 * Returns the assignment on success, or a typed merge-required error when
 * the dedupe chain detects an identity conflict. The caller is responsible
 * for surfacing the conflict (see /api/v1/host/me).
 */
export type ProvisionHostReferrerResult =
  | { ok: true; assignment: { id: string; referralCode: string; status: EventReferrerStatus } }
  | { ok: false; mergeRequired: true; candidateActorId: string };

export async function provisionHostPersonalReferrer(
  hostProfileId: string,
): Promise<ProvisionHostReferrerResult> {
  // Race-safe: parentHostProfileId carries a UNIQUE constraint, so the
  // database guarantees at most one row per host. We:
  //   1) look up any existing row (any status) by host
  //   2) if it's already ACTIVE/INVITED, return it
  //   3) if it exists in some other status (REVOKED etc.), reactivate
  //   4) otherwise create — concurrent inserts collide on the unique
  //      constraint and we recover by re-reading the winner's row.
  const host = await prisma.restaurantHostProfile.findUnique({
    where: { id: hostProfileId },
    select: { id: true, userId: true, displayName: true, venueId: true },
  });
  if (!host) {
    throw new Error(`Host profile not found: ${hostProfileId}`);
  }

  const existingAny = await prisma.eventReferrerAssignment.findUnique({
    where: { parentHostProfileId: hostProfileId },
    select: { id: true, referralCode: true, status: true },
  });
  if (existingAny) {
    // A host's personal code is self-anchored — there's no separate
    // party to "accept the invite" — so anything other than ACTIVE
    // (INVITED, REVOKED, EXPIRED, etc.) gets promoted. This also
    // matches the /api/v1/host/me reader which filters by
    // status=ACTIVE; without the promote, an INVITED row would be
    // returned here but invisibly filtered out downstream.
    if (existingAny.status === EventReferrerStatus.ACTIVE) {
      // Assignment already active — no assignment change needed.
      // Ensure the actor bridge without a transaction: the assignment
      // pre-existed and will remain active whether or not the bridge succeeds.
      const actorResult = await ensureHostReferralActor(host, existingAny.id);
      if ("mergeRequired" in actorResult) {
        return { ok: false, mergeRequired: true, candidateActorId: actorResult.candidateActorId };
      }
      return { ok: true, assignment: existingAny };
    }

    // Reactivate the assignment AND provision the actor in a single transaction
    // so a merge conflict rolls back the status promotion, leaving the assignment
    // in its original non-ACTIVE state rather than active-but-unanchored.
    try {
      const reactivated = await prisma.$transaction(async (tx) => {
        const updated = await tx.eventReferrerAssignment.update({
          where: { id: existingAny.id },
          data: { status: EventReferrerStatus.ACTIVE },
          select: { id: true, referralCode: true, status: true },
        });
        const actorResult = await ensureHostReferralActor(host, updated.id, undefined, tx);
        if ("mergeRequired" in actorResult) {
          // Throw sentinel to roll back the status promotion.
          throw new HostMergeRequiredError({
            candidateActorId: actorResult.candidateActorId,
            candidateActorUserId: actorResult.candidateActorUserId,
            matchField: actorResult.matchField,
            provisioningPath: actorResult.provisioningPath,
          });
        }
        return updated;
      });
      return { ok: true, assignment: reactivated };
    } catch (err) {
      if (err instanceof HostMergeRequiredError) {
        // Re-write the canonical audit non-transactionally — the version the
        // dedupe service wrote inside the tx was rolled back with the tx.
        await prisma.auditLog.create({
          data: {
            actorId: err.candidateActorId,
            action: "referral.actor.merge_required",
            metadata: {
              provisioningPath: err.provisioningPath,
              matchField: err.matchField,
              candidateActorId: err.candidateActorId,
              candidateActorUserId: err.candidateActorUserId,
              mutated: false,
              surface: "provisionHostPersonalReferrer.reactivate",
              note: "re-written after tx rollback to preserve audit trail",
            } as object,
          },
        });
        return { ok: false, mergeRequired: true, candidateActorId: err.candidateActorId };
      }
      throw err;
    }
  }

  const referralCode = generateReferralCode("HOST");
  try {
    // Create the assignment AND provision the actor in a single transaction
    // so a merge conflict rolls back the newly created assignment row, leaving
    // no active assignment without an actor bridge.
    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.eventReferrerAssignment.create({
        data: {
          parentHostProfileId: host.id,
          assignedHostProfileId: host.id,
          assignedUserId: host.userId,
          // No specific series — a streetside host's personal code is
          // venue-wide. We keep scopeType=SERIES (the existing default) +
          // null seriesId rather than introducing a new enum value, since
          // the resolver looks the code up by `referralCode` directly and
          // doesn't gate on scope.
          scopeType: EventReferrerScopeType.SERIES,
          displayName: host.displayName,
          referralCode,
          // Commission policy is set per-restaurant by admin. We default
          // to "eligible" so attribution is recorded; the actual share is
          // configured separately so OKU never assumes a payout amount.
          isCommissionEligible: true,
          commissionMode: EventReferrerCommissionMode.NONE,
          commissionPayer: "RESTAURANT",
          status: EventReferrerStatus.ACTIVE,
        },
        select: { id: true, referralCode: true, status: true },
      });
      const actorResult = await ensureHostReferralActor(host, created.id, undefined, tx);
      if ("mergeRequired" in actorResult) {
        // Throw sentinel to roll back the assignment creation.
        throw new HostMergeRequiredError({
          candidateActorId: actorResult.candidateActorId,
          candidateActorUserId: actorResult.candidateActorUserId,
          matchField: actorResult.matchField,
          provisioningPath: actorResult.provisioningPath,
        });
      }
      return created;
    });
    return { ok: true, assignment };
  } catch (err: any) {
    if (err instanceof HostMergeRequiredError) {
      // Re-write the canonical audit non-transactionally — the version the
      // dedupe service wrote inside the tx was rolled back with the tx.
      await prisma.auditLog.create({
        data: {
          actorId: err.candidateActorId,
          action: "referral.actor.merge_required",
          metadata: {
            provisioningPath: err.provisioningPath,
            matchField: err.matchField,
            candidateActorId: err.candidateActorId,
            candidateActorUserId: err.candidateActorUserId,
            mutated: false,
            surface: "provisionHostPersonalReferrer.create",
            note: "re-written after tx rollback to preserve audit trail",
          } as object,
        },
      });
      return { ok: false, mergeRequired: true, candidateActorId: err.candidateActorId };
    }
    // Concurrent /me from the same host racing us — the unique
    // constraint kicks in. Re-read and return whatever the winning
    // request just inserted instead of failing the caller.
    if (err?.code === "P2002") {
      const winner = await prisma.eventReferrerAssignment.findUnique({
        where: { parentHostProfileId: host.id },
        select: { id: true, referralCode: true, status: true },
      });
      if (winner) {
        const actorResult = await ensureHostReferralActor(host, winner.id);
        if ("mergeRequired" in actorResult) {
          return { ok: false, mergeRequired: true, candidateActorId: actorResult.candidateActorId };
        }
        return { ok: true, assignment: winner };
      }
    }
    throw err;
  }
}

/**
 * Enforces the parent-anchor invariant on EventReferrerAssignment writes.
 * Exactly one of parentInfluencerId / parentPartnerId / parentHostProfileId
 * must be set. Streetside hosts are first-class referrers (employed by
 * the restaurant rather than externally), so they get their own anchor.
 */
export function assertReferrerParentXor(args: {
  parentInfluencerId?: string | null;
  parentPartnerId?: string | null;
  parentHostProfileId?: string | null;
}): void {
  const flags = [
    !!args.parentInfluencerId,
    !!args.parentPartnerId,
    !!args.parentHostProfileId,
  ];
  const setCount = flags.filter(Boolean).length;
  if (setCount !== 1) {
    throw new Error(
      `EventReferrerAssignment must have exactly one parent (got influencer=${flags[0]}, partner=${flags[1]}, host=${flags[2]})`
    );
  }
}

function buildReferralUrl(referralCode: string, seriesSlug?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://okuhospitality.com";
  const path = seriesSlug ? `/series/${seriesSlug}` : "/series";
  return `${base}${path}?ref=${referralCode}`;
}

/**
 * Create a new EventReferrerAssignment for an influencer sub-referrer.
 *
 * When `assignedUserId` or `inviteEmail` is provided, this function
 * also provisions a canonical `ReferralActor` for the sub-referrer using
 * `findOrLinkReferralActor` (7-step dedupe chain). A `merge_required` result
 * is surfaced as a typed service error — no duplicate actor is created.
 */
export async function createEventReferrer(
  input: CreateEventReferrerInput,
): Promise<CreateEventReferrerResult> {
  assertReferrerParentXor({ parentInfluencerId: input.parentInfluencerId });
  const referralCode = generateReferralCode();

  let referralUrl: string | undefined;
  if (input.seriesId) {
    const series = await prisma.series.findUnique({
      where: { id: input.seriesId },
      select: { slug: true },
    });
    referralUrl = buildReferralUrl(referralCode, series?.slug);
  } else {
    referralUrl = buildReferralUrl(referralCode);
  }

  // Run dedupe + assignment create + actor bridge in a single transaction so
  // that a failed assignment create rolls back any actor mutation that happened
  // inside findOrLinkReferralActor, leaving no orphaned actor without an anchor.
  //
  // merge_required / blocked are returned as discriminated values from inside
  // the tx. Because these exit paths leave no actor mutations to roll back
  // (merge_required means a pre-existing actor was found; blocked means no actor
  // was touched), the tx commits cleanly and the outer function surfaces the error.
  type TxResult =
    | { type: "ok"; assignment: Awaited<ReturnType<typeof prisma.eventReferrerAssignment.create>> }
    | { type: "merge_required"; candidateActorId: string; candidateActorUserId: string | null; matchField: MatchField }
    | { type: "blocked"; reason: string };

  const txResult = await prisma.$transaction(async (tx) => {
    let provisionedActorId: string | null = null;

    if (input.assignedUserId || input.inviteEmail) {
      const dedupeResult = await findOrLinkReferralActor(
        {
          actorType: ReferralActorType.INFLUENCER_SUB_REFERRER,
          displayName: input.displayName,
          userId: input.assignedUserId ?? null,
          email: input.inviteEmail ?? null,
          initiatedByUserId: input.parentInfluencerId,
        },
        { isProvisioningCall: true },
        tx,
      );

      if (dedupeResult.status === "merge_required") {
        // The dedupe service already writes referral.actor.merge_required.
        // Return the canonical conflict shape — no assignment is created.
        return {
          type: "merge_required" as const,
          candidateActorId: dedupeResult.candidateActorId,
          candidateActorUserId: dedupeResult.candidateActorUserId ?? null,
          matchField: dedupeResult.matchField,
        };
      }

      if (dedupeResult.status === "blocked") {
        // Surface blocked as a controlled service error — no assignment is created.
        return { type: "blocked" as const, reason: dedupeResult.reason };
      }

      provisionedActorId = dedupeResult.actorId;
    }

    const assignment = await tx.eventReferrerAssignment.create({
      data: {
        parentInfluencerId: input.parentInfluencerId,
        createdByInfluencerId: input.createdByInfluencerId,
        seriesId: input.seriesId,
        scopeType: input.scopeType,
        assignedUserId: input.assignedUserId,
        inviteEmail: input.inviteEmail,
        displayName: input.displayName,
        referralCode,
        referralUrl,
        isCommissionEligible: input.isCommissionEligible ?? false,
        commissionMode: input.commissionMode ?? EventReferrerCommissionMode.NONE,
        commissionShareBps: input.commissionShareBps,
        status: input.assignedUserId
          ? EventReferrerStatus.ACTIVE
          : EventReferrerStatus.INVITED,
      },
      include: {
        series: { select: { id: true, slug: true, title: true } },
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    });

    // Bridge the provisioned actor to this assignment when the slot is still free.
    // A matched actor already bridged to a different assignment retains its
    // existing bridge — it participates in the convergence path via its own anchor.
    if (provisionedActorId) {
      const actor = await tx.referralActor.findUnique({
        where: { id: provisionedActorId },
        select: { legacyEventReferrerAssignmentId: true },
      });
      if (actor && !actor.legacyEventReferrerAssignmentId) {
        await tx.referralActor.update({
          where: { id: provisionedActorId },
          data: { legacyEventReferrerAssignmentId: assignment.id },
        });
      }
    }

    return { type: "ok" as const, assignment };
  });

  if (txResult.type === "merge_required") {
    return {
      ok: false,
      mergeRequired: true,
      candidateActorId: txResult.candidateActorId,
      candidateActorUserId: txResult.candidateActorUserId,
      matchField: txResult.matchField,
    };
  }
  if (txResult.type === "blocked") {
    return { ok: false, blocked: true, reason: txResult.reason };
  }
  return { ok: true, assignment: txResult.assignment };
}

export async function revokeEventReferrer(id: string) {
  return prisma.eventReferrerAssignment.update({
    where: { id },
    data: { status: EventReferrerStatus.REVOKED },
  });
}

export async function activateEventReferrer(id: string) {
  return prisma.eventReferrerAssignment.update({
    where: { id },
    data: { status: EventReferrerStatus.ACTIVE },
  });
}

export async function archiveEventReferrer(id: string) {
  return prisma.eventReferrerAssignment.update({
    where: { id },
    data: { status: EventReferrerStatus.ARCHIVED },
  });
}

export async function getEventReferrerByCode(referralCode: string) {
  return prisma.eventReferrerAssignment.findUnique({
    where: { referralCode: referralCode.toUpperCase() },
    include: {
      series: { select: { id: true, slug: true, title: true, seriesVisibilityMode: true } },
      parentInfluencer: { select: { id: true, commissionRateBps: true } },
    },
  });
}

export async function listReferrersForInfluencer(influencerId: string) {
  return prisma.eventReferrerAssignment.findMany({
    where: {
      parentInfluencerId: influencerId,
      status: { not: EventReferrerStatus.ARCHIVED },
    },
    include: {
      series: { select: { id: true, slug: true, title: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
      orders: {
        where: { status: "PAID" },
        select: { id: true, subtotalCents: true },
      },
      subCommissionLedger: {
        select: { referrerShareCents: true, payoutStatus: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInfluencerReferrerDashboardMetrics(influencerId: string) {
  const referrers = await listReferrersForInfluencer(influencerId);

  const team = referrers.map((r) => {
    const ticketsSold = r.orders.length;
    const revenueAttributedCents = r.orders.reduce(
      (sum, o) => sum + o.subtotalCents,
      0
    );
    const subCommissionOwedCents = r.subCommissionLedger
      .filter((s) => s.payoutStatus === "PENDING")
      .reduce((sum, s) => sum + s.referrerShareCents, 0);

    return {
      id: r.id,
      displayName: r.displayName,
      referralCode: r.referralCode,
      referralUrl: r.referralUrl,
      qrCodeImageUrl: r.qrCodeImageUrl,
      scopeType: r.scopeType,
      series: r.series,
      assignedUser: r.assignedUser,
      isCommissionEligible: r.isCommissionEligible,
      commissionMode: r.commissionMode,
      commissionShareBps: r.commissionShareBps,
      status: r.status,
      ticketsSold,
      revenueAttributedCents,
      subCommissionOwedCents,
    };
  });

  return { team };
}

/**
 * Writes an AttributionSession row when a ticket is purchased via an
 * event-referrer code (Step 1 of the convergence path).
 *
 * Guards:
 *  - No assignment → noop (silently returns).
 *  - No bridged ReferralActor → noop (bridge not yet created for this assignment).
 *  - Session already exists for this orderId (idempotency via @unique constraint) → noop.
 *  - No venue resolved → noop (don't block the purchase).
 *
 * DOUBLE-COUNTING GUARD: the created row carries source=TICKET_PURCHASE.
 * Any downstream query scoped to these actor ids MUST filter by
 * AttributionSession.source to avoid matching walk-in sessions.
 */
export async function writeTicketAttributionSession(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      attributedEventReferrerAssignmentId: true,
      series: {
        select: {
          id: true,
          title: true,
          slug: true,
          venue: true,
        },
      },
    },
  });
  if (!order || !order.attributedEventReferrerAssignmentId) return;

  // Resolve the bridged ReferralActor (created by ensureHostReferralActor
  // / provisionHostPersonalReferrer at assignment time).
  const actor = await prisma.referralActor.findUnique({
    where: { legacyEventReferrerAssignmentId: order.attributedEventReferrerAssignmentId },
    select: { id: true },
  });
  if (!actor) return;

  // Resolve venue id: Series.venue is a VenueKey enum (OKU/CATCH). Look up
  // the Venue row whose slug contains the key (case-insensitive).
  //
  // IMPORTANT: We do NOT fall back to "first venue in DB". An arbitrary
  // fallback would attach this attribution session to the wrong venue, which
  // corrupts ProofPay proof-chain data and is harder to audit/recover than a
  // clean skip. If the series has no venue or the venue cannot be resolved,
  // we write an AuditLog entry and return without creating a session — the
  // checkout still succeeds; this path is non-fatal.
  const venueKey = order.series?.venue;
  let venueId: string | null = null;

  if (venueKey) {
    const venue = await prisma.venue.findFirst({
      where: { slug: { contains: venueKey.toLowerCase(), mode: "insensitive" } },
      select: { id: true },
    });
    venueId = venue?.id ?? null;
  }

  if (!venueId) {
    await prisma.auditLog.create({
      data: {
        actorId: "system:ticket-attribution",
        action: "ticket.attribution.venue_unresolvable",
        metadata: {
          orderId,
          seriesId: order.series?.id ?? null,
          venueKey: venueKey ?? null,
          reason: venueKey
            ? `No venue found with slug containing "${venueKey.toLowerCase()}"`
            : "Series has no venue key set",
        } as object,
      },
    });
    return;
  }

  // bookingCode must be globally unique; prefix with TP- and suffix with
  // the order id's last 12 chars.
  const bookingCode = `TP-${orderId.slice(-12).toUpperCase()}`;

  // Use upsert so concurrent confirmation retries are idempotent.
  await prisma.attributionSession.upsert({
    where: { orderId },
    update: {},
    create: {
      kind: "TICKET_PURCHASE",
      source: "TICKET_PURCHASE",
      status: "VERIFIED_POS_SALE",
      venueId,
      orderId,
      bookingCode,
      referralActorId: actor.id,
      // verifiedAt = now (the payment gateway already confirmed the charge).
      verifiedAt: new Date(),
    },
  });
}

export async function getEventReferrerDashboard(userId: string) {
  const assignments = await prisma.eventReferrerAssignment.findMany({
    where: {
      assignedUserId: userId,
      status: { in: [EventReferrerStatus.ACTIVE, EventReferrerStatus.INVITED] },
    },
    include: {
      series: { select: { id: true, slug: true, title: true, venue: true } },
      orders: {
        where: { status: "PAID" },
        select: { id: true, subtotalCents: true },
      },
      subCommissionLedger: {
        select: {
          referrerShareCents: true,
          payoutStatus: true,
          influencerRetainedCents: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return assignments.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    referralCode: a.referralCode,
    referralUrl: a.referralUrl,
    qrCodeImageUrl: a.qrCodeImageUrl,
    scopeType: a.scopeType,
    series: a.series,
    status: a.status,
    isCommissionEligible: a.isCommissionEligible,
    commissionMode: a.commissionMode,
    commissionShareBps: a.commissionShareBps,
    ticketsAttributed: a.orders.length,
    revenueAttributedCents: a.orders.reduce(
      (sum, o) => sum + o.subtotalCents,
      0
    ),
    totalEarnedCents: a.subCommissionLedger.reduce(
      (sum, s) => sum + s.referrerShareCents,
      0
    ),
    pendingPayoutCents: a.subCommissionLedger
      .filter((s) => s.payoutStatus === "PENDING")
      .reduce((sum, s) => sum + s.referrerShareCents, 0),
  }));
}
