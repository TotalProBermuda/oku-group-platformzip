/**
 * Backfill — TableSession financials roll-up.
 *
 * Diagnoses + repairs the gross-rollup gap discovered Apr 29 2026:
 *
 *   When a host pre-binds an INVU order (table-open-bind), the operational
 *   binding is later resolved by invuMatchService at TIER2_OPERATIONAL.
 *   That match path correctly stamps `invuOrderId`, `matchStatus`,
 *   `matchTier`, and links the InvuOrderNormalized row to the
 *   TableSession — but it does NOT carry the financials (grossCents,
 *   discountCents, taxCents, tipCents, refundCents, netRevenueCents,
 *   commissionableCents, closedAt) across. Result: TableSession.grossCents
 *   stays 0, commissionableCents stays 0, and commission auto-mint is
 *   silently skipped (gated on commissionableCents > 0).
 *
 *   This script finds every TableSession whose linked InvuOrderNormalized
 *   has authoritative financial data and copies it across. Idempotent —
 *   skips rows that are already populated. For rows that flip from $0 →
 *   non-zero AND are AUTO_MATCHED + VERIFIED_POS_SALE, also triggers
 *   commissionMintingService so the loop closes.
 *
 *   Companion to the structural fix in invuMatchService.persistMatchResult
 *   (T2 of this work) — together they prevent the bug from re-occurring
 *   on new sessions while repairing existing ones.
 *
 * Run: npx tsx scripts/backfill-tablesession-financials.ts [--dry-run] [--limit=N]
 */
import { prisma } from "../src/lib/prisma";
import { mintCommissionsForTableSession } from "../src/server/services/invu/commissionMintingService";

type NormalizedFinancials = {
  grossCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  refundCents: number;
  netRevenueCents: number;
  closedAt: Date | null;
  statusCanonical: string;
};

function computeCommissionable(n: NormalizedFinancials): number {
  // Mirrors invuAggregationService.ts §"Commissionable base rule":
  //   - VOIDED / CREDITED       → 0
  //   - discount >= gross > 0   → 0 (full discount)
  //   - else                    → max(0, gross - tax)
  const isVoided =
    n.statusCanonical === "VOIDED" ||
    n.statusCanonical === "CREDITED";
  const isFullDiscount =
    n.discountCents >= n.grossCents && n.grossCents > 0;
  if (isVoided || isFullDiscount) return 0;
  return Math.max(0, n.grossCents - n.taxCents);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1] ?? "0", 10) : 0;

  console.log(
    `[backfill-ts-financials] starting (dryRun=${dryRun}, limit=${limit || "none"})`
  );

  // Pull every TableSession that:
  //   - has an invuOrderId stamped (so a real INVU order is known to belong to it)
  //   - has at least one InvuOrderNormalized linked to it (the data source)
  // We then filter in code for "actually needs a backfill" so the SQL stays
  // simple and observably correct.
  const candidates = await prisma.tableSession.findMany({
    where: {
      OR: [
        // Pass A — rows that may need financial repair: have a real INVU
        // order link AND at least one normalized row with money on it.
        {
          invuOrderId: { not: null },
          invuOrders: { some: { grossCents: { gt: 0 } } },
        },
        // Pass B — auto-close walk-ins: closed-in-INVU rows with money on
        // the TableSession itself but no commission earner linked. The
        // normalized link may be missing/zeroed (legacy denormalized
        // writes), so query off TableSession's own fields.
        {
          status: "PENDING_REVIEW",
          grossCents: { gt: 0 },
          attributionSessionId: null,
          matchStatus: { in: ["UNMATCHED", "REVIEW_PENDING"] },
        },
      ],
    },
    select: {
      id: true,
      invuOrderId: true,
      grossCents: true,
      discountCents: true,
      taxCents: true,
      tipCents: true,
      refundCents: true,
      netRevenueCents: true,
      commissionableCents: true,
      closedAt: true,
      matchStatus: true,
      status: true,
      commissionEligibility: true,
      attributionSessionId: true,
      reservationId: true,
      bookingCode: true,
      attributionSession: { select: { id: true, status: true } },
      invuOrders: {
        select: {
          id: true,
          grossCents: true,
          discountCents: true,
          taxCents: true,
          tipCents: true,
          refundCents: true,
          netRevenueCents: true,
          closedAt: true,
          statusCanonical: true,
        },
        orderBy: { closedAt: "desc" },
      },
    },
    take: limit > 0 ? limit : undefined,
  });

  console.log(`[backfill-ts-financials] scanned ${candidates.length} candidates`);

  let updated = 0;
  let noChange = 0;
  let mintedCount = 0;
  let mintErrors = 0;

  for (const ts of candidates) {
    // No linked normalized rows → can't do financial repair, but we can
    // still consider auto-close (which only reads TableSession fields).
    // Build a zero-aggregate so the rest of the loop is uniform.
    const agg = ts.invuOrders.length === 0
      ? {
          grossCents: 0,
          discountCents: 0,
          taxCents: 0,
          tipCents: 0,
          refundCents: 0,
          netRevenueCents: 0,
          closedAt: null as Date | null,
          statusCanonical: "CLOSED",
        }
      : ts.invuOrders.reduce(
      (acc, n) => ({
        grossCents: acc.grossCents + n.grossCents,
        discountCents: acc.discountCents + n.discountCents,
        taxCents: acc.taxCents + n.taxCents,
        tipCents: acc.tipCents + n.tipCents,
        refundCents: acc.refundCents + n.refundCents,
        netRevenueCents: acc.netRevenueCents + n.netRevenueCents,
        // Use the latest closedAt across the rollup
        closedAt: acc.closedAt ?? n.closedAt,
        // If ANY constituent is voided/credited, treat the rollup as such
        statusCanonical:
          n.statusCanonical === "VOIDED" || n.statusCanonical === "CREDITED"
            ? n.statusCanonical
            : acc.statusCanonical,
      }),
      {
        grossCents: 0,
        discountCents: 0,
        taxCents: 0,
        tipCents: 0,
        refundCents: 0,
        netRevenueCents: 0,
        closedAt: null as Date | null,
        statusCanonical: "CLOSED",
      }
    );

    const targetCommissionable = computeCommissionable(agg);

    // STRICT SCOPE: only repair the gross-rollup gap (TableSession.grossCents = 0
    // while linked InvuOrderNormalized has real $). Do NOT touch sessions that
    // already have non-zero financials — some pre-existing rows show a SEPARATE
    // double-count anomaly (sums larger than the linked normalized rows) that
    // is outside the scope of this targeted fix and warrants its own diagnosis.
    const isTargetedGap = ts.grossCents === 0 && agg.grossCents > 0;

    // Mirror persistMatchResult's auto-promote rule: PENDING_REVIEW →
    // MATCHED on a clean AUTO_MATCH/MANUALLY_OVERRIDDEN with real
    // financials. Use the EFFECTIVE commissionable (the one we'd be
    // about to write OR the one already on disk) so this catches both
    // (a) rows we just repaired and (b) rows whose financials were
    // already correct but never got promoted.
    const effectiveCommissionable = isTargetedGap ? targetCommissionable : ts.commissionableCents;
    const needsStatusPromote =
      (ts.matchStatus === "AUTO_MATCHED" || ts.matchStatus === "MANUALLY_OVERRIDDEN") &&
      ts.status === "PENDING_REVIEW" &&
      effectiveCommissionable > 0;

    // Mirror persistMatchResult's auto-close rule: closed-in-INVU walk-ins
    // (UNMATCHED/REVIEW_PENDING with no AttributionSession on either side)
    // → CLOSED with commissionableCents=0. There is no commission earner
    // to mint to; sitting in PENDING_REVIEW just generates noise. The
    // effective closedAt/grossCents check uses the post-rollup values so
    // a row whose closedAt is stamped THIS run also qualifies.
    const effectiveClosedAt = (isTargetedGap && agg.closedAt && !ts.closedAt) ? agg.closedAt : ts.closedAt;
    const effectiveGrossCents = isTargetedGap ? agg.grossCents : ts.grossCents;
    // Mirror persistMatchResult's earner-presence guard. Auto-close only
    // when there is genuinely NO commission earner signal anywhere:
    //   - no linked AttributionSession on this row
    //   - no ReservationAttribution rows on the linked reservation
    //   - no UNlinked AttributionSession discoverable via reservationId
    //     or bookingCode (covers the invuOrderId format-mismatch case
    //     where the pre-bind AttributionSession is keyed by full INVU
    //     order id "1-2-XXXX-YYYY" while TableSession only stores XXXX).
    let hasAnyEarnerSignal = false;
    if (ts.reservationId) {
      const [legacyCount, sessionCount] = await Promise.all([
        prisma.reservationAttribution.count({
          where: { reservationId: ts.reservationId },
        }),
        prisma.attributionSession.count({
          where: { reservationId: ts.reservationId },
        }),
      ]);
      hasAnyEarnerSignal = legacyCount > 0 || sessionCount > 0;
    }
    if (!hasAnyEarnerSignal && ts.bookingCode) {
      const codeCount = await prisma.attributionSession.count({
        where: { bookingCode: ts.bookingCode },
      });
      hasAnyEarnerSignal = codeCount > 0;
    }

    // Conservative fallback: when the TableSession lacks BOTH a
    // reservationId and a bookingCode, the earner-presence checks above
    // cannot reach external evidence — the row is "unknowable" from this
    // side. Treat unknowable rows as ineligible for auto-close so the
    // backfill never strips commission from a row whose earner happens
    // to live in a table we couldn't query.
    const isLinkable = Boolean(ts.reservationId) || Boolean(ts.bookingCode);

    const needsAutoClose =
      (ts.matchStatus === "UNMATCHED" || ts.matchStatus === "REVIEW_PENDING") &&
      ts.status === "PENDING_REVIEW" &&
      ts.attributionSessionId === null &&
      isLinkable &&
      !hasAnyEarnerSignal &&
      effectiveClosedAt !== null &&
      effectiveGrossCents > 0;

    if (!isTargetedGap && !needsStatusPromote && !needsAutoClose) {
      noChange++;
      continue;
    }

    const action = needsAutoClose
      ? "AUTO-CLOSE walk-in"
      : isTargetedGap
        ? "UPDATE financials"
        : "PROMOTE status only";
    console.log(
      `[backfill-ts-financials] ${dryRun ? "WOULD " : ""}${action} ts=${ts.id} ` +
        `invuOrderId=${ts.invuOrderId} ` +
        `matchStatus=${ts.matchStatus} ` +
        `gross ${ts.grossCents}→${isTargetedGap ? agg.grossCents : ts.grossCents} ` +
        `commissionable ${ts.commissionableCents}→${needsAutoClose ? 0 : effectiveCommissionable} ` +
        (needsStatusPromote ? `status PENDING_REVIEW→MATCHED ` : "") +
        (needsAutoClose ? `status PENDING_REVIEW→CLOSED ` : "")
    );

    if (!dryRun) {
      const updateData: Record<string, unknown> = {};
      if (isTargetedGap) {
        Object.assign(updateData, {
          grossCents: agg.grossCents,
          discountCents: agg.discountCents,
          taxCents: agg.taxCents,
          tipCents: agg.tipCents,
          refundCents: agg.refundCents,
          netRevenueCents: agg.netRevenueCents,
          commissionableCents: targetCommissionable,
          ...(agg.closedAt && !ts.closedAt ? { closedAt: agg.closedAt } : {}),
        });
      }
      if (needsStatusPromote) {
        updateData.status = "MATCHED" as const;
      }
      if (needsAutoClose) {
        updateData.status = "CLOSED" as const;
        updateData.commissionableCents = 0;
      }
      await prisma.tableSession.update({ where: { id: ts.id }, data: updateData });
      updated++;

      // Trigger mint if eligible. mintCommissionsForTableSession is itself
      // hard-gated on AUTO_MATCHED + ELIGIBLE_AUTO + commissionableCents > 0
      // + AttributionSession.status = VERIFIED_POS_SALE, so unsafe rows
      // are no-ops. We only call it when the row could plausibly mint, to
      // keep the log honest.
      //
      // Subtle gap: rows that were stuck by the original bug may still have
      // their AttributionSession in CAPTURED/SEATED/POS_BIND_INTENT_RECORDED/
      // BOUND_TO_POS — because persistMatchResult only advances to
      // VERIFIED_POS_SALE on a successful AUTO_MATCH, and these rows never
      // got a clean rollup. Now that we've repaired the financials, mirror
      // persistMatchResult's advance step (same enum-narrowed updateMany,
      // forward-only — never rewinds VERIFIED rows) so the minter gate can
      // actually open. Without this, the backfill repairs the row but
      // silently fails to mint.
      if (
        ts.matchStatus === "AUTO_MATCHED" &&
        ts.commissionEligibility === "ELIGIBLE_AUTO" &&
        targetCommissionable > 0 &&
        ts.attributionSession &&
        ["CAPTURED", "SEATED", "POS_BIND_INTENT_RECORDED", "BOUND_TO_POS"].includes(
          ts.attributionSession.status
        )
      ) {
        await prisma.attributionSession.updateMany({
          where: {
            id: ts.attributionSession.id,
            status: { in: ["CAPTURED", "SEATED", "POS_BIND_INTENT_RECORDED", "BOUND_TO_POS"] },
          },
          data: { status: "VERIFIED_POS_SALE", verifiedAt: new Date() },
        });
        console.log(
          `[backfill-ts-financials]   ↳ advanced AttributionSession ${ts.attributionSession.id} → VERIFIED_POS_SALE`
        );
        ts.attributionSession.status = "VERIFIED_POS_SALE";
      }

      const couldMint =
        ts.matchStatus === "AUTO_MATCHED" &&
        ts.commissionEligibility === "ELIGIBLE_AUTO" &&
        ts.attributionSession?.status === "VERIFIED_POS_SALE" &&
        targetCommissionable > 0;
      if (couldMint) {
        try {
          const mintResult = await mintCommissionsForTableSession(ts.id);
          if (mintResult.minted.length > 0) {
            mintedCount++;
            console.log(
              `[backfill-ts-financials]   ↳ minted ${mintResult.minted.length} allocation(s) for ts=${ts.id}`
            );
          } else if (mintResult.skipped.length > 0) {
            console.log(
              `[backfill-ts-financials]   ↳ mint skipped (${mintResult.skipped
                .map((s) => `${s.earnerType}:${s.reason}`)
                .join(", ")})`
            );
          }
        } catch (err: unknown) {
          mintErrors++;
          console.error(
            `[backfill-ts-financials]   ↳ mint error for ts=${ts.id}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    } else {
      updated++;
    }
  }

  console.log(
    `[backfill-ts-financials] done — scanned=${candidates.length} ` +
      `updated=${updated} noChange=${noChange} ` +
      `minted=${mintedCount} mintErrors=${mintErrors}` +
      (dryRun ? " (dry-run; no DB writes)" : "")
  );
}

main()
  .catch((err) => {
    console.error("[backfill-ts-financials] FATAL", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
