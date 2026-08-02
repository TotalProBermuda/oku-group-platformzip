/**
 * Backfill — Host attribution chain.
 *
 * Walks every Reservation that has `assignedRestaurantHostId` set and
 * idempotently ensures the commission attribution chain reflects that
 * host:
 *   - AttributionSession.referralActorId  (modern, drives "Referred by")
 *   - AttributionSession.legacyReferrerId (when a legacy Referrer exists)
 *   - ReservationAttribution row          (only when a legacy Referrer
 *     exists; the modern host-link case has no Referrer FK to write to)
 *
 * Safe to re-run: ensureHostAttributionForReservation never overwrites
 * an already-populated referrer slot, so a QR-driven attribution wins
 * over the host fallback every time.
 *
 * Run: npx tsx scripts/backfill-host-attribution.ts [--dry-run] [--limit=N]
 */
import { prisma } from "../src/lib/prisma";
import {
  ensureHostAttributionForReservation,
  resolveAttributionForHostProfile,
} from "../src/server/referrals/hostAttributionResolver";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1] ?? "0", 10) : 0;

  console.log(`[backfill-host-attribution] starting (dryRun=${dryRun}, limit=${limit || "none"})`);

  const PAGE = 200;
  let cursor: string | undefined = undefined;
  let scanned = 0;
  let updatedAttributionSession = 0;
  let createdReservationAttribution = 0;
  let noChange = 0;
  const sourceTallies: Record<string, number> = {};

  type Row = { id: string; assignedRestaurantHostId: string | null };
  while (true) {
    const args = {
      where: { assignedRestaurantHostId: { not: null } },
      select: { id: true, assignedRestaurantHostId: true },
      orderBy: { id: "asc" as const },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    };
    const batch: Row[] = await prisma.reservation.findMany(args);
    if (batch.length === 0) break;

    for (const row of batch) {
      if (limit && scanned >= limit) break;
      scanned++;
      const hostProfileId = row.assignedRestaurantHostId!;

      if (dryRun) {
        const resolved = await resolveAttributionForHostProfile(hostProfileId);
        sourceTallies[resolved.source] = (sourceTallies[resolved.source] ?? 0) + 1;
        continue;
      }

      try {
        const result = await ensureHostAttributionForReservation(row.id, hostProfileId);
        sourceTallies[result.resolved.source] = (sourceTallies[result.resolved.source] ?? 0) + 1;
        if (result.attributionSessionUpdated) updatedAttributionSession++;
        if (result.reservationAttributionCreated) createdReservationAttribution++;
        if (!result.attributionSessionUpdated && !result.reservationAttributionCreated) {
          noChange++;
        }
      } catch (err) {
        console.error(
          `[backfill-host-attribution] failed for reservation=${row.id}`,
          err
        );
      }
    }

    if (limit && scanned >= limit) break;
    cursor = batch[batch.length - 1]?.id;
    if (!cursor) break;
  }

  console.log(`[backfill-host-attribution] done`);
  console.log(`  scanned                       : ${scanned}`);
  console.log(`  attributionSessions updated   : ${updatedAttributionSession}`);
  console.log(`  reservationAttributions added : ${createdReservationAttribution}`);
  console.log(`  no-change (already healed)    : ${noChange}`);
  console.log(`  resolution source tallies     :`, sourceTallies);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
