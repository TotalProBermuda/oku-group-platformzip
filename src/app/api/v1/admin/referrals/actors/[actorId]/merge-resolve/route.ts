import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { findOrLinkReferralActor } from "@/server/referrals/referralActorDedupeService";

const Body = z.object({
  decision: z.enum(["link", "separate"]),
  reason: z.string().min(1, "Reason is required"),
  conflictAuditId: z.string().min(1, "conflictAuditId is required"),
  incomingUserId: z.string().nullable().optional(),
});

/**
 * POST /api/v1/admin/referrals/actors/[actorId]/merge-resolve
 *
 * SUPERADMIN only. Resolves a pending merge conflict for a ReferralActor.
 *
 * Integrity guarantee: verifies that conflictAuditId's candidateActorId
 * matches the actorId in the path, preventing cross-actor resolution.
 *
 * AuditLog is append-only. Writes a NEW `referral.actor.merge_resolved` entry
 * referencing the original conflict via `originalConflictAuditId`.
 * The original `merge_required` entry is never mutated.
 *
 * Decisions:
 *  - `link`: records the resolution as identity-linked. Optionally sets
 *    actor.userId when the candidate actor is unowned AND incomingUserId is
 *    provided. NO change to commission, payout, attribution, or compensation.
 *
 *  - `separate`: requires a valid incomingUserId. Calls findOrLinkReferralActor
 *    with overrideContext to create a new explicitly-audited actor. The
 *    merge_resolved audit entry is written ONLY after override_created succeeds.
 *    Returns 400 if incomingUserId is missing, 500 if override creation fails.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ actorId: string }> },
) {
  try {
    const { userId: adminUserId, roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { actorId } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid body", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { decision, reason, conflictAuditId, incomingUserId } = parsed.data;

    const [candidateActor, conflictAudit] = await Promise.all([
      prisma.referralActor.findUnique({
        where: { id: actorId },
        select: {
          id: true,
          userId: true,
          displayName: true,
          actorType: true,
          email: true,
          phone: true,
          whatsapp: true,
        },
      }),
      prisma.auditLog.findUnique({
        where: { id: conflictAuditId },
        select: { id: true, action: true, actorId: true, metadata: true },
      }),
    ]);

    if (!candidateActor) {
      return NextResponse.json({ ok: false, error: "Actor not found" }, { status: 404 });
    }

    if (!conflictAudit || conflictAudit.action !== "referral.actor.merge_required") {
      return NextResponse.json(
        { ok: false, error: "Conflict audit entry not found or wrong type" },
        { status: 404 },
      );
    }

    // ── Integrity guard: verify this conflict belongs to actorId ──────────────
    const conflictMeta = (conflictAudit.metadata as Record<string, unknown> | null) ?? {};
    const conflictCandidateActorId = (conflictMeta.candidateActorId ?? conflictAudit.actorId) as string;
    if (conflictCandidateActorId !== actorId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Conflict does not belong to this actor",
          conflictCandidateActorId,
          requestedActorId: actorId,
        },
        { status: 400 },
      );
    }

    // ── incomingUserId consistency guard ─────────────────────────────────────
    // If the audit entry recorded an incomingUserId, the caller may not
    // supply a different one — that would produce a misleading audit trail.
    const metaIncomingUserId = (conflictMeta.incomingUserId as string | null) ?? null;
    if (metaIncomingUserId && incomingUserId && incomingUserId !== metaIncomingUserId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `incomingUserId mismatch: conflict recorded '${metaIncomingUserId}' ` +
            `but request provided '${incomingUserId}'. ` +
            "Omit incomingUserId in the request to use the recorded value.",
        },
        { status: 400 },
      );
    }

    // ── Guard: already resolved? ──────────────────────────────────────────────
    const alreadyResolved = await prisma.auditLog.findFirst({
      where: {
        action: "referral.actor.merge_resolved",
        metadata: { path: ["originalConflictAuditId"], equals: conflictAuditId },
      },
      select: { id: true },
    });
    if (alreadyResolved) {
      return NextResponse.json(
        { ok: false, error: "This conflict has already been resolved" },
        { status: 409 },
      );
    }

    // ── Resolve: link ─────────────────────────────────────────────────────────
    if (decision === "link") {
      const resolvedIncomingUserId =
        incomingUserId ?? (conflictMeta.incomingUserId as string | null) ?? null;

      // Whether the candidate actor is already owned by a different user.
      // When already owned, we cannot set actor.userId — instead we write a
      // durable admin_identity_link audit record so the dedupe service can
      // recognize this admin-approved pairing and not re-raise the conflict.
      const actorAlreadyOwned =
        !!candidateActor.userId &&
        candidateActor.userId !== resolvedIncomingUserId;

      await prisma.$transaction(async (tx) => {
        if (resolvedIncomingUserId && !candidateActor.userId) {
          // Unowned actor — we can set userId directly (the normal path).
          await tx.referralActor.update({
            where: { id: actorId },
            data: { userId: resolvedIncomingUserId },
          });
        } else if (actorAlreadyOwned && resolvedIncomingUserId) {
          // Already-owned actor — write the durable identity-link proof record.
          // The dedupe service checks for this entry (action + actorId column +
          // metadata.linkedUserId) before emitting merge_required for the same pair,
          // so this admin decision is respected on all future provisioning passes.
          await tx.auditLog.create({
            data: {
              actorId,
              action: "referral.actor.admin_identity_link",
              metadata: {
                actorId,
                linkedUserId: resolvedIncomingUserId,
                reason,
                resolvedByUserId: adminUserId,
                originalConflictAuditId: conflictAuditId,
              },
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorId,
            action: "referral.actor.merge_resolved",
            metadata: {
              originalConflictAuditId: conflictAuditId,
              decision: "link",
              reason,
              resolvedByUserId: adminUserId,
              candidateActorId: actorId,
              incomingUserId: resolvedIncomingUserId,
              userLinked: !!(resolvedIncomingUserId && !candidateActor.userId),
              identityLinkWritten: !!(actorAlreadyOwned && resolvedIncomingUserId),
            },
          },
        });
      });

      return NextResponse.json({ ok: true, decision: "link", actorId });
    }

    // ── Resolve: separate ─────────────────────────────────────────────────────
    if (decision === "separate") {
      const targetUserId =
        incomingUserId ?? (conflictMeta.incomingUserId as string | null) ?? null;

      if (!targetUserId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "incomingUserId is required to create a separate actor. " +
              "Supply it in the request body or ensure it is present in the conflict audit entry.",
          },
          { status: 400 },
        );
      }

      // For the override actor, use the incoming user's own name as displayName
      // (their identity, not the candidate's). Email/phone/whatsapp are kept from
      // the candidate because those are the shared fields that triggered the match —
      // they belong to the incoming user's identity evidence too.
      const incomingUserRecord = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { name: true },
      });
      const overrideDisplayName =
        incomingUserRecord?.name?.trim() || candidateActor.displayName;

      const separateResult = await findOrLinkReferralActor(
        {
          actorType: candidateActor.actorType,
          displayName: overrideDisplayName,
          email: candidateActor.email ?? undefined,
          phone: candidateActor.phone ?? undefined,
          whatsapp: candidateActor.whatsapp ?? undefined,
          userId: targetUserId,
          initiatedByUserId: adminUserId,
          overrideContext: { authorizedBy: adminUserId, reason },
        },
        { isProvisioningCall: true },
      );

      if (separateResult.status !== "override_created") {
        return NextResponse.json(
          {
            ok: false,
            error: `Override actor creation failed (got status: ${separateResult.status}). ` +
              "The incoming user may already be linked to an actor. " +
              "Consider using 'link' instead.",
          },
          { status: 409 },
        );
      }

      const overrideActorId = separateResult.actorId;

      await prisma.auditLog.create({
        data: {
          actorId,
          action: "referral.actor.merge_resolved",
          metadata: {
            originalConflictAuditId: conflictAuditId,
            decision: "separate",
            reason,
            resolvedByUserId: adminUserId,
            candidateActorId: actorId,
            incomingUserId: targetUserId,
            overrideActorId,
          },
        },
      });

      return NextResponse.json({
        ok: true,
        decision: "separate",
        actorId,
        overrideActorId,
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown decision" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: e?.status ?? 500 },
    );
  }
}
