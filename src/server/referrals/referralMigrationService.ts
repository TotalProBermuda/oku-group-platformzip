import { prisma } from "@/lib/prisma";
import { mapReferrerTypeToActorType } from "./referralActorService";
import { isSoleProprietorPair } from "./organizationResolver";
import { findOrLinkReferralActor } from "./referralActorDedupeService";

/**
 * ADAPTOR MIGRATION — Phase 1
 *
 * Backfills ReferralActor records from existing legacy Referrer rows.
 * Safe to run multiple times (idempotent — skips already-migrated referrers).
 *
 * Does NOT alter any existing Referrer, CompensationPlan, or CommissionEntry data.
 * All existing FK relationships remain intact.
 *
 * merge_required handling:
 *   When the canonical dedupe chain detects a matching actor already owned by a
 *   different user, the migration LOGS the conflict and CONTINUES — it never
 *   auto-links an actor owned by another user.
 *   The `opts.strict` flag causes the runner to exit non-zero after all rows
 *   are processed if any merge_required conflicts were found; individual rows
 *   are still logged-and-skipped even under strict mode.
 */
export async function migrateReferrersToActors(opts?: { strict?: boolean }): Promise<{
  migrated: number;
  skipped: number;
  mergeConflicts: Array<{
    referrerId: string;
    displayName: string;
    candidateActorId: string;
    matchField: string | null;
    reason: string;
  }>;
  errors: Array<{ referrerId: string; error: string }>;
}> {
  const referrers = await prisma.referrer.findMany({
    where: { referralActor: null },
    include: { compensationPlan: true },
  });

  let migrated = 0;
  let skipped = 0;
  const mergeConflicts: Array<{
    referrerId: string;
    displayName: string;
    candidateActorId: string;
    matchField: string | null;
    reason: string;
  }> = [];
  const errors: Array<{ referrerId: string; error: string }> = [];

  for (const referrer of referrers) {
    try {
      const baseMeta =
        (referrer.metadataJson as Record<string, unknown> | null | undefined) ?? null;
      const orgName = referrer.organizationName ?? undefined;
      const isSelfManaged =
        !!orgName && isSoleProprietorPair(orgName, referrer.fullName);
      const metadataJson: Record<string, unknown> = isSelfManaged
        ? {
            ...(baseMeta ?? {}),
            _isSoleProprietor: {
              flaggedAt: new Date().toISOString(),
              flaggedBy: "system:migration",
              reason: "organization_name_equals_display_name",
            },
            provisioningPath: "migration",
          }
        : { ...(baseMeta ?? {}), provisioningPath: "migration" };

      // Use the canonical dedupe chain instead of a bare create. This catches
      // the case where an operator already provisioned an actor for the same
      // person via phone/email before the migration ran.
      const dedupeResult = await findOrLinkReferralActor(
        {
          actorType: mapReferrerTypeToActorType(referrer.referrerType),
          displayName: referrer.fullName,
          organizationName: orgName,
          phone: referrer.phone ?? undefined,
          email: referrer.email ?? undefined,
          whatsapp: referrer.whatsapp ?? undefined,
          userId: referrer.userId ?? undefined,
          referralCode: referrer.referralCode ?? undefined,
          metadataJson,
        },
        { isProvisioningCall: true, allowNewCodeOnLegacyConflict: false },
      );

      // merge_required: matching actor belongs to a different user — log and skip.
      // AuditLog row (referral.actor.merge_required) already written by the
      // dedupe service. Metadata includes provisioningPath: "migration",
      // matchField, candidateActorId, and mutated: false.
      if (dedupeResult.status === "merge_required") {
        mergeConflicts.push({
          referrerId: referrer.id,
          displayName: referrer.fullName,
          candidateActorId: dedupeResult.candidateActorId,
          matchField: dedupeResult.matchField,
          reason: dedupeResult.reason,
        });
        console.warn(
          `[migration] merge_required for referrer ${referrer.id} (${referrer.fullName})`,
          {
            candidateActorId: dedupeResult.candidateActorId,
            matchField: dedupeResult.matchField,
            reason: dedupeResult.reason,
            provisioningPath: "migration",
            mutated: false,
          },
        );
        skipped++;
        continue;
      }

      // blocked: legacy code already taken — log and skip.
      if (dedupeResult.status === "blocked") {
        errors.push({
          referrerId: referrer.id,
          error: `blocked: ${dedupeResult.reason}`,
        });
        skipped++;
        continue;
      }

      const actorId = dedupeResult.actorId;

      if (dedupeResult.status === "created") {
        // New actor: create assignment, optionally create link, and back-link.
        //
        // Link creation guard: findOrLinkReferralActor step 4 (legacy referrer
        // path) already creates a ReferralLink internally and returns a non-null
        // `referralLinkId`. Creating a second link with the same code triggers a
        // unique constraint failure. Skip link creation when the dedupe service
        // already provisioned one.
        if (referrer.compensationPlan) {
          const plan = referrer.compensationPlan;
          await prisma.referralAssignment.create({
            data: {
              referralActorId: actorId,
              scopeType: "GLOBAL",
              isCommissionEligible: true,
              compensationMode: resolveCompensationMode(plan),
              rateBps: plan.commissionPercent
                ? Math.round(Number(plan.commissionPercent) * 100)
                : undefined,
              flatAmountCents: plan.flatPerCoverCents ?? plan.flatPerPartyCents ?? undefined,
              legacyCompensationPlanId: plan.id,
            },
          });
        }

        if (!dedupeResult.referralLinkId) {
          // Step 7 (generic create) — the dedupe service did NOT create a link;
          // create one now using the legacy referralCode.
          await prisma.referralLink.create({
            data: {
              referralActorId: actorId,
              code: referrer.referralCode,
              url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://okuhospitality.com"}/?ref=${referrer.referralCode}`,
              isActive: referrer.isActive,
            },
          });
        }
        // else: step 4 (legacy referrer path) already created the link; reuse it.

        // Back-link so Referrer.referralActor and ReferralActor.legacyReferrer
        // resolve correctly. Only set when the actor was freshly created — for
        // found/linked statuses the actor owns its own identity and we do NOT
        // overwrite an existing legacyReferrerId.
        await prisma.referralActor.update({
          where: { id: actorId },
          data: { legacyReferrerId: referrer.id },
        });

        migrated++;
      } else {
        // found_existing_linked / found_existing_unlinked / linked / reactivated_link:
        // An actor already exists and matches this referrer. The migration
        // already ran for this person (possibly via a different code path).
        // Do not overwrite legacyReferrerId — count as skipped.
        skipped++;
      }
    } catch (err) {
      errors.push({
        referrerId: referrer.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { migrated, skipped, mergeConflicts, errors };
}

/**
 * ADAPTOR MIGRATION — EventReferrerAssignment → ReferralActor
 *
 * Creates ReferralActor records for each EventReferrerAssignment that hasn't
 * been migrated yet. Uses INFLUENCER_SUB_REFERRER as the actor type.
 * All legacy EventReferrerAssignment FKs stay intact.
 *
 * merge_required handling: same log-and-skip semantics as migrateReferrersToActors.
 */
export async function migrateEventReferrersToActors(opts?: { strict?: boolean }): Promise<{
  migrated: number;
  skipped: number;
  mergeConflicts: Array<{
    assignmentId: string;
    displayName: string;
    candidateActorId: string;
    matchField: string | null;
    reason: string;
  }>;
  errors: Array<{ assignmentId: string; error: string }>;
}> {
  const assignments = await prisma.eventReferrerAssignment.findMany({
    where: { referralActor: null },
    include: {
      parentInfluencer: { select: { id: true } },
    },
  });

  let migrated = 0;
  let skipped = 0;
  const mergeConflicts: Array<{
    assignmentId: string;
    displayName: string;
    candidateActorId: string;
    matchField: string | null;
    reason: string;
  }> = [];
  const errors: Array<{ assignmentId: string; error: string }> = [];

  for (const assignment of assignments) {
    try {
      const dedupeResult = await findOrLinkReferralActor(
        {
          actorType: "INFLUENCER_SUB_REFERRER",
          displayName: assignment.displayName,
          email: assignment.inviteEmail ?? undefined,
          userId: assignment.assignedUserId ?? undefined,
          referralCode: assignment.referralCode ?? undefined,
          metadataJson: { provisioningPath: "migration" },
        },
        { isProvisioningCall: true },
      );

      // merge_required: log and skip — never auto-link an actor owned by another user.
      if (dedupeResult.status === "merge_required") {
        mergeConflicts.push({
          assignmentId: assignment.id,
          displayName: assignment.displayName,
          candidateActorId: dedupeResult.candidateActorId,
          matchField: dedupeResult.matchField,
          reason: dedupeResult.reason,
        });
        console.warn(
          `[migration] merge_required for EventReferrerAssignment ${assignment.id} (${assignment.displayName})`,
          {
            candidateActorId: dedupeResult.candidateActorId,
            matchField: dedupeResult.matchField,
            reason: dedupeResult.reason,
            provisioningPath: "migration",
            mutated: false,
          },
        );
        skipped++;
        continue;
      }

      if (dedupeResult.status === "blocked") {
        errors.push({
          assignmentId: assignment.id,
          error: `blocked: ${dedupeResult.reason}`,
        });
        skipped++;
        continue;
      }

      const actorId = dedupeResult.actorId;

      if (dedupeResult.status === "created") {
        await prisma.referralAssignment.create({
          data: {
            referralActorId: actorId,
            scopeType: assignment.scopeType === "SERIES" ? "SERIES" : "GLOBAL",
            scopeId: assignment.seriesId ?? undefined,
            parentEntityType: "INFLUENCER",
            parentEntityId: assignment.parentInfluencerId,
            isCommissionEligible: assignment.isCommissionEligible,
            compensationMode:
              assignment.commissionMode === "PERCENT_OF_INFLUENCER_COMMISSION"
                ? "PERCENT_OF_PARENT_COMMISSION"
                : "NONE",
            rateBps: assignment.commissionShareBps ?? undefined,
          },
        });

        // Link creation guard: step 4 / step 6 inside findOrLinkReferralActor
        // may have already created a ReferralLink (referralLinkId is non-null).
        // Creating a second link with the same code triggers a unique constraint
        // failure. Only create when the dedupe service did NOT provision one.
        if (!dedupeResult.referralLinkId) {
          await prisma.referralLink.create({
            data: {
              referralActorId: actorId,
              code: assignment.referralCode,
              url: assignment.referralUrl ?? undefined,
              qrCodeDataUrl: assignment.qrCodeImageUrl ?? undefined,
              isActive: assignment.status === "ACTIVE",
            },
          });
        }
        // else: dedupe service already created the link; reuse it.

        // Back-link: only when freshly created (same reasoning as migrateReferrersToActors).
        await prisma.referralActor.update({
          where: { id: actorId },
          data: { legacyEventReferrerAssignmentId: assignment.id },
        });

        migrated++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push({
        assignmentId: assignment.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { migrated, skipped, mergeConflicts, errors };
}

function resolveCompensationMode(plan: {
  modelType: string;
  commissionPercent: unknown;
  flatPerCoverCents: number | null;
  flatPerPartyCents: number | null;
}): "NONE" | "PERCENT_OF_TRANSACTION" | "FLAT_PER_COVER" | "FLAT_PER_PARTY" {
  if (plan.commissionPercent) return "PERCENT_OF_TRANSACTION";
  if (plan.flatPerCoverCents) return "FLAT_PER_COVER";
  if (plan.flatPerPartyCents) return "FLAT_PER_PARTY";
  return "NONE";
}
