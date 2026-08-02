import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { logReferralOrgAction } from "@/server/referrals/organizationAudit";

/**
 * Link an unresolved referral actor to an existing approved Entity.
 *
 * Permission: `admin:compensation:write` — `admin:entities:write` does not
 * exist in the permission map; the closest fit is the compensation-admin
 * permission since this work is referral compensation infrastructure.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ actorId: string }> },
) {
  try {
    const session = await requireSession();
    requirePermission(session.roles, "admin:compensation:write");

    const { actorId } = await params;
    const body = (await req.json().catch(() => ({}))) as { entityId?: string };
    if (!body.entityId) {
      return NextResponse.json({ ok: false, error: "entityId is required" }, { status: 400 });
    }

    const [actor, entity] = await Promise.all([
      prisma.referralActor.findUnique({
        where: { id: actorId },
        select: { id: true, displayName: true, organizationName: true, metadataJson: true },
      }),
      prisma.entity.findUnique({
        where: { id: body.entityId },
        select: { id: true, displayName: true },
      }),
    ]);

    if (!actor) {
      return NextResponse.json({ ok: false, error: "Actor not found" }, { status: 404 });
    }
    if (!entity) {
      return NextResponse.json({ ok: false, error: "Entity not found" }, { status: 404 });
    }

    const meta = (actor.metadataJson as Record<string, unknown> | null) ?? {};
    const audit = {
      ...meta,
      _resolvedOrganization: {
        rawText: actor.organizationName,
        resolvedToEntityId: entity.id,
        resolvedToDisplayName: entity.displayName,
        resolvedAt: new Date().toISOString(),
        resolvedBy: `user:${session.userId}`,
        method: "admin_link",
      },
    };

    // Atomic: state mutation AND audit log commit/roll-back together.
    const result = await prisma.$transaction(async (tx) => {
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
          action: "LINK_TO_ENTITY",
          referralActorId: actor.id,
          rawOrganizationName: actor.organizationName,
          entityId: entity.id,
          after: { entityDisplayName: entity.displayName, assignmentsLinked: updated.count },
        },
        tx,
      );
      return updated.count;
    });

    return NextResponse.json({
      ok: true,
      assignmentsLinked: result,
      entityId: entity.id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: e?.status ?? 500 },
    );
  }
}
