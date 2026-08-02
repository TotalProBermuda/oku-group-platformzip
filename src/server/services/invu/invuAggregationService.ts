import { prisma } from "@/lib/prisma";
import {
  Prisma,
  InvuOrderNormalized,
  InvuPayloadType,
  MatchMethod,
  TableSessionStatus,
  InvuOrderStatusCanonical,
  ReviewIssueType,
  ReviewQueueStatus,
} from "@prisma/client";
import {
  matchNormalizedToReservation,
  MatchSignals,
  resolveMatch,
  persistMatchResult,
  type HeuristicCandidate,
} from "./invuMatchService";
import { needsReviewQueue } from "./invuTrustScoreService";
import { mintCommissionsForTableSession } from "./commissionMintingService";

type ReservationCandidate = {
  id: string;
  reservationDate: Date;
  partySize: number;
  contactName: string;
  assignedTableLabel: string | null;
};

// One real dining occasion = one TableSession.
// Split checks / multiple payments MUST NOT create duplicate records.
//
// Aggregation strategy:
// 1. If invuOrderId is present: collect ALL normalized records with that ID and this venueId,
//    sum financial fields across all payload types (closed order + invoice total + payments + credits)
// 2. If invuOrderId is absent: fall back to grouping by table label + 30-min time window
// 3. Upsert a SINGLE TableSession per logical dining occasion

export async function aggregateToTableSession(params: {
  normalized: InvuOrderNormalized;
  venueId: string;
  syncRunId: string;
}): Promise<{ tableSessionId: string; isNew: boolean; reviewQueueCreated: boolean }> {
  const { normalized, venueId, syncRunId } = params;

  // --- Collect all normalized records that belong to this same real session ---
  let siblingRecords: InvuOrderNormalized[] = [normalized];

  if (normalized.invuOrderId) {
    const siblings = await prisma.invuOrderNormalized.findMany({
      where: { invuOrderId: normalized.invuOrderId, venueId },
    });
    // Include current record even if not yet persisted
    if (!siblings.find((r) => r.id === normalized.id)) {
      siblingRecords = [...siblings, normalized];
    } else {
      siblingRecords = siblings;
    }
  } else {
    // For records without invuOrderId, group by table label + time window.
    // Use openedAt ?? closedAt as the reference time, and query both fields
    // via OR so records with null openedAt but a matching closedAt are included.
    const sessionTime = normalized.openedAt ?? normalized.closedAt;
    if (sessionTime && normalized.tableLabel) {
      const windowStart = new Date(sessionTime.getTime() - 30 * 60 * 1000);
      const windowEnd = new Date(sessionTime.getTime() + 30 * 60 * 1000);
      const related = await prisma.invuOrderNormalized.findMany({
        where: {
          venueId,
          tableLabel: normalized.tableLabel,
          invuOrderId: null,
          OR: [
            { openedAt: { gte: windowStart, lte: windowEnd } },
            { closedAt: { gte: windowStart, lte: windowEnd } },
          ],
        },
      });
      siblingRecords = [...related.filter((r) => r.id !== normalized.id), normalized];
    }
  }

  // --- Payload-aware financial aggregation (avoids double-counting across artifact types) ---
  //
  // Each INVU order can arrive as multiple payload types for the SAME logical dining occasion:
  //   CLOSED_ORDER    — authoritative gross/discount/tax/tip from the POS close event
  //   ORDER_TOTAL     — fallback gross/discount/tax (used when no CLOSED_ORDER)
  //   INVOICE_TOTAL   — second fallback (e.g., fiscal invoice artifact)
  //   PAYMENT_SUMMARY — payment tender info; contributes tip amounts only
  //   CREDIT_NOTE     — post-close refunds; contributes refund amounts only
  //
  // Never cross-sum gross/discount/tax across different payload types — that causes double-counting.
  // Sum ALL records of the ONE authoritative payload type (e.g., all CLOSED_ORDER split-check fragments),
  // then add tips from PAYMENT_SUMMARY and refunds from CREDIT_NOTE.

  const REVENUE_PRIORITY = [
    InvuPayloadType.CLOSED_ORDER,
    InvuPayloadType.ORDER_TOTAL,
    InvuPayloadType.INVOICE_TOTAL,
  ] as const;

  // Determine the authoritative payload type — first type in priority order with at least one record.
  // Then SUM ALL records of that type (handles split checks / partial artifacts for the same session).
  // Never cross-sum across different payload types — that causes double-counting.
  let authoritativeType: InvuPayloadType | null = null;
  for (const pt of REVENUE_PRIORITY) {
    if (siblingRecords.some((r) => r.payloadType === pt)) {
      authoritativeType = pt;
      break;
    }
  }

  const authoritativeRecords =
    authoritativeType !== null
      ? siblingRecords.filter((r) => r.payloadType === authoritativeType)
      : [normalized];

  const revenueGross = authoritativeRecords.reduce((s, r) => s + r.grossCents, 0) || normalized.grossCents;
  const revenueDiscount = authoritativeRecords.reduce((s, r) => s + r.discountCents, 0);
  const revenueTax = authoritativeRecords.reduce((s, r) => s + r.taxCents, 0);
  const revenueTipBase = authoritativeRecords.reduce((s, r) => s + r.tipCents, 0);
  const revenueRefundBase = authoritativeRecords.reduce((s, r) => s + r.refundCents, 0);

  // Tips: use PAYMENT_SUMMARY records exclusively if present; fall back to authoritative tip total
  const paymentSummaryTips = siblingRecords
    .filter((r) => r.payloadType === InvuPayloadType.PAYMENT_SUMMARY)
    .reduce((sum, r) => sum + r.tipCents, 0);

  // Refunds: use CREDIT_NOTE records exclusively if present; fall back to authoritative refund total
  const creditNoteRefunds = siblingRecords
    .filter((r) => r.payloadType === InvuPayloadType.CREDIT_NOTE)
    .reduce((sum, r) => sum + r.refundCents, 0);

  const agg = {
    grossCents: revenueGross,
    discountCents: revenueDiscount,
    taxCents: revenueTax,
    tipCents: paymentSummaryTips > 0 ? paymentSummaryTips : revenueTipBase,
    refundCents: creditNoteRefunds > 0 ? creditNoteRefunds : revenueRefundBase,
  };

  // Select the canonical record for non-financial metadata (tableLabel, openedAt, closedAt, status).
  // CLOSED_ORDER is preferred over sparse artifacts (PAYMENT_SUMMARY, CREDIT_NOTE) so a late sparse
  // payload never nulls out metadata already captured from the authoritative order event.
  const primary = selectCanonicalRecord(siblingRecords, normalized);

  const isVoided =
    primary.statusCanonical === InvuOrderStatusCanonical.VOIDED ||
    primary.statusCanonical === InvuOrderStatusCanonical.CREDITED;
  const isFullDiscount = agg.discountCents >= agg.grossCents && agg.grossCents > 0;

  // --- Commissionable base rule (per OKÜ ops directive) ---
  // Compensation is paid on NET subtotal — pre-tax and pre-tips.
  //
  //   commissionable = gross − tax    (identical to INVU "NET SUBTOTAL")
  //
  // We do NOT additionally subtract discounts or refunds here because INVU's
  // `total` is already discount-applied (the gross we receive is the post-
  // discount invoice amount); double-subtracting would understate the base.
  // Refunds are handled downstream as payout clawbacks, not at the
  // commissionable-base level.
  //
  // Tips are excluded by construction: INVU's `total` does not include tips
  // (they are tracked on the payments record).
  let commissionableCents = 0;
  if (!isVoided && !isFullDiscount) {
    commissionableCents = Math.max(0, agg.grossCents - agg.taxCents);
  }

  const netRevenueCents = Math.max(0, agg.grossCents - agg.discountCents - agg.refundCents);

  // --- Reconcile with host-opened TableSession via OperationalBinding ---
  //
  // When a host binds an INVU order to an attribution session via the
  // table-open-bind route, that flow stamps `TableSession.openedInvuOrderId`
  // (NOT `TableSession.invuOrderId`). The sync's de-dup query below only
  // looks at `invuOrderId`, so without this reconciliation step the
  // aggregator would create a SECOND TableSession for the same order —
  // splitting the trust chain and surfacing the wrong reservation in admin
  // ledger views (e.g. heuristically misattributing the host-opened order
  // to a nearby reservation).
  //
  // We resolve the host-opened TableSession via OperationalBinding (the
  // canonical link) and stamp its `invuOrderId` so the existing de-dup
  // query path picks it up uniformly. Idempotent: the updateMany guards
  // against overwriting a different invuOrderId already stamped.
  if (normalized.invuOrderId) {
    const binding = await prisma.operationalBinding.findUnique({
      where: { invuOrderId: normalized.invuOrderId },
      select: {
        attributionSession: {
          select: {
            venueId: true,
            tableSession: { select: { id: true, invuOrderId: true } },
          },
        },
      },
    });
    const hostTableSession = binding?.attributionSession?.tableSession;
    const bindingVenueId = binding?.attributionSession?.venueId;
    if (
      hostTableSession &&
      bindingVenueId === venueId &&
      hostTableSession.invuOrderId !== normalized.invuOrderId
    ) {
      await prisma.tableSession.updateMany({
        where: {
          id: hostTableSession.id,
          OR: [{ invuOrderId: null }, { invuOrderId: normalized.invuOrderId }],
        },
        data: { invuOrderId: normalized.invuOrderId },
      });
    }
  }

  // --- Look up prior session link for exact-match priority ---
  let priorReservationId: string | null = null;
  if (normalized.invuOrderId) {
    const existing = await prisma.tableSession.findFirst({
      where: { invuOrderId: normalized.invuOrderId, venueId },
      select: { id: true, reservationId: true },
    });
    priorReservationId = existing?.reservationId ?? null;
  }

  // --- Match against reservations ---
  const sessionTime = primary.openedAt ?? primary.closedAt;
  let candidates: ReservationCandidate[] = [];

  if (sessionTime) {
    const windowStart = new Date(sessionTime.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(sessionTime.getTime() + 2 * 60 * 60 * 1000);
    candidates = await prisma.reservation.findMany({
      where: {
        venueId,
        reservationDate: { gte: windowStart, lte: windowEnd },
      },
      select: {
        id: true,
        reservationDate: true,
        partySize: true,
        contactName: true,
        assignedTableLabel: true,
      },
    });
  }

  // --- Compute data-driven signals for trust scoring ---
  // paymentTotalConsistent: true only when INVU order totals pass basic sanity checks
  const paymentTotalConsistent =
    agg.grossCents > 0 && netRevenueCents >= 0 && agg.refundCents <= agg.grossCents;

  // noDuplicateConflict: true only when no other MATCHED session already links to the same reservation
  // We check this per-candidate once we have a best candidate; for now, pass conservative false
  // and refine below for single-candidate paths
  let noDuplicateConflict = false;
  if (candidates.length > 0) {
    // Check if any candidate reservation already has a matched session from a different invuOrderId
    const candidateIds = candidates.map((r) => r.id);
    const conflictingSession = await prisma.tableSession.findFirst({
      where: {
        venueId,
        reservationId: { in: candidateIds },
        matchMethod: MatchMethod.AUTO,
        NOT: normalized.invuOrderId ? { invuOrderId: normalized.invuOrderId } : {},
      },
      select: { id: true, reservationId: true },
    });
    noDuplicateConflict = !conflictingSession;
  } else {
    noDuplicateConflict = true;
  }

  const matchSignals: MatchSignals = { paymentTotalConsistent, noDuplicateConflict };

  // Pass priorReservationId for Priority #1 exact-match path, plus computed signals
  const matchResult = matchNormalizedToReservation(primary, candidates, priorReservationId, matchSignals);

  let sessionStatus: TableSessionStatus = TableSessionStatus.PENDING_REVIEW;
  if (matchResult.reservationId && matchResult.trustScore >= 0.75) {
    sessionStatus = TableSessionStatus.MATCHED;
  }

  // --- Upsert TableSession, preventing duplicates ---
  let tableSession: { id: string } | null = null;
  let isNew = false;

  if (normalized.invuOrderId) {
    const existing = await prisma.tableSession.findFirst({
      where: { invuOrderId: normalized.invuOrderId, venueId },
      select: { id: true, reservationId: true, tableLabel: true, openedAt: true, closedAt: true },
    });

    if (existing) {
      // Only update reservationId if we have a new/better match
      const reservationUpdate = matchResult.reservationId
        ? { reservationId: matchResult.reservationId }
        : {};

      // Never overwrite non-null metadata with null from a sparse payload artifact.
      const safeTableLabel = primary.tableLabel ?? existing.tableLabel;
      const safeOpenedAt = primary.openedAt ?? existing.openedAt;
      const safeClosedAt = primary.closedAt ?? existing.closedAt;

      tableSession = await prisma.tableSession.update({
        where: { id: existing.id },
        data: {
          grossCents: agg.grossCents,
          discountCents: agg.discountCents,
          taxCents: agg.taxCents,
          tipCents: agg.tipCents,
          refundCents: agg.refundCents,
          netRevenueCents,
          commissionableCents,
          tableLabel: safeTableLabel,
          openedAt: safeOpenedAt,
          closedAt: safeClosedAt,
          matchMethod: matchResult.matchMethod as MatchMethod,
          trustScore: matchResult.trustScore,
          status: sessionStatus,
          syncRunId,
          invuOrderJson: primary.normalizedJson as Prisma.InputJsonValue,
          ...reservationUpdate,
        },
        select: { id: true },
      });
    } else {
      tableSession = await prisma.tableSession.create({
        data: {
          venueId,
          invuOrderId: normalized.invuOrderId,
          invuOrderJson: primary.normalizedJson as Prisma.InputJsonValue,
          tableLabel: primary.tableLabel,
          openedAt: primary.openedAt,
          closedAt: primary.closedAt,
          grossCents: agg.grossCents,
          discountCents: agg.discountCents,
          taxCents: agg.taxCents,
          tipCents: agg.tipCents,
          refundCents: agg.refundCents,
          netRevenueCents,
          commissionableCents,
          matchMethod: matchResult.matchMethod as MatchMethod,
          trustScore: matchResult.trustScore,
          status: sessionStatus,
          reservationId: matchResult.reservationId,
          syncRunId,
        },
        select: { id: true },
      });
      isNew = true;
    }
  } else {
    // No invuOrderId — check for existing session by table+time window to avoid duplicates.
    // Use OR across openedAt/closedAt to handle records where openedAt is null but closedAt is set.
    if (sessionTime && primary.tableLabel) {
      const windowStart = new Date(sessionTime.getTime() - 30 * 60 * 1000);
      const windowEnd = new Date(sessionTime.getTime() + 30 * 60 * 1000);
      const existing = await prisma.tableSession.findFirst({
        where: {
          venueId,
          tableLabel: primary.tableLabel,
          invuOrderId: null,
          OR: [
            { openedAt: { gte: windowStart, lte: windowEnd } },
            { closedAt: { gte: windowStart, lte: windowEnd } },
          ],
        },
        select: { id: true },
      });

      if (existing) {
        tableSession = await prisma.tableSession.update({
          where: { id: existing.id },
          data: {
            grossCents: agg.grossCents,
            discountCents: agg.discountCents,
            taxCents: agg.taxCents,
            tipCents: agg.tipCents,
            refundCents: agg.refundCents,
            netRevenueCents,
            commissionableCents,
            matchMethod: matchResult.matchMethod as MatchMethod,
            trustScore: matchResult.trustScore,
            status: sessionStatus,
            syncRunId,
            invuOrderJson: primary.normalizedJson as Prisma.InputJsonValue,
            ...(matchResult.reservationId ? { reservationId: matchResult.reservationId } : {}),
          },
          select: { id: true },
        });
      } else {
        tableSession = await prisma.tableSession.create({
          data: {
            venueId,
            invuOrderId: null,
            invuOrderJson: primary.normalizedJson as Prisma.InputJsonValue,
            tableLabel: primary.tableLabel,
            openedAt: primary.openedAt,
            closedAt: primary.closedAt,
            grossCents: agg.grossCents,
            discountCents: agg.discountCents,
            taxCents: agg.taxCents,
            tipCents: agg.tipCents,
            refundCents: agg.refundCents,
            netRevenueCents,
            commissionableCents,
            matchMethod: matchResult.matchMethod as MatchMethod,
            trustScore: matchResult.trustScore,
            status: sessionStatus,
            reservationId: matchResult.reservationId,
            syncRunId,
          },
          select: { id: true },
        });
        isNew = true;
      }
    } else {
      tableSession = await prisma.tableSession.create({
        data: {
          venueId,
          invuOrderId: null,
          invuOrderJson: primary.normalizedJson as Prisma.InputJsonValue,
          tableLabel: primary.tableLabel,
          openedAt: primary.openedAt,
          closedAt: primary.closedAt,
          grossCents: agg.grossCents,
          discountCents: agg.discountCents,
          taxCents: agg.taxCents,
          tipCents: agg.tipCents,
          refundCents: agg.refundCents,
          netRevenueCents,
          commissionableCents,
          matchMethod: matchResult.matchMethod as MatchMethod,
          trustScore: matchResult.trustScore,
          status: sessionStatus,
          reservationId: matchResult.reservationId,
          syncRunId,
        },
        select: { id: true },
      });
      isNew = true;
    }
  }

  // --- Create review queue items as needed ---
  let reviewQueueCreated = false;
  const needsReview =
    needsReviewQueue(matchResult.trustScore) ||
    !!matchResult.multipleMatches ||
    isFullDiscount ||
    !primary.tableLabel ||
    !sessionTime;

  if (needsReview && tableSession) {
    let issueType: ReviewIssueType = ReviewIssueType.NO_MATCH;
    if (isFullDiscount) issueType = ReviewIssueType.FULL_DISCOUNT;
    else if (!primary.tableLabel) issueType = ReviewIssueType.MISSING_TABLE;
    else if (matchResult.multipleMatches) issueType = ReviewIssueType.MULTIPLE_MATCHES;
    else if (matchResult.issueType === "LOW_CONFIDENCE_MATCH") issueType = ReviewIssueType.LOW_CONFIDENCE_MATCH;

    const existingReview = await prisma.integrationReviewQueue.findFirst({
      where: {
        tableSessionId: tableSession.id,
        issueType,
        status: { in: [ReviewQueueStatus.OPEN, ReviewQueueStatus.IN_REVIEW] },
      },
      select: { id: true },
    });

    if (!existingReview) {
      await prisma.integrationReviewQueue.create({
        data: {
          venueId,
          syncRunId,
          tableSessionId: tableSession.id,
          reservationId: matchResult.reservationId,
          invuOrderNormalizedId: primary.id,
          issueType,
          status: ReviewQueueStatus.OPEN,
          confidenceScore: matchResult.trustScore,
          summary: buildSummary(issueType, primary, matchResult.trustScore),
          detailJson: {
            normalizedId: primary.id,
            invuOrderId: primary.invuOrderId,
            trustScoreInput: matchResult.trustScoreInput as unknown as Record<string, unknown>,
            isVoided,
            isFullDiscount,
            siblingCount: siblingRecords.length,
          } as Prisma.InputJsonValue,
        },
      });
      reviewQueueCreated = true;
    }
  }

  // Emit a DUPLICATE_ORDER review item explicitly when a duplicate reservation conflict is detected.
  // This surfaces the anomaly even when overall trust score is high enough to not trigger the general queue.
  if (!noDuplicateConflict && tableSession) {
    const existingDuplicate = await prisma.integrationReviewQueue.findFirst({
      where: {
        tableSessionId: tableSession.id,
        issueType: ReviewIssueType.DUPLICATE_ORDER,
        status: { in: [ReviewQueueStatus.OPEN, ReviewQueueStatus.IN_REVIEW] },
      },
      select: { id: true },
    });

    if (!existingDuplicate) {
      await prisma.integrationReviewQueue.create({
        data: {
          venueId,
          syncRunId,
          tableSessionId: tableSession.id,
          invuOrderNormalizedId: primary.id,
          issueType: ReviewIssueType.DUPLICATE_ORDER,
          status: ReviewQueueStatus.OPEN,
          confidenceScore: matchResult.trustScore,
          summary: `Duplicate reservation conflict detected for order ${primary.invuOrderId ?? primary.id} — another AUTO session already links to a candidate reservation`,
          detailJson: {
            normalizedId: primary.id,
            invuOrderId: primary.invuOrderId,
            trustScore: matchResult.trustScore,
          } as Prisma.InputJsonValue,
        },
      });
      if (!reviewQueueCreated) reviewQueueCreated = true;
    }
  }

  // Emit a PAYMENT_MISMATCH review item explicitly when payment totals fail sanity checks.
  // This is independent of the general trust/match review so the anomaly is always surfaced.
  if (!paymentTotalConsistent && tableSession) {
    const existingPaymentMismatch = await prisma.integrationReviewQueue.findFirst({
      where: {
        tableSessionId: tableSession.id,
        issueType: ReviewIssueType.PAYMENT_MISMATCH,
        status: { in: [ReviewQueueStatus.OPEN, ReviewQueueStatus.IN_REVIEW] },
      },
      select: { id: true },
    });

    if (!existingPaymentMismatch) {
      await prisma.integrationReviewQueue.create({
        data: {
          venueId,
          syncRunId,
          tableSessionId: tableSession.id,
          invuOrderNormalizedId: primary.id,
          issueType: ReviewIssueType.PAYMENT_MISMATCH,
          status: ReviewQueueStatus.OPEN,
          confidenceScore: matchResult.trustScore,
          summary: `Payment totals failed sanity checks for order ${primary.invuOrderId ?? primary.id}: gross=${agg.grossCents} refund=${agg.refundCents} net=${netRevenueCents}`,
          detailJson: {
            normalizedId: primary.id,
            invuOrderId: primary.invuOrderId,
            grossCents: agg.grossCents,
            refundCents: agg.refundCents,
            netRevenueCents,
          } as Prisma.InputJsonValue,
        },
      });
      if (!reviewQueueCreated) reviewQueueCreated = true;
    }
  }

  // ─── Deterministic 3-tier resolver + commission minting ───────────────
  // The legacy heuristic (matchNormalizedToReservation) above only sets the
  // top-level matchMethod/trustScore fields. The deterministic trust chain
  // adds matchTier / matchStatus / matchConfidence / matchProofId /
  // commissionEligibility on the same TableSession, and only AUTO-matched
  // sessions with eligible status mint commissions automatically.
  //
  // Heuristic candidates from the reservation lookup above are reused for
  // Tier-3 fallback inside resolveMatch; Tier-1 and Tier-2 use the
  // booking_code / OperationalBinding tables directly.
  try {
    const heuristicCandidates: HeuristicCandidate[] = candidates.map((c) => ({
      reservationId: c.id,
      reservationDate: c.reservationDate,
      partySize: c.partySize,
      contactName: c.contactName,
      assignedTableLabel: c.assignedTableLabel,
    }));
    const tierResult = await resolveMatch(primary, heuristicCandidates);
    await persistMatchResult({
      invuOrderNormalizedId: primary.id,
      invuOrderId: primary.invuOrderId,
      result: tierResult,
      tableSessionId: tableSession.id,
    });
    if (tierResult.status === "AUTO_MATCHED") {
      await mintCommissionsForTableSession(tableSession.id);
    }
  } catch (err) {
    // Trust-chain failures must never break aggregation. The TableSession is
    // already persisted; surface the error in the audit log so an operator
    // can investigate without losing the row.
    try {
      await prisma.auditLog.create({
        data: {
          actorId: "system",
          action: "INVU_TRUST_CHAIN_ERROR",
          metadata: {
            tableSessionId: tableSession.id,
            normalizedId: primary.id,
            invuOrderId: primary.invuOrderId,
            error: (err as Error)?.message ?? String(err),
          },
        },
      });
    } catch {
      // swallow
    }
  }

  return { tableSessionId: tableSession.id, isNew, reviewQueueCreated };
}

/**
 * selectCanonicalRecord: choose the best sibling record for non-financial metadata
 * (tableLabel, openedAt, closedAt, statusCanonical, normalizedJson).
 *
 * Priority: CLOSED_ORDER > ORDER_TOTAL > INVOICE_TOTAL > PAYMENT_SUMMARY > CREDIT_NOTE > fallback.
 * Within the same type, prefer records with both tableLabel and openedAt, then tableLabel only.
 *
 * This ensures sparse payloads (e.g., PAYMENT_SUMMARY, CREDIT_NOTE) never overwrite richer
 * metadata from an earlier CLOSED_ORDER artifact.
 */
function selectCanonicalRecord(
  siblings: InvuOrderNormalized[],
  fallback: InvuOrderNormalized
): InvuOrderNormalized {
  const METADATA_PRIORITY: InvuPayloadType[] = [
    InvuPayloadType.CLOSED_ORDER,
    InvuPayloadType.ORDER_TOTAL,
    InvuPayloadType.INVOICE_TOTAL,
    InvuPayloadType.PAYMENT_SUMMARY,
    InvuPayloadType.CREDIT_NOTE,
  ];

  for (const pt of METADATA_PRIORITY) {
    const group = siblings.filter((r) => r.payloadType === pt);
    if (group.length === 0) continue;
    const withBoth = group.find((r) => r.tableLabel && r.openedAt);
    if (withBoth) return withBoth;
    const withLabel = group.find((r) => r.tableLabel);
    if (withLabel) return withLabel;
    return group[0];
  }
  return fallback;
}

function buildSummary(
  issueType: ReviewIssueType,
  normalized: InvuOrderNormalized,
  trustScore: number
): string {
  const orderRef = normalized.publicOrderNumber ?? normalized.invuOrderId ?? "unknown";
  const table = normalized.tableLabel ?? "no table";
  switch (issueType) {
    case ReviewIssueType.FULL_DISCOUNT:
      return `Order ${orderRef} (${table}) is 100% discounted — zero commission`;
    case ReviewIssueType.MISSING_TABLE:
      return `Order ${orderRef} has no table label — cannot auto-match`;
    case ReviewIssueType.MULTIPLE_MATCHES:
      return `Order ${orderRef} (${table}) matched multiple reservations — review needed`;
    case ReviewIssueType.LOW_CONFIDENCE_MATCH:
      return `Order ${orderRef} (${table}) low-confidence match (score: ${trustScore.toFixed(2)})`;
    default:
      return `Order ${orderRef} (${table}) could not be matched to a reservation`;
  }
}
