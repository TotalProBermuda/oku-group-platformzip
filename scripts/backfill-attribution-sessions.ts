/**
 * Bucket A4 — historical AttributionSession backfill.
 *
 * Synthesizes an AttributionSession (source: MANUAL_ADMIN) for every
 * Reservation that:
 *   - has at least one ReservationAttribution.referrerId set
 *   - does NOT already have an AttributionSession (the unique reservationId
 *     index makes this idempotent — re-running is a no-op for already-
 *     backfilled rows)
 *
 * Lifecycle inference (best-effort, never destructive):
 *   - VERIFIED_POS_SALE if a closed TableSession exists for the reservation
 *     AND its matchStatus = AUTO_MATCHED
 *   - SEATED if a TableSession exists in any state
 *   - CAPTURED otherwise
 *
 * Note: POS_BIND_INTENT_RECORDED is unreachable here because
 * OperationalBinding rows are pinned to an AttributionSession; for the
 * cohort we're synthesizing, no such row can exist yet.
 *
 * History note: this script previously had a POS_REFERENCE_WRITTEN
 * inference branch keyed off `tableSession.invuReferenceWritten`. That
 * branch was retired Apr 28 2026 along with the rest of the citas/add
 * write path (vendor confirmed no INVU API write capability). The column
 * is preserved in the schema as historical signal but is always false
 * for any row produced after that date.
 *
 * Run: npx tsx scripts/backfill-attribution-sessions.ts [--dry-run]
 */
import { prisma } from "../src/lib/prisma";
import { randomBytes } from "crypto";

type LifecycleStatus =
  | "CAPTURED"
  | "SEATED"
  | "POS_BIND_INTENT_RECORDED"
  | "VERIFIED_POS_SALE";

function generateBookingCode(): string {
  // OKU-YYYY-XXXXXXXX (matches BOOKING_CODE_RE in invuMatchService).
  const year = new Date().getFullYear();
  const suffix = randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
  return `OKU-${year}-${suffix}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[backfill] starting (dryRun=${dryRun})`);

  // Pull every Reservation that has a referrer attribution and no session.
  // We page in batches so a giant historical backlog never blows the heap.
  const PAGE = 200;
  let cursor: string | undefined = undefined as string | undefined;
  let processed = 0;
  let created = 0;
  let skipped = 0;
  const counts: Record<LifecycleStatus, number> = {
    CAPTURED: 0,
    SEATED: 0,
    POS_BIND_INTENT_RECORDED: 0,
    VERIFIED_POS_SALE: 0,
  };

  while (true) {
    const batch = await prisma.reservation.findMany({
      where: {
        attributionSession: null,
        attributions: { some: { referrerId: { not: null } } },
      },
      select: {
        id: true,
        venueId: true,
        attributions: { select: { referrerId: true }, take: 1, where: { referrerId: { not: null } } },
        tableSessions: {
          select: { id: true, closedAt: true, matchStatus: true },
          orderBy: { openedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;

    for (const r of batch) {
      processed += 1;
      const referrerId = r.attributions[0]?.referrerId ?? null;
      if (!referrerId) {
        skipped += 1;
        continue;
      }

      const ts = r.tableSessions[0];
      let status: LifecycleStatus = "CAPTURED";
      if (ts?.closedAt && ts.matchStatus === "AUTO_MATCHED") {
        status = "VERIFIED_POS_SALE";
      } else if (ts) {
        status = "SEATED";
      }

      counts[status] += 1;
      if (dryRun) continue;

      try {
        await prisma.attributionSession.create({
          data: {
            kind: "RESERVATION",
            venueId: r.venueId,
            reservationId: r.id,
            bookingCode: generateBookingCode(),
            source: "MANUAL_ADMIN",
            status,
            legacyReferrerId: referrerId,
            seatedAt: ts ? new Date() : null,
            verifiedAt: status === "VERIFIED_POS_SALE" ? new Date() : null,
            boundAt: status === "VERIFIED_POS_SALE" ? new Date() : null,
          },
        });
        created += 1;
      } catch (err) {
        // Most likely cause: a parallel writer just minted a session for
        // this reservation. Idempotent skip.
        skipped += 1;
        console.warn(`[backfill] skip ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    cursor = batch[batch.length - 1]?.id;
    if (batch.length < PAGE) break;
  }

  console.log(`[backfill] done — processed=${processed} created=${created} skipped=${skipped}`);
  console.log("[backfill] status breakdown:", counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
