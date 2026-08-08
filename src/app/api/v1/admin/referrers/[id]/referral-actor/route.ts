import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

/**
 * Resolve a ReferralActor by legacy `Referrer.id`. This lets surfaces that
 * key on the legacy Referrer row (e.g. the Compensation drawer) load actor
 * data even when the referrer has no linked user.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");
    const { id } = await ctx.params;

    const actor = await prisma.referralActor.findFirst({
      where: { legacyReferrerId: id },
      include: {
        assignments: { where: { isActive: true } },
        links: { where: { isActive: true } },
        legacyReferrer: { select: { id: true, referralCode: true, fullName: true } },
      },
    });

    return NextResponse.json({ ok: true, actor });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Failed" }, { status: err.status ?? 500 });
  }
}
