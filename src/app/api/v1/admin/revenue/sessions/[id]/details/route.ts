import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { listAuditForTableSession } from "@/server/revenue/revenueAudit";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const params = await ctx.params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:revenue:read");

    const session = await prisma.tableSession.findUnique({
      where: { id: params.id },
      include: {
        venue: { select: { id: true, name: true } },
        reservation: {
          include: {
            attributions: { include: { referrer: true } },
            assignedHost: { include: { user: { select: { name: true, email: true } } } },
          },
        },
        attributionSession: {
          select: { id: true, kind: true, bookingCode: true, openedAt: true, closedAt: true },
        },
        allocations: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!session) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const reservationId = session.reservationId;
    const commissionEntries = reservationId
      ? await prisma.commissionEntry.findMany({
          where: { reservationId },
          include: { referrer: { select: { fullName: true, referrerType: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [];

    // Resolve earner names for allocations.
    const earnerIds = Array.from(new Set(session.allocations.map((a) => a.earnerRefId)));
    const [referrers, hosts] = await Promise.all([
      earnerIds.length
        ? prisma.referrer.findMany({ where: { id: { in: earnerIds } }, select: { id: true, fullName: true } })
        : Promise.resolve([]),
      earnerIds.length
        ? prisma.restaurantHostProfile.findMany({
            where: { id: { in: earnerIds } },
            select: { id: true, user: { select: { name: true, email: true } } },
          })
        : Promise.resolve([]),
    ]);
    const nameById = new Map<string, string>();
    referrers.forEach((r) => nameById.set(r.id, r.fullName));
    hosts.forEach((h) => nameById.set(h.id, h.user?.name ?? h.user?.email ?? `Host ${h.id.slice(-6)}`));

    const auditTrail = await listAuditForTableSession(session.id);

    return NextResponse.json({
      ok: true,
      data: {
        session,
        commissionEntries,
        earnerNames: Object.fromEntries(nameById),
        auditTrail,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ ok: false, error: err.message ?? "Error" }, { status: err.status ?? 500 });
  }
}
