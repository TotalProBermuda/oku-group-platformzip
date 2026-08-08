/**
 * Regression test: capacity hold lifecycle
 *
 * Verifies two key invariants:
 *   1. A hold for a FUTURE reservation is NOT prematurely expired by
 *      expireStaleHolds() — holds only become eligible for expiry once
 *      their expiresAt (= reservationEndAt + 30 min) has passed.
 *
 *   2. getHeldCovers() correctly excludes a hold whose expiresAt has
 *      passed even if the sweep has not yet run (defense-in-depth
 *      `expiresAt > now` filter in the availability query).
 *
 * Run with:
 *   npx tsx src/server/spaces/__tests__/capacityHoldExpiry.test.ts
 */

import { PrismaClient } from "@prisma/client";
import { expireStaleHolds, getHeldCovers } from "../capacityService";

const prisma = new PrismaClient();

async function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    throw new Error(`Assertion failed: ${label}`);
  }
}

async function main() {
  const SPACE_ID = "test-space-confirmed";
  const EMAIL    = `expiry-regression-${Date.now()}@test.internal`;

  const now = new Date();

  // ── Seed: venue, guest profile, reservation ─────────────────────────────
  const venue = await prisma.venue.findFirst({ where: { slug: "gold-house" } });
  if (!venue) throw new Error("Venue 'gold-house' not found — run the seed first");

  let guest = await prisma.resGuestProfile.findFirst({ where: { email: EMAIL } });
  if (!guest) {
    guest = await prisma.resGuestProfile.create({
      data: { fullName: "Expiry Regression Test", email: EMAIL },
    });
  }

  // Future reservation window: 30 days from now
  const futureStart  = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  const futureEnd    = new Date(futureStart.getTime() + 2 * 60 * 60_000);
  const futureExpiry = new Date(futureEnd.getTime() + 30 * 60_000);

  const reservation = await prisma.reservation.create({
    data: {
      venueId: venue.id,
      guestProfileId: guest.id,
      source: "QR_CODE",
      status: "CONFIRMED",
      reservationDate: futureStart,
      partySize: 2,
      conceptRequested: "TERRACE",
      contactName: "Expiry Regression Test",
      contactEmail: EMAIL,
      confirmationCode: `EXPTEST${Date.now()}`,
    },
  });

  let passed = 0;
  let failed = 0;

  try {
    // ── Scenario A: future hold must survive expireStaleHolds ────────────────
    console.log("\nScenario A — future hold not prematurely expired:");

    const futureHold = await prisma.capacityHold.create({
      data: {
        spaceId: SPACE_ID,
        reservationId: reservation.id,
        startAt: futureStart,
        endAt: futureEnd,
        partySize: 2,
        status: "ACTIVE",
        expiresAt: futureExpiry,         // 30 days + 2h30m from now
      },
    });

    await expireStaleHolds();

    const holdAfterSweep = await prisma.capacityHold.findUnique({
      where: { id: futureHold.id },
    });
    try {
      await assert(
        "hold with future expiresAt remains ACTIVE after sweep",
        holdAfterSweep?.status === "ACTIVE"
      );
      passed++;
    } catch { failed++; }

    const heldDuringWindow = await getHeldCovers(SPACE_ID, futureStart, futureEnd);
    try {
      await assert(
        `getHeldCovers counts the active future hold (got ${heldDuringWindow}, want >= 2)`,
        heldDuringWindow >= 2
      );
      passed++;
    } catch { failed++; }

    // ── Scenario B: expired-but-not-yet-swept hold is excluded ──────────────
    // Simulate a hold whose expiresAt has passed but the sweep hasn't run.
    // getHeldCovers must NOT count it (defense-in-depth expiresAt filter).
    console.log("\nScenario B — expired hold excluded before sweep:");

    await prisma.capacityHold.update({
      where: { id: futureHold.id },
      data: { expiresAt: new Date(now.getTime() - 60_000) }, // 1 minute in the past
    });

    const heldAfterLogicalExpiry = await getHeldCovers(SPACE_ID, futureStart, futureEnd);
    try {
      await assert(
        "getHeldCovers excludes hold with past expiresAt (status still ACTIVE, sweep not yet run)",
        heldAfterLogicalExpiry === 0
      );
      passed++;
    } catch { failed++; }

    // ── Scenario C: sweep transitions a non-active reservation's expired hold ─
    // The defense-in-depth guard skips holds for CONFIRMED/ARRIVED/SEATED
    // reservations. To test that the sweep DOES work for other statuses,
    // update the reservation to PENDING_APPROVAL (simulating a timed-out request
    // that the host never acted on) before calling expireStaleHolds.
    console.log("\nScenario C — sweep finalises expired hold for non-active reservation:");

    await prisma.reservation.update({
      where: { id: reservation.id },
      data:  { status: "PENDING_APPROVAL" },
    });

    await expireStaleHolds();

    const holdAfterExpiry = await prisma.capacityHold.findUnique({
      where: { id: futureHold.id },
    });
    try {
      await assert(
        "expireStaleHolds transitions hold with past expiresAt to EXPIRED status (PENDING_APPROVAL reservation)",
        holdAfterExpiry?.status === "EXPIRED"
      );
      passed++;
    } catch { failed++; }

    const heldAfterSweep = await getHeldCovers(SPACE_ID, futureStart, futureEnd);
    try {
      await assert(
        "getHeldCovers returns 0 for the now-EXPIRED hold",
        heldAfterSweep === 0
      );
      passed++;
    } catch { failed++; }

    // Restore status for cleanup
    await prisma.reservation.update({
      where: { id: reservation.id },
      data:  { status: "CONFIRMED" },
    });

  } finally {
    // ── Teardown ─────────────────────────────────────────────────────────────
    await prisma.capacityHold.deleteMany({ where: { reservationId: reservation.id } });
    await prisma.reservation.delete({ where: { id: reservation.id } });
    await prisma.resGuestProfile.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
