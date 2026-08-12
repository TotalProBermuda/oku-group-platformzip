import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { logReferralOrgAction } from "@/server/referrals/organizationAudit";

/**
 * Flag the actor as self-managed / sole proprietor. Excludes the actor
 * from the unresolved-organizations review queue and surfaces them under
 * the "Self-managed" filter instead.
 *
 * Owner-only because this removes the actor from referral-organization review.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ actorId: string }> },
) {
  try {
    const session = await requireAdminRoles(req, ["SUPERADMIN"]);

    const { actorId } = await params;
    const actor = await prisma.referralActor.findUnique({
      where: { id: actorId },
      select: { id: true, displayName: true, organizationName: true, metadataJson: true },
    });
    if (!actor) {
      return NextResponse.json({ ok: false, error: "Actor not found" }, { status: 404 });
    }

    const meta = (actor.metadataJson as Record<string, unknown> | null) ?? {};
    const flag = {
      flaggedAt: new Date().toISOString(),
      flaggedBy: `user:${session.userId}`,
      reason: "admin_marked_self_managed",
    };

    // Atomic: actor flag and audit row commit/roll-back together.
    await prisma.$transaction(async (tx) => {
      await tx.referralActor.update({
        where: { id: actor.id },
        data: { metadataJson: { ...meta, _isSoleProprietor: flag } },
      });
      await logReferralOrgAction(
        {
          actorId: session.userId,
          action: "MARK_SOLE_PROPRIETOR",
          referralActorId: actor.id,
          rawOrganizationName: actor.organizationName,
          after: flag,
        },
        tx,
      );
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: e?.status ?? 500 },
    );
  }
}
