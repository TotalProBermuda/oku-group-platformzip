import { prisma } from "@/lib/prisma";
import type { Prisma, ReferralActor } from "@prisma/client";
import { logReferrerAssignmentAction } from "./referrerAssignmentAudit";
import {
  findOrLinkReferralActor,
  normalizeEmail as _normalizeEmail,
  normalizePhone as _normalizePhone,
} from "./referralActorDedupeService";

/**
 * Identity de-duplication for ReferralActor.
 *
 * Goal: when two operators (e.g. an OKÜ admin and a partner) invite the
 * same person to be a streetside referrer, we must NOT mint two separate
 * ReferralActor rows — both operators should attach their own
 * ReferralAssignment to the SAME canonical actor so commissions and
 * activity history merge correctly.
 *
 * Delegates to `findOrLinkReferralActor` (7-step de-dup chain).
 * All existing call sites inherit the full de-dup logic without a
 * breaking interface change.
 */

export function normaliseEmail(raw?: string | null): string | null {
  return _normalizeEmail(raw);
}

/** Strip everything but digits — handles +507/+1 prefixes. */
export function normalisePhone(raw?: string | null): string | null {
  return _normalizePhone(raw);
}

export interface FindOrCreateActorInput {
  actorType: import("@prisma/client").ReferralActorType;
  displayName: string;
  organizationName?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  userId?: string | null;
  metadataJson?: Record<string, unknown>;
  /** Who initiated the create — used in the audit row. */
  invitedByUserId: string;
}

export interface FindOrCreateActorResult {
  actor: ReferralActor;
  matched: boolean;
  matchKey: "userId" | "email" | "phone" | "whatsapp" | null;
  /**
   * Set to true when the dedupe chain detected a merge conflict: the
   * resolved actor belongs to a different user.
   *
   * When this is true, `matched` is explicitly `false` — the actor
   * returned is the *candidate* (the existing conflicting actor), and the
   * caller MUST surface the conflict rather than silently attaching work
   * to that actor.
   */
  mergeRequired?: boolean;
  /** Present when `mergeRequired` is true — the conflicting actor id. */
  candidateActorId?: string;
  /** Present when `mergeRequired` is true — the conflicting actor's owner. */
  candidateActorUserId?: string | null;
}

/**
 * Thrown by `findOrCreateReferralActor` when the dedupe chain returns
 * `blocked` (e.g. a legacy referralCode is already taken and the caller
 * did not supply `allowNewCodeOnLegacyConflict`).
 *
 * This is a hard stop — no actor was created. Callers that need to handle
 * this case should catch `ReferralActorBlockedError`.
 */
export class ReferralActorBlockedError extends Error {
  constructor(public readonly blockReason: string) {
    super(`ReferralActor provisioning blocked: ${blockReason}`);
    this.name = "ReferralActorBlockedError";
  }
}

/**
 * Find an existing ReferralActor by userId/email/phone/whatsapp, or create
 * a new one. Always writes an audit row.
 *
 * Delegates to `findOrLinkReferralActor` (7-step canonical chain) and
 * honours the provided `tx` client end-to-end so outer transactions
 * see all writes atomically.
 *
 * When `findOrLinkReferralActor` returns `merge_required` (candidate actor
 * belongs to a different user) this function returns `matched: false` with
 * `mergeRequired: true` and the candidate actor — callers MUST inspect
 * `mergeRequired` and handle the conflict explicitly. The candidate actor
 * is returned for reference only; callers must not silently attach new
 * work to it.
 *
 * When `findOrLinkReferralActor` returns `blocked` (e.g. legacy code
 * taken) a `ReferralActorBlockedError` is thrown — no actor was created.
 */
export async function findOrCreateReferralActor(
  input: FindOrCreateActorInput,
  tx?: Prisma.TransactionClient,
): Promise<FindOrCreateActorResult> {
  const client = tx ?? prisma;

  const result = await findOrLinkReferralActor(
    {
      actorType: input.actorType,
      displayName: input.displayName,
      organizationName: input.organizationName,
      email: input.email,
      phone: input.phone,
      whatsapp: input.whatsapp,
      userId: input.userId,
      initiatedByUserId: input.invitedByUserId,
    },
    { isProvisioningCall: true },
    tx,
  );

  // Blocked — no actor was created. Throw so callers fail loudly.
  if (result.status === "blocked") {
    throw new ReferralActorBlockedError(result.reason);
  }

  const isMergeConflict = result.status === "merge_required";

  const resolvedActorId = isMergeConflict ? result.candidateActorId : result.actorId;

  const actor = await client.referralActor.findUniqueOrThrow({
    where: { id: resolvedActorId },
  });

  const matchField = result.matchField;
  const matchKey =
    matchField === "userId"
      ? ("userId" as const)
      : matchField === "email"
        ? ("email" as const)
        : matchField === "phone"
          ? ("phone" as const)
          : matchField === "whatsapp"
            ? ("whatsapp" as const)
            : null;

  // A merge conflict is NOT a successful match — the candidate actor belongs
  // to a different user and cannot be used without explicit resolution.
  const matched = !isMergeConflict && result.status !== "created" && result.status !== "override_created";

  await logReferrerAssignmentAction(
    {
      actorId: input.invitedByUserId,
      action: matched ? "actor.find_or_create.matched" : "actor.find_or_create.created",
      referralActorId: actor.id,
      matchKey,
      note: matched ? `matched via ${matchField ?? "unknown"}` : null,
    },
    tx,
  );

  if (isMergeConflict) {
    return {
      actor,
      matched: false,
      matchKey,
      mergeRequired: true,
      candidateActorId: result.candidateActorId,
      candidateActorUserId: result.candidateActorUserId,
    };
  }

  return { actor, matched, matchKey };
}
