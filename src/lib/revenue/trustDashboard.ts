import { prisma } from "@/lib/prisma";

export type DateRangeInput = {
  from?: Date | string;
  to?: Date | string;
  preset?: "today" | "7d" | "30d" | "custom";
};

export function resolveTrustDateRange(range?: DateRangeInput) {
  const now = new Date();
  if (!range || range.preset === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (range.preset === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from, to: now };
  }
  if (range.preset === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from, to: now };
  }
  return {
    from: range.from ? new Date(range.from) : new Date(0),
    to: range.to ? new Date(range.to) : now,
  };
}

export async function getTrustSummary(opts: {
  range?: DateRangeInput;
  venueId?: string;
}) {
  const { from, to } = resolveTrustDateRange(opts.range);

  const dateFilter = { closedAt: { gte: from, lte: to } };
  const venueFilter = opts.venueId ? { venueId: opts.venueId } : {};

  const [
    tableSessionCount,
    invuVerifiedCount,
    manualCount,
    grossRevAgg,
    netCommAgg,
    pendingAllocAgg,
    approvedAllocAgg,
    paidAllocAgg,
    exceptionSessionCount,
    disputedAllocCount,
    lastSyncRun,
    allSessions,
  ] = await Promise.all([
    prisma.tableSession.count({ where: { ...dateFilter, ...venueFilter } }),

    prisma.tableSession.count({
      where: { ...dateFilter, ...venueFilter, matchMethod: { not: "UNMATCHED" } },
    }),

    prisma.tableSession.count({
      where: { ...dateFilter, ...venueFilter, matchMethod: "UNMATCHED" },
    }),

    prisma.tableSession.aggregate({
      _sum: { grossCents: true },
      where: { ...dateFilter, ...venueFilter },
    }),

    prisma.tableSession.aggregate({
      _sum: { commissionableCents: true },
      where: { ...dateFilter, ...venueFilter },
    }),

    prisma.commissionAllocation.aggregate({
      _sum: { amountCents: true },
      where: {
        status: "PENDING",
        tableSession: { ...dateFilter, ...venueFilter },
      },
    }),

    prisma.commissionAllocation.aggregate({
      _sum: { amountCents: true },
      where: {
        status: "APPROVED",
        tableSession: { ...dateFilter, ...venueFilter },
      },
    }),

    prisma.commissionAllocation.aggregate({
      _sum: { amountCents: true },
      where: {
        status: "PAID",
        tableSession: { ...dateFilter, ...venueFilter },
      },
    }),

    prisma.tableSession.count({
      where: { ...dateFilter, ...venueFilter, status: "PENDING_REVIEW" },
    }),

    prisma.commissionAllocation.count({
      where: {
        status: "DISPUTED",
        tableSession: { ...dateFilter, ...venueFilter },
      },
    }),

    prisma.integrationSyncRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true, startedAt: true, finishedAt: true, matchedCount: true, unmatchedCount: true, errorCount: true },
    }),

    prisma.tableSession.findMany({
      where: { ...dateFilter, ...venueFilter },
      select: { reservationId: true },
    }),
  ]);

  const attributedCount = allSessions.filter((s) => s.reservationId).length;

  return {
    tableSessionCount,
    invuVerifiedCount,
    manualCount,
    grossRevenueCents: grossRevAgg._sum.grossCents ?? 0,
    netCommissionableCents: netCommAgg._sum.commissionableCents ?? 0,
    pendingObligationsCents: pendingAllocAgg._sum.amountCents ?? 0,
    approvedUnpaidCents: approvedAllocAgg._sum.amountCents ?? 0,
    paidCents: paidAllocAgg._sum.amountCents ?? 0,
    exceptionCount: exceptionSessionCount + disputedAllocCount,
    lastSyncRun,
    attributedReservationsCount: attributedCount,
  };
}

export async function getSessionsLedger(opts: {
  range?: DateRangeInput;
  venueId?: string;
  status?: string;
  matchMethod?: string;
  trustScoreMax?: number;
  page?: number;
  limit?: number;
}) {
  const { from, to } = resolveTrustDateRange(opts.range);
  const page = opts.page ?? 1;
  const take = opts.limit ?? 50;
  const skip = (page - 1) * take;

  const where: Record<string, unknown> = {
    closedAt: { gte: from, lte: to },
  };
  if (opts.venueId) where.venueId = opts.venueId;
  if (opts.status) where.status = opts.status;
  if (opts.matchMethod) where.matchMethod = opts.matchMethod;
  if (opts.trustScoreMax !== undefined) where.trustScore = { lte: opts.trustScoreMax };

  const [sessions, total] = await Promise.all([
    prisma.tableSession.findMany({
      where,
      skip,
      take,
      orderBy: { closedAt: "desc" },
      include: {
        venue: { select: { id: true, name: true } },
        reservation: {
          select: {
            id: true,
            confirmationCode: true,
            contactName: true,
            partySize: true,
            reservationDate: true,
            assignedRestaurantHostId: true,
            assignedHost: { select: { id: true, displayName: true } },
            attributions: {
              take: 1,
              include: { referrer: { select: { id: true, fullName: true, referrerType: true } } },
            },
          },
        },
        allocations: {
          select: { id: true, earnerType: true, earnerRefId: true, amountCents: true, status: true },
        },
      },
    }),
    prisma.tableSession.count({ where }),
  ]);

  return { sessions, total, page, limit: take };
}

export async function getSessionDetail(id: string) {
  const session = await prisma.tableSession.findUnique({
    where: { id },
    include: {
      venue: { select: { id: true, name: true } },
      reservation: {
        include: {
          assignedHost: { select: { id: true, displayName: true } },
          attributions: {
            include: { referrer: { select: { id: true, fullName: true, referrerType: true, organizationName: true } } },
          },
          commissions: {
            include: { referrer: { select: { id: true, fullName: true } } },
          },
        },
      },
      allocations: true,
    },
  });

  if (!session) return null;

  const auditLogs = await prisma.auditLog.findMany({
    where: { metadata: { path: ["tableSessionId"], equals: id } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return { session, auditLogs };
}

export async function getObligations(opts: {
  range?: DateRangeInput;
  venueId?: string;
}) {
  const { from, to } = resolveTrustDateRange(opts.range);

  const sessionWhere: Record<string, unknown> = { closedAt: { gte: from, lte: to } };
  if (opts.venueId) sessionWhere.venueId = opts.venueId;

  const allocations = await prisma.commissionAllocation.findMany({
    where: { tableSession: sessionWhere },
    include: {
      tableSession: {
        select: {
          id: true,
          grossCents: true,
          commissionableCents: true,
          venueId: true,
          closedAt: true,
          reservation: { select: { id: true, confirmationCode: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return allocations;
}

export async function getReviewItems(opts: {
  range?: DateRangeInput;
  venueId?: string;
}) {
  const { from, to } = resolveTrustDateRange(opts.range);
  const sessionWhere: Record<string, unknown> = { closedAt: { gte: from, lte: to } };
  if (opts.venueId) sessionWhere.venueId = opts.venueId;

  const [pendingReviewSessions, disputedAllocations, reversedPaidAllocations, fullCompSessions] = await Promise.all([
    prisma.tableSession.findMany({
      where: { ...sessionWhere, status: "PENDING_REVIEW" },
      include: {
        venue: { select: { id: true, name: true } },
        reservation: { select: { id: true, confirmationCode: true, partySize: true } },
        allocations: { select: { id: true, amountCents: true, status: true } },
      },
      orderBy: { trustScore: "asc" },
    }),
    prisma.commissionAllocation.findMany({
      where: { status: "DISPUTED", tableSession: sessionWhere },
      include: {
        tableSession: {
          include: {
            venue: { select: { id: true, name: true } },
            reservation: { select: { id: true, confirmationCode: true } },
          },
        },
      },
    }),
    prisma.commissionAllocation.findMany({
      where: { status: "REVERSED", tableSession: sessionWhere },
      include: {
        tableSession: {
          include: {
            venue: { select: { id: true, name: true } },
            reservation: { select: { id: true, confirmationCode: true } },
            allocations: { where: { status: "PAID" }, select: { id: true } },
          },
        },
      },
    }),
    prisma.tableSession.findMany({
      where: {
        ...sessionWhere,
        commissionableCents: 0,
        grossCents: { gt: 0 },
      },
      include: {
        venue: { select: { id: true, name: true } },
        reservation: { select: { id: true, confirmationCode: true } },
      },
      orderBy: { trustScore: "asc" },
    }),
  ]);

  return {
    pendingReviewSessions,
    disputedAllocations,
    reversedPaidAllocations: reversedPaidAllocations.filter(
      (a) => a.tableSession.allocations.length > 0
    ),
    fullCompSessions,
  };
}

export async function getEventAttribution(opts: {
  range?: DateRangeInput;
  venueId?: string;
}) {
  const { from, to } = resolveTrustDateRange(opts.range);
  const sessionWhere: Record<string, unknown> = { closedAt: { gte: from, lte: to } };
  if (opts.venueId) sessionWhere.venueId = opts.venueId;

  const sessions = await prisma.tableSession.findMany({
    where: sessionWhere,
    include: {
      venue: { select: { id: true, name: true } },
      reservation: {
        select: {
          id: true,
          confirmationCode: true,
          partySize: true,
        },
      },
      allocations: {
        select: { id: true, earnerType: true, amountCents: true, status: true },
      },
    },
    orderBy: { closedAt: "desc" },
  });

  return sessions;
}
