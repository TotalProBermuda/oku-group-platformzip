import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import type { Prisma, ReferralActorType } from "@prisma/client";

/**
 * Canonical ReferralActor de-duplication service.
 *
 * Every provisioning path that creates a ReferralActor must call
 * `findOrLinkReferralActor` so the same real-world referrer never
 * accumulates duplicate actor records across channels.
 *
 * CONCURRENCY NOTE: No DB-level unique constraint exists yet on
 * normalised email/phone — enforcement lives at this service layer.
 * The create path runs inside a transaction with a final re-check
 * immediately before INSERT as best-effort protection against races.
 * A future migration should add partial unique indexes.
 *
 * AUDITLOG: AuditLog.actorId is a plain String (no FK constraint).
 * Each row uses the RESOLVED or CANDIDATE actor id as the actorId
 * so audit trails track what happened to the actor, with
 * SYSTEM_ACTOR as fallback only when no actor id is available yet
 * (e.g. right before a create).
 *
 * CANONICAL AUDIT ACTIONS (referral actor dedupe):
 *   referral.actor.dedupe_found           — non-mutating match; existing actor returned
 *   referral.actor.dedupe_linked          — unowned actor linked to incoming userId
 *   referral.actor.dedupe_reactivated     — inactive ReferralLink reactivated on match
 *   referral.actor.dedupe_created         — new actor created (all create paths)
 *   referral.actor.dedupe_override_created — actor created despite conflict (overrideContext)
 *   referral.actor.merge_required         — conflict detected; no actor created/mutated
 *   referral.actor.blocked                — provisioning stopped before create (e.g. legacy
 *                                           code taken + allowNewCodeOnLegacyConflict=false);
 *                                           actorId in the audit row is SYSTEM_ACTOR
 *   referral.actor.admin_identity_link    — durable proof that an admin approved linking
 *                                           incomingUserId to an already-owned actor; the
 *                                           dedupe service checks this before emitting a new
 *                                           merge_required for the same (actorId, userId) pair
 *   referral.actor.merge_resolved         — append-only resolution record for the merge-conflict
 *                                           workflow; references originalConflictAuditId
 */

export const SYSTEM_ACTOR = "system:referral-actor-dedupe";

// ─── Normalization helpers ────────────────────────────────────────────────────

/**
 * Trim and lowercase. Safe to call with any untrusted input.
 */
export function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/**
 * Strip all non-digit characters. Does NOT add an E.164 prefix unless
 * the caller supplies countryCode alongside this call. This keeps
 * normalization country-agnostic across Panama (+507) and future markets.
 */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
}

// ─── Input / Options ──────────────────────────────────────────────────────────

export interface FindOrLinkReferralActorInput {
  actorType: ReferralActorType;
  displayName: string;
  organizationName?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  userId?: string | null;
  /**
   * When supplied, step 6 checks for an existing ReferralLink with this code.
   * Must be explicitly provided — never inferred from other fields.
   */
  referralCode?: string | null;
  /**
   * When supplied, step 5 checks the EventReferrerAssignment bridge.
   * Event participation alone is never sufficient; direct person evidence
   * (email/userId matching the assignment) is also required.
   */
  eventId?: string | null;
  metadataJson?: Record<string, unknown>;
  /** Auth subject for AuditLog rows. Falls back to SYSTEM_ACTOR when absent. */
  initiatedByUserId?: string | null;
  /**
   * When supplied the function bypasses the `merge_required` early-return
   * and creates a separate actor instead, fully auditing the override.
   * This is the only supported "create separate despite conflict" path.
   */
  overrideContext?: {
    authorizedBy: string;
    reason: string;
  };
}

export interface FindOrLinkReferralActorOpts {
  /**
   * Write a `dedupe_found` audit entry on non-mutating matches.
   * Pass `false` for ordinary read-path lookups to avoid audit noise.
   * Defaults to `true`.
   */
  isProvisioningCall?: boolean;
  /**
   * When a legacy Referrer row is found and its referralCode is already
   * taken by another ReferralLink, generate a fresh code for the new link.
   * Without this flag the result carries `reason: 'legacy_code_taken'` and
   * no link is created — the caller must decide how to proceed.
   */
  allowNewCodeOnLegacyConflict?: boolean;
}

// ─── Result discriminated union ───────────────────────────────────────────────

export type MatchField =
  | "userId"
  | "email"
  | "phone"
  | "whatsapp"
  | "referralCode"
  | "eventBridge"
  | "legacyReferrer"
  | null;

interface DedupeBase {
  actorId: string;
  referralLinkId?: string | null;
  matchField: MatchField;
  provisioningPath: string;
}

export type DedupeResult =
  | (DedupeBase & { status: "found_existing_linked"; mutated: false; reason?: string })
  | (DedupeBase & { status: "found_existing_unlinked"; mutated: false; reason?: string })
  | (DedupeBase & { status: "linked"; mutated: true; reason?: string })
  | (DedupeBase & { status: "reactivated_link"; referralLinkId: string; mutated: true; reason?: string })
  | (DedupeBase & { status: "created"; mutated: true; reason?: string })
  | (DedupeBase & {
      status: "override_created";
      mutated: true;
      overrideContext: { authorizedBy: string; reason: string };
    })
  | {
      status: "merge_required";
      candidateActorId: string;
      candidateActorUserId?: string | null;
      incomingUserId: string | null;
      matchField: MatchField;
      provisioningPath: string;
      mutated: false;
      reason: string;
    }
  | {
      /**
       * Provisioning was blocked without creating an actor.
       * Currently emitted by step 4 when a legacy referralCode is already
       * taken and `allowNewCodeOnLegacyConflict` is false.
       * `actorId` is absent — no actor was created.
       */
      status: "blocked";
      reason: string;
      matchField: MatchField;
      provisioningPath: string;
      mutated: false;
    };

// ─── Internal types ───────────────────────────────────────────────────────────

type DbClient = typeof prisma | Prisma.TransactionClient;

interface ActorRow {
  id: string;
  userId: string | null;
  links: Array<{ id: string; isActive: boolean }>;
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

/**
 * Write a canonical dedupe audit entry.
 *
 * AuditLog.actorId = the resolved or candidate actor id so audit trails
 * track the actor as the subject. Falls back to SYSTEM_ACTOR when no
 * actor id is available (before the create step).
 */
async function writeAudit(
  client: DbClient,
  action: string,
  resolvedActorId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: resolvedActorId ?? SYSTEM_ACTOR,
      action,
      metadata: metadata as object,
    },
  });
}

// ─── Code generation ──────────────────────────────────────────────────────────

function generateCode(prefix = "REF"): string {
  return `${prefix}-${nanoid(8).toUpperCase()}`;
}

// ─── Actor data builder ───────────────────────────────────────────────────────

function buildActorData(input: FindOrLinkReferralActorInput) {
  return {
    actorType: input.actorType,
    displayName: input.displayName.trim(),
    organizationName: input.organizationName?.trim() ?? null,
    email: input.email?.trim() ?? null,
    phone: input.phone?.trim() ?? null,
    whatsapp: input.whatsapp?.trim() ?? null,
    userId: input.userId ?? null,
    metadataJson: input.metadataJson ? (input.metadataJson as object) : undefined,
  };
}

// ─── Phone / WhatsApp scan ────────────────────────────────────────────────────

/**
 * Page through ALL actors with a non-null value for `field`, normalizing each
 * stored value in JS so storage-format differences ("+507 6123-4567" vs
 * "50761234567") never cause misses. No upper-row cap is applied — every row
 * is examined to guarantee correctness. Each page is PAGE rows in createdAt
 * order; the loop exits as soon as a match is found or all rows are consumed.
 *
 * A future migration adding a DB-level normalized_phone column/index will
 * replace this full-scan with an O(1) lookup.
 */
async function findActorByNormPhone(
  client: DbClient,
  field: "phone" | "whatsapp",
  normalised: string,
): Promise<ActorRow | null> {
  const PAGE = 200;
  let skip = 0;
  for (;;) {
    const batch = await client.referralActor.findMany({
      where: { [field]: { not: null } },
      orderBy: { createdAt: "asc" },
      skip,
      take: PAGE,
      include: { links: { select: { id: true, isActive: true } } },
    });
    for (const c of batch) {
      if (
        normalizePhone((c as Record<string, unknown>)[field] as string | null) ===
        normalised
      ) {
        return c;
      }
    }
    if (batch.length < PAGE) return null; // all rows consumed
    skip += PAGE;
  }
}

// ─── Candidate resolution helper ──────────────────────────────────────────────

/**
 * Given a found actor candidate and the incoming input, decide the outcome.
 * Returns a DedupeResult or `{ conflict: true }` when the candidate belongs
 * to a different user AND overrideContext was NOT supplied.
 *
 * When the candidate has no active ReferralLink but DOES have an inactive one,
 * the inactive link is reactivated and `reactivated_link` is returned instead
 * of the plain found/linked status.
 */
async function resolveCandidate(
  client: DbClient,
  candidate: ActorRow,
  input: FindOrLinkReferralActorInput,
  matchField: MatchField,
  provisioningPath: string,
  isProvisioningCall: boolean,
): Promise<DedupeResult | { conflict: true }> {
  const activeLink = candidate.links.find((l) => l.isActive) ?? null;
  const inactiveLink = !activeLink ? (candidate.links[0] ?? null) : null;
  const referralLinkId = activeLink?.id ?? null;
  const candidateUserId = candidate.userId;
  const incomingUserId = input.userId ?? null;

  // ── Same user (or actor has no user yet) ────────────────────────────────────
  if (candidateUserId === null || candidateUserId === incomingUserId) {
    // If the candidate has an inactive link but no active one, reactivate it.
    // This applies regardless of whether we also need to link a userId.
    if (inactiveLink) {
      await client.referralLink.update({
        where: { id: inactiveLink.id },
        data: { isActive: true },
      });
      // If candidate is also unlinked and an incoming userId is provided, link now.
      if (candidateUserId === null && incomingUserId !== null) {
        await client.referralActor.update({
          where: { id: candidate.id },
          data: { userId: incomingUserId },
        });
      }
      await writeAudit(client, "referral.actor.dedupe_reactivated", candidate.id, {
        provisioningPath,
        mutated: true,
        matchField,
        referralLinkId: inactiveLink.id,
      });
      return {
        status: "reactivated_link",
        actorId: candidate.id,
        referralLinkId: inactiveLink.id,
        matchField,
        provisioningPath,
        mutated: true,
      };
    }

    if (candidateUserId !== null && candidateUserId === incomingUserId) {
      // Fully linked match — actor already owns this userId
      if (isProvisioningCall) {
        await writeAudit(client, "referral.actor.dedupe_found", candidate.id, {
          provisioningPath,
          mutated: false,
          matchField,
          referralLinkId,
        });
      }
      return {
        status: "found_existing_linked",
        actorId: candidate.id,
        referralLinkId,
        matchField,
        provisioningPath,
        mutated: false,
      };
    }

    if (candidateUserId === null && incomingUserId === null) {
      // Both sides have no userId — return as-is
      if (isProvisioningCall) {
        await writeAudit(client, "referral.actor.dedupe_found", candidate.id, {
          provisioningPath,
          mutated: false,
          matchField,
          referralLinkId,
        });
      }
      return {
        status: "found_existing_unlinked",
        actorId: candidate.id,
        referralLinkId,
        matchField,
        provisioningPath,
        mutated: false,
      };
    }

    // candidateUserId === null but incomingUserId is set — link the actor
    await client.referralActor.update({
      where: { id: candidate.id },
      data: { userId: incomingUserId },
    });
    await writeAudit(client, "referral.actor.dedupe_linked", candidate.id, {
      provisioningPath,
      mutated: true,
      matchField,
      referralLinkId,
    });
    return {
      status: "linked",
      actorId: candidate.id,
      referralLinkId,
      matchField,
      provisioningPath,
      mutated: true,
    };
  }

  // ── Candidate belongs to a different user ────────────────────────────────────
  // Before treating this as a new conflict, check whether an admin has already
  // approved a link between this actor and the incoming user via the merge-conflict
  // resolution workflow. If an `admin_identity_link` record exists for this pair,
  // respect the admin decision and return found_existing_linked (non-mutating).
  if (incomingUserId) {
    const adminApprovedLink = await client.auditLog.findFirst({
      where: {
        action: "referral.actor.admin_identity_link",
        actorId: candidate.id,
        metadata: {
          path: ["linkedUserId"],
          equals: incomingUserId,
        },
      },
      select: { id: true },
    });
    if (adminApprovedLink) {
      if (isProvisioningCall) {
        await writeAudit(client, "referral.actor.dedupe_found", candidate.id, {
          provisioningPath,
          mutated: false,
          matchField,
          referralLinkId,
          adminIdentityLinkId: adminApprovedLink.id,
          note: "admin_identity_link approved: skipping merge_required",
        });
      }
      return {
        status: "found_existing_linked",
        actorId: candidate.id,
        referralLinkId,
        matchField,
        provisioningPath,
        mutated: false,
        reason: "admin_identity_link",
      };
    }
  }

  if (input.overrideContext) {
    // Create a separate actor bypassing the conflict — only supported path
    const newActor = await client.referralActor.create({ data: buildActorData(input) });
    await writeAudit(client, "referral.actor.dedupe_override_created", newActor.id, {
      provisioningPath,
      mutated: true,
      matchField,
      candidateActorId: candidate.id,
      candidateActorUserId: candidate.userId,
      incomingUserId: input.userId ?? null,
      authorizedBy: input.overrideContext.authorizedBy,
      reason: input.overrideContext.reason,
      overrideContext: input.overrideContext,
    });
    return {
      status: "override_created",
      actorId: newActor.id,
      referralLinkId: null,
      matchField,
      provisioningPath,
      mutated: true,
      overrideContext: input.overrideContext,
    };
  }

  return { conflict: true };
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Find-or-link a ReferralActor using a 7-step priority chain.
 *
 * Check order (no overrideContext):
 *   1. ReferralActor.userId === input.userId
 *   2. ReferralActor by normalised email
 *   3. ReferralActor by normalised phone / whatsapp
 *   4. Legacy Referrer.userId === input.userId (with optional code reuse)
 *   5. EventReferrerAssignment bridge (only when input.eventId is supplied
 *      AND the assignment provides direct person evidence — email or userId)
 *   6. ReferralLink.code (only when input.referralCode is explicitly supplied)
 *   7. No match — create new ReferralActor (inside tx with final re-check)
 *
 * Pass `txClient` to run all reads AND writes inside an outer transaction.
 * When `txClient` is absent the create/link paths manage their own
 * internal transactions.
 */
export async function findOrLinkReferralActor(
  input: FindOrLinkReferralActorInput,
  opts: FindOrLinkReferralActorOpts = {},
  txClient?: Prisma.TransactionClient,
): Promise<DedupeResult> {
  const normEmail = normalizeEmail(input.email);
  const normPhone = normalizePhone(input.phone);
  const normWhatsapp = normalizePhone(input.whatsapp);
  const isProvisioningCall = opts.isProvisioningCall !== false;

  // When an outer tx is supplied use it throughout; otherwise use top-level prisma.
  // The create path (step 7) and legacy-referrer path (step 4) will either
  // run inside `txClient` (if provided) or open their own transaction.
  const db: DbClient = txClient ?? prisma;

  // Helper: run a block inside a transaction, respecting an outer tx if present.
  async function withTx<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    if (txClient) {
      // Already inside an outer transaction — use it directly (no nested $transaction)
      return fn(txClient);
    }
    return prisma.$transaction((tx) => fn(tx as unknown as DbClient));
  }

  // ── Step 1: userId ──────────────────────────────────────────────────────────
  if (input.userId) {
    const byUser = await db.referralActor.findUnique({
      where: { userId: input.userId },
      include: { links: { select: { id: true, isActive: true } } },
    });
    if (byUser) {
      const result = await resolveCandidate(db, byUser, input, "userId", "step1_userId", isProvisioningCall);
      if (!("conflict" in result)) return result;
      // Unreachable: querying by the same userId means candidateUserId === incomingUserId always.
    }
  }

  // ── Step 2: normalised email ────────────────────────────────────────────────
  if (normEmail) {
    const byEmail = await db.referralActor.findFirst({
      where: { email: { equals: normEmail, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
      include: { links: { select: { id: true, isActive: true } } },
    });
    if (byEmail) {
      const result = await resolveCandidate(db, byEmail, input, "email", "step2_email", isProvisioningCall);
      if (!("conflict" in result)) return result;
      await writeAudit(db, "referral.actor.merge_required", byEmail.id, {
        provisioningPath: "step2_email",
        mutated: false,
        matchField: "email",
        candidateActorId: byEmail.id,
        candidateActorUserId: byEmail.userId,
        incomingUserId: input.userId ?? null,
      });
      return {
        status: "merge_required",
        candidateActorId: byEmail.id,
        candidateActorUserId: byEmail.userId,
        incomingUserId: input.userId ?? null,
        matchField: "email",
        provisioningPath: "step2_email",
        mutated: false,
        reason: "Candidate actor belongs to a different user (matched on email)",
      };
    }
  }

  // ── Step 3: normalised phone ────────────────────────────────────────────────
  // Uses the top-level findActorByNormPhone paginated scanner — no row cap,
  // so matches are never missed regardless of dataset size.
  if (normPhone) {
    const byPhone = await findActorByNormPhone(db, "phone", normPhone);
    if (byPhone) {
      const result = await resolveCandidate(db, byPhone, input, "phone", "step3_phone", isProvisioningCall);
      if (!("conflict" in result)) return result;
      await writeAudit(db, "referral.actor.merge_required", byPhone.id, {
        provisioningPath: "step3_phone",
        mutated: false,
        matchField: "phone",
        candidateActorId: byPhone.id,
        candidateActorUserId: byPhone.userId,
        incomingUserId: input.userId ?? null,
      });
      return {
        status: "merge_required",
        candidateActorId: byPhone.id,
        candidateActorUserId: byPhone.userId,
        incomingUserId: input.userId ?? null,
        matchField: "phone",
        provisioningPath: "step3_phone",
        mutated: false,
        reason: "Candidate actor belongs to a different user (matched on phone)",
      };
    }
  }

  if (normWhatsapp && normWhatsapp !== normPhone) {
    const byWhatsapp = await findActorByNormPhone(db, "whatsapp", normWhatsapp);
    if (byWhatsapp) {
      const result = await resolveCandidate(db, byWhatsapp, input, "whatsapp", "step3_whatsapp", isProvisioningCall);
      if (!("conflict" in result)) return result;
      await writeAudit(db, "referral.actor.merge_required", byWhatsapp.id, {
        provisioningPath: "step3_whatsapp",
        mutated: false,
        matchField: "whatsapp",
        candidateActorId: byWhatsapp.id,
        candidateActorUserId: byWhatsapp.userId,
        incomingUserId: input.userId ?? null,
      });
      return {
        status: "merge_required",
        candidateActorId: byWhatsapp.id,
        candidateActorUserId: byWhatsapp.userId,
        incomingUserId: input.userId ?? null,
        matchField: "whatsapp",
        provisioningPath: "step3_whatsapp",
        mutated: false,
        reason: "Candidate actor belongs to a different user (matched on whatsapp)",
      };
    }
  }

  // ── Step 4: legacy Referrer ─────────────────────────────────────────────────
  if (input.userId) {
    const legacyReferrer = await db.referrer.findFirst({
      where: { userId: input.userId, referralActor: null },
      select: { id: true, referralCode: true, fullName: true, isActive: true },
    });

    if (legacyReferrer) {
      return withTx(async (tx) => {
        // Final re-check before any write
        const recheck = await tx.referralActor.findUnique({
          where: { userId: input.userId! },
          include: { links: { select: { id: true, isActive: true } } },
        });
        if (recheck) {
          if (isProvisioningCall) {
            await writeAudit(tx, "referral.actor.dedupe_found", recheck.id, {
              provisioningPath: "step4_legacy_referrer_recheck",
              mutated: false,
              matchField: "userId",
              referralLinkId: recheck.links.find((l) => l.isActive)?.id ?? null,
            });
          }
          return {
            status: "found_existing_linked" as const,
            actorId: recheck.id,
            referralLinkId: recheck.links.find((l) => l.isActive)?.id ?? null,
            matchField: "userId" as MatchField,
            provisioningPath: "step4_legacy_referrer_recheck",
            mutated: false as const,
          };
        }

        // Check code availability BEFORE creating the actor so we never leave
        // a newly-created actor without an active link.
        const legacyCode = legacyReferrer.referralCode;
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.APP_BASE_URL ?? "";

        let existingLink: { id: string; isActive: boolean; referralActorId: string } | null = null;
        if (legacyCode) {
          existingLink = await tx.referralLink.findUnique({
            where: { code: legacyCode },
            select: { id: true, isActive: true, referralActorId: true },
          });

          if (existingLink && !opts.allowNewCodeOnLegacyConflict) {
            // Code is already owned by another link and we are not allowed to
            // generate a replacement — block without creating the actor.
            await writeAudit(tx, "referral.actor.blocked", SYSTEM_ACTOR, {
              provisioningPath: "step4_legacy_code_taken",
              mutated: false,
              matchField: "legacyReferrer",
              reason: "legacy_code_taken",
              legacyReferrerId: legacyReferrer.id,
              takenByLinkId: existingLink.id,
            });
            return {
              status: "blocked" as const,
              reason: "legacy_code_taken",
              matchField: "legacyReferrer" as MatchField,
              provisioningPath: "step4_legacy_code_taken",
              mutated: false as const,
            };
          }
        }

        // Actor is created only after code availability is confirmed above.
        const newActor = await tx.referralActor.create({
          data: { ...buildActorData(input), legacyReferrerId: legacyReferrer.id },
        });

        let referralLinkId: string | null = null;

        if (legacyCode) {
          if (!existingLink) {
            const link = await tx.referralLink.create({
              data: {
                referralActorId: newActor.id,
                code: legacyCode,
                url: `${baseUrl}/?ref=${legacyCode}`,
                isActive: legacyReferrer.isActive,
              },
            });
            referralLinkId = link.id;
          } else {
            // existingLink exists; allowNewCodeOnLegacyConflict must be true
            // (the blocked case above was already returned).
            const newCode = generateCode("REF");
            const link = await tx.referralLink.create({
              data: {
                referralActorId: newActor.id,
                code: newCode,
                url: `${baseUrl}/?ref=${newCode}`,
                isActive: legacyReferrer.isActive,
              },
            });
            referralLinkId = link.id;
          }
        }

        await writeAudit(tx, "referral.actor.dedupe_created", newActor.id, {
          provisioningPath: "step4_legacy_referrer",
          mutated: true,
          matchField: "legacyReferrer",
          referralLinkId,
          legacyReferrerId: legacyReferrer.id,
        });

        return {
          status: "created" as const,
          actorId: newActor.id,
          referralLinkId,
          matchField: "legacyReferrer" as MatchField,
          provisioningPath: "step4_legacy_referrer",
          mutated: true as const,
        };
      });
    }
  }

  // ── Step 5: EventReferrerAssignment bridge ──────────────────────────────────
  // Only fires when input.eventId is supplied AND the assignment provides
  // direct person evidence (email, userId, or referralCode).
  // eventId alone is never enough — at least one identity signal must match.
  if (input.eventId) {
    const directEvidence: Prisma.EventReferrerAssignmentWhereInput[] = [];
    if (input.userId) directEvidence.push({ assignedUserId: input.userId });
    if (normEmail) directEvidence.push({ inviteEmail: normEmail });
    if (input.referralCode) directEvidence.push({ referralCode: input.referralCode });

    if (directEvidence.length > 0) {
      const bridge = await db.eventReferrerAssignment.findFirst({
        where: {
          seriesId: input.eventId,
          OR: directEvidence,
          referralActor: { isNot: null },
        },
        include: {
          referralActor: {
            include: { links: { select: { id: true, isActive: true } } },
          },
        },
      });

      if (bridge?.referralActor) {
        const result = await resolveCandidate(
          db,
          bridge.referralActor,
          input,
          "eventBridge",
          "step5_event_bridge",
          isProvisioningCall,
        );
        if (!("conflict" in result)) return result;
        await writeAudit(db, "referral.actor.merge_required", bridge.referralActor.id, {
          provisioningPath: "step5_event_bridge",
          mutated: false,
          matchField: "eventBridge",
          candidateActorId: bridge.referralActor.id,
          candidateActorUserId: bridge.referralActor.userId,
          incomingUserId: input.userId ?? null,
        });
        return {
          status: "merge_required",
          candidateActorId: bridge.referralActor.id,
          candidateActorUserId: bridge.referralActor.userId,
          incomingUserId: input.userId ?? null,
          matchField: "eventBridge",
          provisioningPath: "step5_event_bridge",
          mutated: false,
          reason: "Candidate actor belongs to a different user (matched via event bridge)",
        };
      }
    }
  }

  // ── Step 6: ReferralLink.code ───────────────────────────────────────────────
  // Only fires when referralCode is explicitly supplied by the caller.
  if (input.referralCode) {
    const link = await db.referralLink.findUnique({
      where: { code: input.referralCode },
      include: {
        referralActor: {
          include: { links: { select: { id: true, isActive: true } } },
        },
      },
    });

    if (link?.referralActor) {
      const result = await resolveCandidate(
        db,
        link.referralActor,
        input,
        "referralCode",
        "step6_referral_code",
        isProvisioningCall,
      );
      if (!("conflict" in result)) return result;
      await writeAudit(db, "referral.actor.merge_required", link.referralActor.id, {
        provisioningPath: "step6_referral_code",
        mutated: false,
        matchField: "referralCode",
        candidateActorId: link.referralActor.id,
        candidateActorUserId: link.referralActor.userId,
        incomingUserId: input.userId ?? null,
      });
      return {
        status: "merge_required",
        candidateActorId: link.referralActor.id,
        candidateActorUserId: link.referralActor.userId,
        incomingUserId: input.userId ?? null,
        matchField: "referralCode",
        provisioningPath: "step6_referral_code",
        mutated: false,
        reason: "Candidate actor belongs to a different user (matched on referralCode)",
      };
    }
  }

  // ── Step 7: create new actor ────────────────────────────────────────────────
  return withTx(async (tx) => {
    // Final re-check before INSERT — covers userId, email, phone, and whatsapp
    // to catch concurrent provisioning races on any identity signal.
    // Every match routes through resolveCandidate so a concurrently-created
    // actor owned by a different user correctly surfaces as merge_required
    // rather than being silently downgraded to found_existing_unlinked.
    const linksSelect = { id: true, isActive: true } as const;

    // Shared helper: resolveCandidate + explicit merge_required on conflict.
    async function recheckResolve(
      candidate: ActorRow,
      matchField: MatchField,
      provisioningPath: string,
    ): Promise<DedupeResult> {
      const r = await resolveCandidate(tx, candidate, input, matchField, provisioningPath, isProvisioningCall);
      if (!("conflict" in r)) return r;
      // Candidate belongs to a different user — surface as merge_required.
      await writeAudit(tx, "referral.actor.merge_required", candidate.id, {
        provisioningPath,
        mutated: false,
        matchField,
        candidateActorId: candidate.id,
        candidateActorUserId: candidate.userId,
        incomingUserId: input.userId ?? null,
      });
      return {
        status: "merge_required" as const,
        candidateActorId: candidate.id,
        candidateActorUserId: candidate.userId,
        incomingUserId: input.userId ?? null,
        matchField,
        provisioningPath,
        mutated: false as const,
        reason: "Concurrent provisioning: candidate belongs to a different user",
      };
    }

    // 1. userId re-check (strong — DB unique index exists)
    if (input.userId) {
      const byUser = await tx.referralActor.findUnique({
        where: { userId: input.userId },
        include: { links: { select: linksSelect } },
      });
      if (byUser) return recheckResolve(byUser, "userId", "step7_recheck_userId");
    }

    // 2. email re-check (insensitive match)
    if (normEmail) {
      const byEmail = await tx.referralActor.findFirst({
        where: { email: { equals: normEmail, mode: "insensitive" } },
        orderBy: { createdAt: "asc" },
        include: { links: { select: linksSelect } },
      });
      if (byEmail) return recheckResolve(byEmail, "email", "step7_recheck_email");
    }

    // 3. phone re-check — full paginated scan via shared scanner
    if (normPhone) {
      const byPhone = await findActorByNormPhone(tx, "phone", normPhone);
      if (byPhone) return recheckResolve(byPhone, "phone", "step7_recheck_phone");
    }

    // 4. whatsapp re-check — full paginated scan via shared scanner
    if (normWhatsapp && normWhatsapp !== normPhone) {
      const byWhatsapp = await findActorByNormPhone(tx, "whatsapp", normWhatsapp);
      if (byWhatsapp) return recheckResolve(byWhatsapp, "whatsapp", "step7_recheck_whatsapp");
    }

    const newActor = await tx.referralActor.create({ data: buildActorData(input) });

    await writeAudit(tx, "referral.actor.dedupe_created", newActor.id, {
      provisioningPath: "step7_new",
      mutated: true,
      matchField: null,
      referralLinkId: null,
    });

    return {
      status: "created" as const,
      actorId: newActor.id,
      referralLinkId: null,
      matchField: null as MatchField,
      provisioningPath: "step7_new",
      mutated: true as const,
    };
  });
}
