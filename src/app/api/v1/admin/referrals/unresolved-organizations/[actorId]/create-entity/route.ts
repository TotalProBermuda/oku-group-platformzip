import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { logReferralOrgAction } from "@/server/referrals/organizationAudit";

/**
 * Create a new approved Entity from an unresolved organizationName, then
 * link the actor's assignments to it.
 *
 * Owner-only because this creates a payable referral organization mapping.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ actorId: string }> },
) {
  try {
    const session = await requireAdminRoles(req, ["SUPERADMIN"]);

    const { actorId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      displayName?: string;
      organizationKind?: string;
      websiteUrl?: string;
      type?: "PERSON" | "COMPANY";
    };

    const displayName = body.displayName?.trim();
    if (!displayName) {
      return NextResponse.json({ ok: false, error: "displayName is required" }, { status: 400 });
    }

    const actor = await prisma.referralActor.findUnique({
      where: { id: actorId },
      select: { id: true, displayName: true, organizationName: true, metadataJson: true },
    });
    if (!actor) {
      return NextResponse.json({ ok: false, error: "Actor not found" }, { status: 404 });
    }

    // Atomic block: re-check for an existing Entity inside the transaction
    // (narrows the create-vs-create race window vs. find-then-create
    // outside), create or reuse, link assignments, persist audit row — all
    // commit/roll-back together so we never get a state change without an
    // audit entry. Note: Entity.displayName has no DB-level UNIQUE
    // constraint by design (hosts/sponsors may legitimately share names),
    // so the duplicate guard remains best-effort; tightening is Phase B.
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.entity.findFirst({
        where: { displayName: { equals: displayName, mode: "insensitive" } },
        select: { id: true, displayName: true },
      });

      const entity =
        existing ??
        (await tx.entity.create({
          data: {
            displayName,
            type: body.type ?? "COMPANY",
            organizationKind: body.organizationKind ?? null,
            websiteUrl: body.websiteUrl ?? null,
          },
          select: { id: true, displayName: true },
        }));

      const meta = (actor.metadataJson as Record<string, unknown> | null) ?? {};
      const audit = {
        ...meta,
        _resolvedOrganization: {
          rawText: actor.organizationName,
          resolvedToEntityId: entity.id,
          resolvedToDisplayName: entity.displayName,
          resolvedAt: new Date().toISOString(),
          resolvedBy: `user:${session.userId}`,
          method: existing ? "admin_link_to_existing" : "admin_create_entity",
        },
      };

      const updated = await tx.referralAssignment.updateMany({
        where: { referralActorId: actor.id, parentEntityId: null },
        data: { parentEntityType: "ENTITY", parentEntityId: entity.id },
      });
      await tx.referralActor.update({
        where: { id: actor.id },
        data: { metadataJson: audit },
      });

      await logReferralOrgAction(
        {
          actorId: session.userId,
          action: existing ? "LINK_TO_ENTITY" : "CREATE_ENTITY",
          referralActorId: actor.id,
          rawOrganizationName: actor.organizationName,
          entityId: entity.id,
          after: {
            entityDisplayName: entity.displayName,
            organizationKind: body.organizationKind ?? null,
            assignmentsLinked: updated.count,
            reusedExisting: !!existing,
          },
        },
        tx,
      );

      return {
        entityId: entity.id,
        reusedExisting: !!existing,
        assignmentsLinked: updated.count,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: e?.status ?? 500 },
    );
  }
}
