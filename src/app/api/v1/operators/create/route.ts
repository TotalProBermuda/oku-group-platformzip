import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  ReferralActorType,
  ReferralActorStatus,
  ReferralCompensationMode,
} from "@prisma/client";
import {
  type OperatorContainer,
  resolveAssignmentDefaults,
  isValidScopeType,
} from "@/lib/operatorContainer";
import {
  findOrLinkReferralActor,
  type MatchField,
} from "@/server/referrals/referralActorDedupeService";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://okuhospitality.com";

function buildLinkCode(prefix = "REF"): string {
  return `${prefix}-${nanoid(8).toUpperCase()}`;
}

function buildLinkUrl(code: string): string {
  return `${APP_URL}/?ref=${code}`;
}

function isReferralActorType(s: string): s is ReferralActorType {
  return Object.values(ReferralActorType).includes(s as ReferralActorType);
}

function isCompensationMode(s: string): s is ReferralCompensationMode {
  return Object.values(ReferralCompensationMode).includes(s as ReferralCompensationMode);
}

/**
 * Thrown inside the transaction when findOrLinkReferralActor returns
 * merge_required. Caught in the outer handler to produce a canonical 409.
 *
 * Convention: HTTP 409 is reserved exclusively for cross-user identity
 * conflicts. Same-user idempotent matches always return 200.
 */
class MergeRequiredError extends Error {
  readonly candidateActorId: string;
  readonly candidateActorUserId: string | null;
  readonly matchField: MatchField;

  constructor(
    candidateActorId: string,
    candidateActorUserId: string | null | undefined,
    matchField: MatchField,
  ) {
    super("merge_required");
    this.name = "MergeRequiredError";
    this.candidateActorId = candidateActorId;
    this.candidateActorUserId = candidateActorUserId ?? null;
    this.matchField = matchField;
  }
}

type CreateBody = {
  mode?: "activate" | "userOnly";
  container?: OperatorContainer;
  actor?: {
    /** Preferred: stable code from ReferralActorTypeDef (built-in or custom). */
    actorTypeCode?: string;
    /** Back-compat: enum value. Used when actorTypeCode is absent. */
    actorType?: string;
    displayName?: string;
    organizationName?: string | null;
    phone?: string | null;
    email?: string | null;
    whatsapp?: string | null;
  };
  compensation?: {
    isCommissionEligible?: boolean;
    mode?: string;
    rateBps?: number | null;
    flatAmountCents?: number | null;
  };
  user?: {
    attachExistingUserId?: string | null;
  };
};

function validateContainer(c: OperatorContainer | undefined): asserts c is OperatorContainer {
  if (!c || typeof c !== "object") throw Object.assign(new Error("container is required"), { status: 400 });
  if (c.kind === "entity") {
    if (!c.parentEntityId) throw Object.assign(new Error("container.parentEntityId is required"), { status: 400 });
  } else if (c.kind === "scope") {
    if (!isValidScopeType(c.scopeType)) {
      throw Object.assign(new Error(`invalid scopeType: ${c.scopeType}`), { status: 400 });
    }
    if (c.scopeType !== "GLOBAL" && !c.scopeId) {
      throw Object.assign(new Error("scopeId required for non-GLOBAL scope"), { status: 400 });
    }
  } else if (c.kind === "soloReferrer") {
    if (!c.legacyReferrerId) {
      throw Object.assign(new Error("container.legacyReferrerId is required"), { status: 400 });
    }
  } else {
    throw Object.assign(new Error("container.kind is invalid"), { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { roles, userId: performedByUserId } = await requireSession();
    requirePermission(roles, "admin:users:edit");

    const body = (await req.json()) as CreateBody;
    const mode: "activate" | "userOnly" = body.mode === "userOnly" ? "userOnly" : "activate";
    validateContainer(body.container);
    const container = body.container;

    const actorIn = body.actor ?? {};
    const displayName = actorIn.displayName?.trim();
    if (!displayName) {
      return NextResponse.json({ ok: false, error: "actor.displayName is required" }, { status: 400 });
    }
    const email = actorIn.email?.trim().toLowerCase() ?? "";
    if (!email) {
      return NextResponse.json({ ok: false, error: "actor.email is required" }, { status: 400 });
    }

    // Resolve actor type from either the new code (preferred) or the legacy enum
    // (back-compat). Custom type codes resolve to legacyEnumValue=OTHER under
    // the hood, so all downstream code that joins on the enum keeps working.
    let actorType: ReferralActorType;
    let actorTypeCode: string | null = null;
    if (actorIn.actorTypeCode) {
      const def = await prisma.referralActorTypeDef.findUnique({
        where: { code: actorIn.actorTypeCode },
        select: { code: true, isActive: true, legacyEnumValue: true },
      });
      if (!def || !def.isActive) {
        return NextResponse.json({ ok: false, error: `actor.actorTypeCode "${actorIn.actorTypeCode}" not found or inactive` }, { status: 400 });
      }
      actorTypeCode = def.code;
      actorType = def.legacyEnumValue;
    } else if (actorIn.actorType && isReferralActorType(actorIn.actorType)) {
      actorType = actorIn.actorType;
      // Best-effort lookup of the canonical built-in code for this enum value.
      const def = await prisma.referralActorTypeDef.findFirst({
        where: { legacyEnumValue: actorType, isBuiltin: true },
        select: { code: true },
        orderBy: { sortOrder: "asc" },
      });
      actorTypeCode = def?.code ?? null;
    } else {
      return NextResponse.json({ ok: false, error: "actor.actorTypeCode (or legacy actor.actorType) is required" }, { status: 400 });
    }
    const isUserOnly = mode === "userOnly";
    const actorStatus: ReferralActorStatus = isUserOnly
      ? ReferralActorStatus.INACTIVE
      : ReferralActorStatus.ACTIVE;

    const compIn = body.compensation ?? {};
    const compMode: ReferralCompensationMode = compIn.mode && isCompensationMode(compIn.mode)
      ? compIn.mode
      : ReferralCompensationMode.NONE;
    const isCommissionEligible = compIn.isCommissionEligible ?? compMode !== ReferralCompensationMode.NONE;
    if (
      (compMode === ReferralCompensationMode.PERCENT_OF_TRANSACTION ||
        compMode === ReferralCompensationMode.PERCENT_OF_PARENT_COMMISSION) &&
      (compIn.rateBps == null || compIn.rateBps <= 0)
    ) {
      return NextResponse.json({ ok: false, error: "rateBps required for percent compensation modes" }, { status: 400 });
    }
    if (
      (compMode === ReferralCompensationMode.FLAT_PER_COVER ||
        compMode === ReferralCompensationMode.FLAT_PER_PARTY) &&
      (compIn.flatAmountCents == null || compIn.flatAmountCents <= 0)
    ) {
      return NextResponse.json({ ok: false, error: "flatAmountCents required for flat compensation modes" }, { status: 400 });
    }

    let legacyReferrerId: string | undefined;
    if (container.kind === "soloReferrer") {
      const legacy = await prisma.referrer.findUnique({
        where: { id: container.legacyReferrerId },
        include: { referralActor: { select: { id: true } } },
      });
      if (!legacy) {
        return NextResponse.json({ ok: false, error: "legacy Referrer not found" }, { status: 404 });
      }
      if (legacy.referralActor) {
        return NextResponse.json(
          { ok: false, error: "this referrer already has a ReferralActor", actorId: legacy.referralActor.id },
          { status: 409 }
        );
      }
      legacyReferrerId = legacy.id;
    }

    const attachUserId: string | null = body.user?.attachExistingUserId ?? null;

    if (attachUserId) {
      const existing = await prisma.user.findUnique({ where: { id: attachUserId }, select: { id: true, email: true } });
      if (!existing) {
        return NextResponse.json({ ok: false, error: "attachExistingUserId not found" }, { status: 404 });
      }
      if ((existing.email ?? "").toLowerCase() !== email) {
        return NextResponse.json({ ok: false, error: "attachExistingUserId does not match the submitted email" }, { status: 400 });
      }
    } else {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        return NextResponse.json(
          {
            ok: false,
            error: "A user with this email already exists. Resubmit with user.attachExistingUserId to link.",
            existingUserId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const defaults = resolveAssignmentDefaults(container);

    let dedupeStatus: string = "created";
    let dedupeMatchField: MatchField = null;

    const result = await prisma.$transaction(async (tx) => {
      let createdUserId: string | null = null;
      if (!attachUserId) {
        const created = await tx.user.create({
          data: {
            email,
            name: displayName,
            phone: actorIn.phone?.trim() || null,
            status: "ACTIVE",
            roles: { create: [{ roleKey: "REFERRER" }] },
          },
          select: { id: true },
        });
        createdUserId = created.id;
      }
      const linkedUserId = (createdUserId ?? attachUserId)!;

      // ── Actor resolution via canonical dedupe service ───────────────────────
      // Convention: same email/phone + SAME user → idempotent 200 (found_existing_*).
      //             same email/phone + DIFFERENT user → 409 merge_required.
      //             409 is reserved exclusively for cross-user identity conflicts.
      const dedupeResult = await findOrLinkReferralActor(
        {
          actorType,
          displayName,
          organizationName: actorIn.organizationName?.trim() ?? null,
          email: actorIn.email?.trim() ?? undefined,
          phone: actorIn.phone?.trim() ?? undefined,
          whatsapp: actorIn.whatsapp?.trim() ?? undefined,
          userId: linkedUserId,
          initiatedByUserId: performedByUserId,
        },
        { isProvisioningCall: true },
        tx,
      );

      if (dedupeResult.status === "merge_required") {
        throw new MergeRequiredError(
          dedupeResult.candidateActorId,
          dedupeResult.candidateActorUserId,
          dedupeResult.matchField,
        );
      }

      if (dedupeResult.status === "blocked") {
        throw Object.assign(
          new Error(`Actor provisioning blocked: ${dedupeResult.reason}`),
          { status: 409 },
        );
      }

      dedupeStatus = dedupeResult.status;
      dedupeMatchField = dedupeResult.matchField;

      const isReused =
        dedupeResult.status === "found_existing_linked" ||
        dedupeResult.status === "found_existing_unlinked" ||
        dedupeResult.status === "linked" ||
        dedupeResult.status === "reactivated_link";

      // Fetch actor for displayName (needed for audit log).
      const actorRow = await tx.referralActor.findUniqueOrThrow({
        where: { id: dedupeResult.actorId },
        select: { id: true, displayName: true, legacyReferrerId: true },
      });

      // Only patch brand-new actors (status === "created").
      // Matched actors (found_existing_linked / linked / reactivated_link) belong
      // to an existing governed identity path and MUST NOT be reclassified.
      // buildActorData does not set actorTypeCode, status, or legacyReferrerId,
      // so we fill those in here — for created actors only.
      if (dedupeResult.status === "created") {
        await tx.referralActor.update({
          where: { id: actorRow.id },
          data: {
            actorTypeCode: actorTypeCode ?? undefined,
            status: actorStatus,
            legacyReferrerId: legacyReferrerId ?? null,
          },
        });
      }

      // soloReferrer + reused actor: bind legacyReferrerId so the legacy
      // Referrer row never stays orphaned. Refuse if already bound elsewhere.
      if (isReused && container.kind === "soloReferrer" && legacyReferrerId) {
        if (actorRow.legacyReferrerId && actorRow.legacyReferrerId !== legacyReferrerId) {
          throw Object.assign(
            new Error("existing actor is already linked to a different legacy referrer"),
            { status: 409 }
          );
        }
        if (!actorRow.legacyReferrerId) {
          await tx.referralActor.update({
            where: { id: actorRow.id },
            data: { legacyReferrerId },
          });
        }
      }

      const actor = { id: actorRow.id, displayName: actorRow.displayName };
      const reusedActor = isReused;

      // Idempotency: if this actor already has an assignment for the exact
      // same container (parentEntity/scope), refuse rather than silently
      // creating a duplicate that would muddle compensation context.
      if (reusedActor) {
        const dupe = await tx.referralAssignment.findFirst({
          where: {
            referralActorId: actor.id,
            scopeType: defaults.scopeType,
            scopeId: defaults.scopeId ?? null,
            parentEntityType: defaults.parentEntityType ?? null,
            parentEntityId: defaults.parentEntityId ?? null,
          },
          select: { id: true },
        });
        if (dupe) {
          throw Object.assign(
            new Error("this operator is already assigned to this container"),
            { status: 409 }
          );
        }
      }

      // userOnly defers activation: assignment + link are written but kept
      // inactive so attribution/payout pipelines never pick them up until an
      // admin explicitly promotes the operator.
      const assignment = await tx.referralAssignment.create({
        data: {
          referralActorId: actor.id,
          scopeType: defaults.scopeType,
          scopeId: defaults.scopeId,
          parentEntityType: defaults.parentEntityType,
          parentEntityId: defaults.parentEntityId,
          isCommissionEligible,
          compensationMode: compMode,
          rateBps: compIn.rateBps ?? null,
          flatAmountCents: compIn.flatAmountCents ?? null,
          isActive: !isUserOnly,
        },
        select: { id: true, scopeType: true, scopeId: true, compensationMode: true, rateBps: true, flatAmountCents: true, isActive: true },
      });

      let linkCode = buildLinkCode();
      let attempts = 0;
      while (await tx.referralLink.findUnique({ where: { code: linkCode }, select: { id: true } })) {
        if (attempts++ > 10) throw new Error("Could not generate a unique referral code");
        linkCode = buildLinkCode();
      }
      const link = await tx.referralLink.create({
        data: {
          referralActorId: actor.id,
          referralAssignmentId: assignment.id,
          code: linkCode,
          url: buildLinkUrl(linkCode),
          isActive: !isUserOnly,
        },
        select: { id: true, code: true, url: true, isActive: true },
      });

      if (createdUserId) {
        await tx.userAuditLog.create({
          data: {
            targetUserId: createdUserId,
            performedByUserId,
            action: "USER_CREATED",
            summary: isUserOnly
              ? `Created via Add Operator (user-only / pending activation): ${displayName}`
              : `Created via Add Operator: ${displayName}`,
            newValue: { email, name: displayName, role: "REFERRER", pendingActivation: isUserOnly },
          },
        });
      }
      const meta = (extra: Record<string, unknown>) => ({
        actorId: actor.id,
        container,
        ...extra,
      });
      await tx.auditLog.create({
        data: {
          actorId: performedByUserId,
          action: reusedActor ? "REFERRAL_ACTOR_REUSED" : "REFERRAL_ACTOR_CREATED",
          metadata: meta({ displayName: actor.displayName, actorType, status: actorStatus, legacyReferrerId: legacyReferrerId ?? null, reused: reusedActor, dedupeStatus }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: performedByUserId,
          action: "REFERRAL_ASSIGNMENT_CREATED",
          metadata: meta({
            assignmentId: assignment.id,
            scopeType: assignment.scopeType,
            scopeId: assignment.scopeId,
            compensationMode: assignment.compensationMode,
            rateBps: assignment.rateBps,
            flatAmountCents: assignment.flatAmountCents,
            isActive: assignment.isActive,
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: performedByUserId,
          action: "REFERRAL_LINK_GENERATED",
          metadata: meta({ linkId: link.id, code: link.code, url: link.url, isActive: link.isActive }),
        },
      });

      return { createdUserId, actor, assignment, link };
    });

    // Convention: idempotent same-user match → 200 (no new resource was minted).
    //             newly provisioned actor/user → 201.
    const isIdempotentReuse =
      dedupeStatus === "found_existing_linked" ||
      dedupeStatus === "found_existing_unlinked" ||
      dedupeStatus === "linked" ||
      dedupeStatus === "reactivated_link";

    return NextResponse.json(
      {
        ok: true,
        mode,
        actorId: result.actor.id,
        assignmentId: result.assignment.id,
        linkId: result.link.id,
        linkCode: result.link.code,
        linkUrl: result.link.url,
        createdUserId: result.createdUserId,
        // Additive fields: callers may inspect these but existing code need not.
        status: dedupeStatus,
        matchField: dedupeMatchField,
      },
      { status: isIdempotentReuse ? 200 : 201 }
    );
  } catch (e: unknown) {
    // Convention: 409 merge_required = cross-user identity conflict.
    // Same-user idempotent matches are never errors; they return 200.
    if (e instanceof MergeRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          code: "merge_required",
          candidateActorId: e.candidateActorId,
          candidateActorUserId: e.candidateActorUserId,
          matchField: e.matchField,
        },
        { status: 409 }
      );
    }
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
