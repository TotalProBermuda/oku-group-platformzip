/**
 * Sweep duplicate TableSession rows that share the same invuOrderId+venueId.
 *
 * Background: the aggregator historically created a fresh TableSession every
 * time a sync pulled an INVU order, even when a host had already opened a
 * TableSession for that order via the bind UI. The result was 2+ rows for
 * the same physical dining occasion — one host-anchored (correct), one or
 * more sync-orphans (heuristically misattributed).
 *
 * The aggregator is now patched to reconcile via OperationalBinding before
 * de-dup. This script cleans up the historical orphans created prior to
 * the fix.
 *
 * Keeper selection (in priority order):
 *   1. The TableSession a current InvuOrderNormalized.tableSessionId points at
 *   2. The TableSession with attributionSessionId (host-anchored)
 *   3. The earliest TableSession (oldest id)
 *
 * Safety guards: an orphan is deleted ONLY when ALL of:
 *   - it has no attributionSessionId
 *   - no CommissionAllocation rows reference it
 *   - no InvuOrderNormalized row currently points at it
 * Otherwise the row is left alone and logged for manual review.
 *
 * Run with: npx tsx scripts/sweep-duplicate-table-sessions.ts
 *           npx tsx scripts/sweep-duplicate-table-sessions.ts --dry-run
 */
import { prisma } from "@/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

type DupeRow = {
  invuOrderId: string;
  venueId: string;
  ids: string[];
};

async function main() {
  const groups = await prisma.$queryRaw<DupeRow[]>`
    SELECT "invuOrderId", "venueId", ARRAY_AGG(id ORDER BY "openedAt" NULLS LAST, id) AS ids
      FROM "TableSession"
     WHERE "invuOrderId" IS NOT NULL
     GROUP BY "invuOrderId", "venueId"
    HAVING COUNT(*) > 1
  `;

  console.log(`[sweep] ${DRY_RUN ? "DRY-RUN: " : ""}found ${groups.length} duplicate group(s)`);

  let deletedSessions = 0;
  let deletedProofs = 0;
  let updatedReviewQueue = 0;
  let skipped = 0;

  for (const g of groups) {
    const sessionsRaw = await prisma.tableSession.findMany({
      where: { id: { in: g.ids } },
      select: {
        id: true,
        attributionSessionId: true,
        matchProofId: true,
        openedAt: true,
        commissionEligibility: true,
      },
    });
    // Preserve the SQL ORDER BY (openedAt NULLS LAST, id) — Prisma's
    // findMany does not guarantee ordering when querying by `id IN (...)`.
    // Without this, the "earliest" keeper fallback (priority #3) would be
    // non-deterministic across runs.
    const sessionMap = new Map(sessionsRaw.map((s) => [s.id, s]));
    const sessions = g.ids
      .map((id) => sessionMap.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s);

    const normalizedPointers = await prisma.invuOrderNormalized.findMany({
      where: { tableSessionId: { in: g.ids } },
      select: { id: true, tableSessionId: true },
    });
    const pointedAtIds = new Set(
      normalizedPointers.map((n) => n.tableSessionId).filter((x): x is string => !!x),
    );

    // Keeper selection
    let keeperId: string | undefined;
    if (pointedAtIds.size > 0) {
      keeperId = sessions.find((s) => pointedAtIds.has(s.id))?.id;
    }
    if (!keeperId) {
      keeperId = sessions.find((s) => !!s.attributionSessionId)?.id;
    }
    if (!keeperId) {
      keeperId = sessions[0]?.id;
    }

    console.log(
      `[sweep] order=${g.invuOrderId} venue=${g.venueId} sessions=${sessions.length} keeper=${keeperId}`,
    );

    for (const s of sessions) {
      if (s.id === keeperId) continue;

      // Hard guards: never delete a row with attribution or commission
      if (s.attributionSessionId) {
        console.warn(`  [skip] ${s.id} has attributionSessionId — manual review`);
        skipped++;
        continue;
      }

      const allocs = await prisma.commissionAllocation.count({
        where: { tableSessionId: s.id },
      });
      if (allocs > 0) {
        console.warn(`  [skip] ${s.id} has ${allocs} commission allocation(s) — manual review`);
        skipped++;
        continue;
      }

      // Safety: never delete a row that something currently points at
      const pointedAt = await prisma.invuOrderNormalized.count({
        where: { tableSessionId: s.id },
      });
      if (pointedAt > 0) {
        console.warn(`  [skip] ${s.id} is referenced by ${pointedAt} normalized row(s) — manual review`);
        skipped++;
        continue;
      }

      console.log(`  [delete] orphan ${s.id}`);

      if (!DRY_RUN) {
        await prisma.$transaction(async (tx) => {
          // 1. Re-point any review queue items at the keeper so the audit
          //    trail is preserved without dangling references.
          const rq = await tx.integrationReviewQueue.updateMany({
            where: { tableSessionId: s.id },
            data: { tableSessionId: keeperId, status: "RESOLVED" },
          });
          updatedReviewQueue += rq.count;

          // 2. Break the FK from TableSession.matchProofId so we can delete
          //    the bad MatchProof.
          if (s.matchProofId) {
            await tx.tableSession.update({
              where: { id: s.id },
              data: { matchProofId: null },
            });
          }

          // 3. Delete heuristic MatchProofs the orphan created. Scope
          //    STRICTLY to (a) this venue's normalized rows for this
          //    invuOrderId, and (b) Tier-3 heuristic proofs with no
          //    attribution session — never proofs the keeper relies on.
          //    Without venue scoping, an INVU order id collision across
          //    venues could nuke unrelated proofs.
          const normalizedForOrder = await tx.invuOrderNormalized.findMany({
            where: { invuOrderId: g.invuOrderId, venueId: g.venueId },
            select: { id: true },
          });
          const normalizedIds = normalizedForOrder.map((n) => n.id);
          let proofsCount = 0;
          if (normalizedIds.length > 0) {
            // Look up the keeper's matchProofId so we never delete it,
            // even if it happens to be Tier-3 (defensive — should not
            // occur, but the cost is one row read).
            const keeperRow = await tx.tableSession.findUnique({
              where: { id: keeperId },
              select: { matchProofId: true },
            });
            const proofs = await tx.matchProof.findMany({
              where: {
                invuOrderNormalizedId: { in: normalizedIds },
                attributionSessionId: null,
                matchTier: "TIER3_HEURISTIC_REVIEW",
                ...(keeperRow?.matchProofId
                  ? { NOT: { id: keeperRow.matchProofId } }
                  : {}),
              },
              select: { id: true },
            });
            if (proofs.length > 0) {
              const del = await tx.matchProof.deleteMany({
                where: { id: { in: proofs.map((p) => p.id) } },
              });
              deletedProofs += del.count;
              proofsCount = del.count;
            }
          }

          // 4. Delete the orphan TableSession itself
          await tx.tableSession.delete({ where: { id: s.id } });
          deletedSessions++;

          // 5. Audit log entry
          await tx.auditLog.create({
            data: {
              actorId: "system",
              action: "INVU_DUPLICATE_TABLE_SESSION_PURGED",
              metadata: {
                purgedTableSessionId: s.id,
                keeperTableSessionId: keeperId,
                invuOrderId: g.invuOrderId,
                venueId: g.venueId,
                reviewQueueRepointed: rq.count,
                matchProofsDeleted: proofsCount,
              },
            },
          });
        });
      } else {
        deletedSessions++; // dry-run counter
      }
    }
  }

  console.log(`\n[sweep] ${DRY_RUN ? "DRY-RUN " : ""}summary:`);
  console.log(`  duplicate groups:           ${groups.length}`);
  console.log(`  orphan sessions ${DRY_RUN ? "would-delete" : "deleted"}: ${deletedSessions}`);
  console.log(`  match proofs ${DRY_RUN ? "would-delete" : "deleted"}:    ${deletedProofs}`);
  console.log(`  review queue re-pointed:    ${updatedReviewQueue}`);
  console.log(`  skipped (manual review):    ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
