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

    const sessionWhere = {
      ...(venueId ? { venueId } : {}),
      ...(dateFrom || dateTo
        ? { closedAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
        : {}),
    };

    const [sumAgg, countTotal, countMatched, countPendingReview, countDisputedSessions, countDisputedAlloc, allocAgg, lastSync] =
      await Promise.all([
        prisma.tableSession.aggregate({
          where: sessionWhere,
          _sum: { grossCents: true, commissionableCents: true },
        }),
        prisma.tableSession.count({ where: sessionWhere }),
        prisma.tableSession.count({ where: { ...sessionWhere, status: "MATCHED" } }),
        prisma.tableSession.count({ where: { ...sessionWhere, status: "PENDING_REVIEW" } }),
        prisma.tableSession.count({ where: { ...sessionWhere, status: "DISPUTED" } }),
        prisma.commissionAllocation.count({ where: { tableSession: sessionWhere, status: "DISPUTED" } }),
        prisma.commissionAllocation.groupBy({
          by: ["status"],
          where: { tableSession: sessionWhere },
          _sum: { amountCents: true },
        }),
        prisma.integrationSyncRun.findFirst({
          orderBy: { startedAt: "desc" },
          select: { id: true, status: true, startedAt: true, finishedAt: true, errorCount: true, matchedCount: true, unmatchedCount: true },
        }),
      ]);

    const allocByStatus = Object.fromEntries(
      allocAgg.map((r) => [r.status, r._sum.amountCents ?? 0]),
    ) as Record<string, number>;

    return NextResponse.json({
      ok: true,
      data: {
        sessionCount: countTotal,
        matchedCount: countMatched,
        pendingReviewCount: countPendingReview,
        disputedSessionCount: countDisputedSessions,
        disputedAllocationCount: countDisputedAlloc,
        exceptionCount: countPendingReview + countDisputedAlloc,
        grossCents: sumAgg._sum.grossCents ?? 0,
        commissionableCents: sumAgg._sum.commissionableCents ?? 0,
        pendingObligationCents: allocByStatus.PENDING ?? 0,
        approvedUnpaidCents: allocByStatus.APPROVED ?? 0,
        paidCents: allocByStatus.PAID ?? 0,
        disputedCents: allocByStatus.DISPUTED ?? 0,
        reversedCents: allocByStatus.REVERSED ?? 0,
        lastSync,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ ok: false, error: err.message ?? "Error" }, { status: err.status ?? 500 });
  }
}
