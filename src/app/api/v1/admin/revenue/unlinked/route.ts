import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:revenue:read");

    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const baseWhere = {
      ...(venueId ? { venueId } : {}),
      ...(dateFrom || dateTo
        ? { closedAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
        : {}),
    };

    // "Unmatched Sessions": TableSession with no Reservation linked.
    // "Unlinked Revenue": TableSession with a Reservation but treat as unlinked
    //   (reservation has no business "event" link). Schema doesn't currently model
    //   reservation→event linkage; we expose the count via attribution session
    //   bookingCode presence as a proxy.
    const [unmatchedSessions, unmatchedAgg, unlinkedSessions, unlinkedAgg] = await Promise.all([
      prisma.tableSession.findMany({
        where: { ...baseWhere, reservationId: null },
        take: 100,
        orderBy: { closedAt: "desc" },
        select: {
          id: true,
          venue: { select: { name: true } },
          tableLabel: true,
          closedAt: true,
          grossCents: true,
          commissionableCents: true,
          trustScore: true,
          matchMethod: true,
        },
      }),
      prisma.tableSession.aggregate({
        where: { ...baseWhere, reservationId: null },
        _count: true,
        _sum: { grossCents: true, commissionableCents: true },
      }),
      prisma.tableSession.findMany({
        where: { ...baseWhere, reservationId: { not: null }, attributionSessionId: null },
        take: 100,
        orderBy: { closedAt: "desc" },
        select: {
          id: true,
          venue: { select: { name: true } },
          tableLabel: true,
          closedAt: true,
          grossCents: true,
          commissionableCents: true,
          reservation: { select: { confirmationCode: true, contactName: true } },
        },
      }),
      prisma.tableSession.aggregate({
        where: { ...baseWhere, reservationId: { not: null }, attributionSessionId: null },
        _count: true,
        _sum: { grossCents: true, commissionableCents: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        unmatched: {
          count: unmatchedAgg._count,
          grossCents: unmatchedAgg._sum.grossCents ?? 0,
          commissionableCents: unmatchedAgg._sum.commissionableCents ?? 0,
          rows: unmatchedSessions,
        },
        unlinked: {
          count: unlinkedAgg._count,
          grossCents: unlinkedAgg._sum.grossCents ?? 0,
          commissionableCents: unlinkedAgg._sum.commissionableCents ?? 0,
          rows: unlinkedSessions,
        },
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ ok: false, error: err.message ?? "Error" }, { status: err.status ?? 500 });
  }
}
