import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

/**
 * Returns the ReferralActor (and active assignments) for a user. Fall-through
 * order: direct `userId` link → legacy `Referrer.userId` → null. Used by the
 * persona surface to prefer ReferralActor over the legacy Referrer model.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");
    const { id } = await ctx.params;

    let actor = await prisma.referralActor.findFirst({
      where: { userId: id },
      include: {
        assignments: { where: { isActive: true } },
        links: { where: { isActive: true } },
        legacyReferrer: { select: { id: true, referralCode: true } },
      },
    });

    if (!actor) {
      const legacy = await prisma.referrer.findFirst({ where: { userId: id }, select: { id: true } });
      if (legacy) {
        actor = await prisma.referralActor.findFirst({
          where: { legacyReferrerId: legacy.id },
          include: {
            assignments: { where: { isActive: true } },
            links: { where: { isActive: true } },
            legacyReferrer: { select: { id: true, referralCode: true } },
          },
        });
      }
    }

    return NextResponse.json({ ok: true, actor });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
