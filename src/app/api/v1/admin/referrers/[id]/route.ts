import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");
    const { id } = await params;

    // Nested `commissions` include intentionally REMOVED — see
    // src/server/commissions/earnerScope.ts. Re-attached via the OR-clause
    // helper so commissions written with only `referralActorId` are still
    // counted on this admin detail surface.
    const referrerBase = await prisma.referrer.findUnique({
      where: { id },
      include: {
        compensationPlan: true,
        attributions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, conversionStage: true, coversAttributed: true, createdAt: true },
        },
        user: { select: { id: true, name: true, email: true, status: true } },
      },
    });

    if (!referrerBase) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const earnerScope = (await resolveEarnerScopeForReferrer(referrerBase.id))!;
    const commissions = await prisma.commissionEntry.findMany({
      where: commissionWhereForEarner(earnerScope),
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { reservation: { select: { partySize: true, conceptRequested: true } } },
    });

    return NextResponse.json({ ok: true, data: { ...referrerBase, commissions } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
