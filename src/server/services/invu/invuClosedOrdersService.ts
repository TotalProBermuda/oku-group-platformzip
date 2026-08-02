import { prisma } from "@/lib/prisma";
import { MatchMethod, TableSessionStatus, ReviewQueueStatus } from "@prisma/client";
import { runInvuSyncForVenue } from "./invuSyncService";

/**
 * INVU Closed Orders — admin demo panel service.
 *
 * Wraps the production sync pipeline with venue-scoped helpers used by the
 * `/admin/integrations/invu/closed-orders` page. Three responsibilities:
 *  1. Trigger an on-demand pull (creates a branch mapping on the fly if missing
 *     so demos work even before the operator finishes the full mapping setup).
 *  2. Read the last N days of TableSessions joined with reservation, host, and
 *     referrer attribution for the 3-column matched/unmatched view.
 *  3. Allow an operator to manually link an unmatched closed order to a
 *     reservation (sets matchMethod=MANUAL, status=MATCHED, closes related
 *     review-queue items).
 */

export type ClosedOrderRow = {
  tableSessionId: string;
  invuOrderId: string | null;
  publicOrderNumber: string | null;
  tableLabel: string | null;
  closedAt: string | null;
  openedAt: string | null;
  partySize: number | null;
  customerName: string | null;
  grossCents: number;
  taxCents: number;
  tipCents: number;
  discountCents: number;
  refundCents: number;
  subtotalCents: number;
  commissionableCents: number;
  matchMethod: MatchMethod;
  status: TableSessionStatus;
  trustScore: number | null;
  reservation: {
    id: string;
    contactName: string;
    partySize: number;
    reservationDate: string;
    confirmationCode: string;
    assignedTableLabel: string | null;
    sourceLabel: string;
  } | null;
  attribution: {
    sourceType: string;
    sourceLabel: string | null;
    earnerName: string;
    earnerType: "REFERRER" | "RESTAURANT_HOST";
    earnerSubtype: string | null;
  } | null;
};

export type ClosedOrdersOverview = {
  venueId: string;
  windowStart: string;
  windowEnd: string;
  totals: {
    total: number;
    matchedAuto: number;
    matchedManual: number;
    unmatched: number;
    grossCents: number;
    /** Mirrors INVU "NET SUBTOTAL" exactly: gross − tax (does NOT subtract discounts/refunds). */
    netSubtotalCents: number;
    taxCents: number;
    tipCents: number;
    discountCents: number;
    refundCents: number;
    /** Internal commission base: gross − tax − discounts − refunds. NOT the same as INVU NET SUBTOTAL. */
    commissionableCents: number;
  };
  rows: ClosedOrderRow[];
  lastSyncRun: {
    id: string;
    status: string;
    finishedAt: string | null;
    ordersPulledCount: number;
    matchedCount: number;
    unmatchedCount: number;
  } | null;
};

/**
 * Ensure a branch mapping exists for the venue's connected credential.
 * INVU's closed-orders endpoint is keyed off the credential rather than the
 * branch ID, so a placeholder mapping is enough to drive the sync pipeline.
 */
export async function ensureBranchMapping(venueId: string): Promise<{
  mappingId: string;
  credentialId: string;
}> {
  const credential = await prisma.invuIntegrationCredential.findFirst({
    where: { venueId, status: "CONNECTED" },
    select: { id: true },
  });
  if (!credential) {
    throw new Error(`No CONNECTED INVU credential for venue ${venueId}`);
  }

  let mapping = await prisma.integrationBranchMapping.findFirst({
    where: { venueId, credentialId: credential.id },
    select: { id: true },
  });

  if (!mapping) {
    mapping = await prisma.integrationBranchMapping.create({
      data: {
        venueId,
        credentialId: credential.id,
        invuBranchId: "default",
        invuBranchLabel: "Default branch (auto-created)",
        isSyncEnabled: true,
      },
      select: { id: true },
    });
  }

  return { mappingId: mapping.id, credentialId: credential.id };
}

/**
 * Synchronously trigger a sync run for the venue and wait for it to complete.
 * Used by the admin "Pull last 7 days" button — bypasses the BullMQ queue so
 * the UI can show fresh results immediately.
 */
export async function pullLast7DaysClosedOrders(params: {
  venueId: string;
  triggeredByUserId?: string;
  /**
   * Optional tighter window (in minutes) for live testing. When set, the
   * pull ignores the saved checkpoint and only asks INVU for the last N
   * minutes — keeps test iterations cheap. The successful run still
   * advances the checkpoint to `now`, so the next automatic 15-minute
   * tick continues from there.
   */
  windowMinutes?: number;
}): Promise<{ syncRunId: string }> {
  const { venueId, triggeredByUserId, windowMinutes } = params;
  const { mappingId, credentialId } = await ensureBranchMapping(venueId);

  const syncRun = await prisma.integrationSyncRun.create({
    data: {
      credentialId,
      venueId,
      branchMappingId: mappingId,
      scopeType: "CLOSED_ORDERS",
      triggeredByUserId: triggeredByUserId ?? null,
      status: "STARTED",
    },
    select: { id: true },
  });

  await runInvuSyncForVenue(venueId, mappingId, syncRun.id, windowMinutes);

  return { syncRunId: syncRun.id };
}

export async function getClosedOrdersOverview(params: {
  venueId: string;
  days?: number;
}): Promise<ClosedOrdersOverview> {
  const days = params.days ?? 7;
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - days * 24 * 60 * 60 * 1000);

  const sessions = await prisma.tableSession.findMany({
    where: {
      venueId: params.venueId,
      OR: [
        { closedAt: { gte: windowStart, lte: windowEnd } },
        { openedAt: { gte: windowStart, lte: windowEnd } },
      ],
    },
    orderBy: { closedAt: "desc" },
    include: {
      reservation: {
        include: {
          attributions: {
            include: { referrer: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
          assignedHost: { include: { user: { select: { name: true } } } },
        },
      },
    },
  });

  const rows: ClosedOrderRow[] = sessions.map((s) => {
    const r = s.reservation;
    let attribution: ClosedOrderRow["attribution"] = null;
    if (r) {
      const attr = r.attributions[0];
      if (attr?.referrer) {
        attribution = {
          sourceType: attr.sourceType,
          sourceLabel: attr.sourceLabel,
          earnerName: attr.referrer.fullName,
          earnerType: "REFERRER",
          earnerSubtype: attr.referrer.referrerType,
        };
      } else if (r.assignedHost) {
        attribution = {
          sourceType: r.source,
          sourceLabel: "Restaurant host",
          earnerName: r.assignedHost.displayName ?? r.assignedHost.user?.name ?? "Host",
          earnerType: "RESTAURANT_HOST",
          earnerSubtype: null,
        };
      } else if (attr) {
        attribution = {
          sourceType: attr.sourceType,
          sourceLabel: attr.sourceLabel,
          earnerName: "—",
          earnerType: "REFERRER",
          earnerSubtype: null,
        };
      }
    }

    const customerName = (() => {
      const j = s.invuOrderJson as Record<string, unknown> | null;
      if (j && typeof j === "object") {
        const v = j.customerName;
        if (typeof v === "string" && v.length > 0) return v;
      }
      return null;
    })();

    const partySize = (() => {
      const j = s.invuOrderJson as Record<string, unknown> | null;
      if (j && typeof j === "object") {
        const v = j.guestCount;
        if (typeof v === "number") return v;
      }
      return null;
    })();

    return {
      tableSessionId: s.id,
      invuOrderId: s.invuOrderId,
      publicOrderNumber: (() => {
        const j = s.invuOrderJson as Record<string, unknown> | null;
        const v = j?.publicOrderNumber;
        return typeof v === "string" ? v : null;
      })(),
      tableLabel: s.tableLabel,
      closedAt: s.closedAt?.toISOString() ?? null,
      openedAt: s.openedAt?.toISOString() ?? null,
      partySize,
      customerName,
      grossCents: s.grossCents,
      taxCents: s.taxCents,
      tipCents: s.tipCents,
      discountCents: s.discountCents,
      refundCents: s.refundCents,
      subtotalCents: Math.max(0, s.grossCents - s.taxCents),
      commissionableCents: s.commissionableCents,
      matchMethod: s.matchMethod,
      status: s.status,
      trustScore: s.trustScore,
      reservation: r
        ? {
            id: r.id,
            contactName: r.contactName,
            partySize: r.partySize,
            reservationDate: r.reservationDate.toISOString(),
            confirmationCode: r.confirmationCode,
            assignedTableLabel: r.assignedTableLabel,
            sourceLabel: r.source,
          }
        : null,
      attribution,
    };
  });

  const totals = {
    total: rows.length,
    matchedAuto: rows.filter((r) => r.matchMethod === MatchMethod.AUTO).length,
    matchedManual: rows.filter((r) => r.matchMethod === MatchMethod.MANUAL).length,
    unmatched: rows.filter((r) => r.matchMethod === MatchMethod.UNMATCHED).length,
    grossCents: rows.reduce((s, r) => s + r.grossCents, 0),
    netSubtotalCents: rows.reduce((s, r) => s + r.subtotalCents, 0),
    taxCents: rows.reduce((s, r) => s + r.taxCents, 0),
    tipCents: rows.reduce((s, r) => s + r.tipCents, 0),
    discountCents: rows.reduce((s, r) => s + r.discountCents, 0),
    refundCents: rows.reduce((s, r) => s + r.refundCents, 0),
    commissionableCents: rows.reduce((s, r) => s + r.commissionableCents, 0),
  };

  const lastSyncRun = await prisma.integrationSyncRun.findFirst({
    where: { venueId: params.venueId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      finishedAt: true,
      ordersPulledCount: true,
      matchedCount: true,
      unmatchedCount: true,
    },
  });

  return {
    venueId: params.venueId,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totals,
    rows,
    lastSyncRun: lastSyncRun
      ? {
          id: lastSyncRun.id,
          status: lastSyncRun.status,
          finishedAt: lastSyncRun.finishedAt?.toISOString() ?? null,
          ordersPulledCount: lastSyncRun.ordersPulledCount,
          matchedCount: lastSyncRun.matchedCount,
          unmatchedCount: lastSyncRun.unmatchedCount,
        }
      : null,
  };
}

/**
 * Manually link an unmatched TableSession to a Reservation.
 * Updates matchMethod=MANUAL, status=MATCHED, and resolves any open
 * NO_MATCH / LOW_CONFIDENCE_MATCH review-queue items for that session.
 */
export async function manualMatchTableSession(params: {
  tableSessionId: string;
  reservationId: string;
  resolvedByUserId?: string;
}): Promise<{ ok: true }> {
  const { tableSessionId, reservationId, resolvedByUserId } = params;

  const session = await prisma.tableSession.findUnique({
    where: { id: tableSessionId },
    select: { id: true, venueId: true },
  });
  if (!session) throw new Error(`TableSession ${tableSessionId} not found`);

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, venueId: true },
  });
  if (!reservation) throw new Error(`Reservation ${reservationId} not found`);
  if (reservation.venueId !== session.venueId) {
    throw new Error("Reservation and TableSession belong to different venues");
  }

  await prisma.tableSession.update({
    where: { id: tableSessionId },
    data: {
      reservationId,
      matchMethod: MatchMethod.MANUAL,
      status: TableSessionStatus.MATCHED,
      // Manual matches are operator-asserted, so we treat them as fully trusted.
      trustScore: 1.0,
    },
  });

  await prisma.integrationReviewQueue.updateMany({
    where: {
      tableSessionId,
      status: { in: [ReviewQueueStatus.OPEN, ReviewQueueStatus.IN_REVIEW] },
      issueType: { in: ["NO_MATCH", "LOW_CONFIDENCE_MATCH", "MULTIPLE_MATCHES"] },
    },
    data: {
      status: ReviewQueueStatus.RESOLVED,
      resolvedAt: new Date(),
      assignedToUserId: resolvedByUserId ?? undefined,
    },
  });

  return { ok: true };
}

/**
 * Candidate reservations for the manual-match picker.
 * Returns reservations within ±4h of the session's close time, ordered by
 * proximity, capped at 25 rows. Designed to power a typeahead.
 */
export async function listCandidateReservations(params: {
  tableSessionId: string;
}): Promise<
  Array<{
    id: string;
    contactName: string;
    partySize: number;
    reservationDate: string;
    confirmationCode: string;
    assignedTableLabel: string | null;
    alreadyLinkedToOtherSession: boolean;
  }>
> {
  const session = await prisma.tableSession.findUnique({
    where: { id: params.tableSessionId },
    select: { id: true, venueId: true, closedAt: true, openedAt: true },
  });
  if (!session) throw new Error(`TableSession ${params.tableSessionId} not found`);

  const anchor = session.closedAt ?? session.openedAt ?? new Date();
  const lo = new Date(anchor.getTime() - 4 * 60 * 60 * 1000);
  const hi = new Date(anchor.getTime() + 4 * 60 * 60 * 1000);

  const reservations = await prisma.reservation.findMany({
    where: {
      venueId: session.venueId,
      reservationDate: { gte: lo, lte: hi },
    },
    select: {
      id: true,
      contactName: true,
      partySize: true,
      reservationDate: true,
      confirmationCode: true,
      assignedTableLabel: true,
    },
  });

  // Flag reservations that already have a different MATCHED session to warn the operator.
  // Only sessions with matchMethod != UNMATCHED count as real links; a stale reservationId
  // on an otherwise-unmatched session should not block manual matching.
  const linkedIds = new Set(
    (
      await prisma.tableSession.findMany({
        where: {
          venueId: session.venueId,
          reservationId: { in: reservations.map((r) => r.id) },
          matchMethod: { not: "UNMATCHED" },
          NOT: { id: session.id },
        },
        select: { reservationId: true },
      })
    ).map((s) => s.reservationId!).filter(Boolean)
  );

  return reservations
    .map((r) => ({
      id: r.id,
      contactName: r.contactName,
      partySize: r.partySize,
      reservationDate: r.reservationDate.toISOString(),
      confirmationCode: r.confirmationCode,
      assignedTableLabel: r.assignedTableLabel,
      alreadyLinkedToOtherSession: linkedIds.has(r.id),
      _delta: Math.abs(r.reservationDate.getTime() - anchor.getTime()),
    }))
    .sort((a, b) => a._delta - b._delta)
    .slice(0, 25)
    .map(({ _delta, ...rest }) => rest);
}
