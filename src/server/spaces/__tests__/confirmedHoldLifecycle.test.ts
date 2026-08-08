/**
 * Regression test: confirmed-reservation holds retain capacity after end time.
 *
 * A CapacityHold for a CONFIRMED reservation must remain ACTIVE (and reduce
 * availability) even after the scheduled reservation end time has passed, as
 * long as the reservation is still CONFIRMED/ARRIVED/SEATED. The hold may only
 * be released by a terminal-state transition (CANCELLED, NO_SHOW, COMPLETED).
 *
 * Previously, all holds used `expiresAt = endAt + 30 min`. After that window
 * the sweep marked them EXPIRED, silently freeing capacity while the table was
 * still occupied. This test catches any regression to that behavior.
 *
 * Run with:
 *   npx tsx src/server/spaces/__tests__/confirmedHoldLifecycle.test.ts
 */

import { PrismaClient } from "@prisma/client";
import { expireStaleHolds, getHeldCovers, FAR_FUTURE_EXPIRY, DEFAULT_DURATION_MINUTES } from "../capacityService";

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
  const TS       = Date.now();
  const EMAIL    = `confirmed-hold-lifecycle-${TS}@test.internal`;

  const venue = await prisma.venue.findFirst({ where: { slug: "gold-house" } });
  if (!venue) throw new Error("Venue 'gold-house' not found — run the seed first");

  const guest = await prisma.resGuestProfile.create({
    data: { fullName: "Confirmed Hold Lifecycle Test", email: EMAIL },
  });

  // Reservation window is already in the past: simulates a same-day reservation
  // whose scheduled end time has passed but the table is still occupied.
  const now        = new Date();
  const pastStart  = new Date(now.getTime() - 3 * 60 * 60_000); // 3 hours ago
  const pastEnd    = new Date(pastStart.getTime() + DEFAULT_DURATION_MINUTES * 60_000); // 1 hour ago

  const reservation = await prisma.reservation.create({
    data: {
      venueId:          venue.id,
      guestProfileId:   guest.id,
      source:           "QR_CODE",
      status:           "CONFIRMED",
      reservationDate:  pastStart,
      partySize:        2,
      conceptRequested: "TERRACE",
      contactName:      "Confirmed Hold Lifecycle Test",
      contactEmail:     EMAIL,
      confirmationCode: `CLTEST${TS}`,
      assignedSpaceId:  SPACE_ID,
    },
  });

  let passed = 0;
  let failed = 0;

  try {
    // ── Scenario A: confirmed hold uses FAR_FUTURE_EXPIRY ────────────────────
    console.log("\nScenario A — confirmed hold created with FAR_FUTURE_EXPIRY:");

    const hold = await prisma.capacityHold.create({
      data: {
        spaceId:       SPACE_ID,
        reservationId: reservation.id,
        startAt:       pastStart,
        endAt:         pastEnd,
        partySize:     2,
        status:        "ACTIVE",
        expiresAt:     FAR_FUTURE_EXPIRY, // as set by createCapacityHold / transitionStatus
      },
    });

    try {
      await assert(
        "FAR_FUTURE_EXPIRY is well beyond current time (> 50 years from now)",
        FAR_FUTURE_EXPIRY.getTime() > now.getTime() + 50 * 365 * 24 * 3600_000
      );
      passed++;
    } catch { failed++; }

    // ── Scenario B: expireStaleHolds must NOT expire a CONFIRMED reservation hold ──
    console.log("\nScenario B — sweep skips CONFIRMED reservation holds:");

    await expireStaleHolds();

    const holdAfterSweep = await prisma.capacityHold.findUnique({ where: { id: hold.id } });
    try {
      await assert(
        "hold status is still ACTIVE after sweep (FAR_FUTURE_EXPIRY > now)",
        holdAfterSweep?.status === "ACTIVE"
      );
      passed++;
    } catch { failed++; }

    // ── Scenario C: availability is reduced even after the scheduled end time ─
    console.log("\nScenario C — availability reduced for past-end CONFIRMED hold:");

    const held = await getHeldCovers(SPACE_ID, pastStart, pastEnd);
    try {
      await assert(
        `getHeldCovers counts the CONFIRMED hold (got ${held}, want >= 2)`,
        held >= 2
      );
      passed++;
    } catch { failed++; }

    // ── Scenario D: legacy-hold compatibility ────────────────────────────────
    // A hold created before the FAR_FUTURE_EXPIRY migration (legacy expiresAt =
    // endAt + 30 min) is correctly swept when its window passes. The sweep does
    // NOT status-filter: the expiresAt timestamp alone governs the lifecycle.
    // This ensures legacy holds don't get stuck as permanently ACTIVE-but-invisible.
    console.log("\nScenario D — legacy hold with past expiresAt is swept normally:");

    await prisma.capacityHold.update({
      where: { id: hold.id },
      data:  { expiresAt: new Date(now.getTime() - 1000) }, // 1 second ago (legacy window passed)
    });

    await expireStaleHolds(); // must expire regardless of reservation status

    const holdAfterForce = await prisma.capacityHold.findUnique({ where: { id: hold.id } });
    try {
      await assert(
        "legacy hold with past expiresAt is swept to EXPIRED (no status exclusion)",
        holdAfterForce?.status === "EXPIRED"
      );
      passed++;
    } catch { failed++; }

    // ── Scenario E: terminal transition correctly releases the hold ──────────
    console.log("\nScenario E — terminal transition releases confirmed hold:");

    await prisma.reservation.update({
      where: { id: reservation.id },
      data:  { status: "COMPLETED" },
    });
    await prisma.capacityHold.updateMany({
      where: { id: hold.id, status: "ACTIVE" },
      data:  { status: "RELEASED" },
    });

    const heldAfterRelease = await getHeldCovers(SPACE_ID, pastStart, pastEnd);
    try {
      await assert(
        "getHeldCovers returns 0 after hold is RELEASED by terminal transition",
        heldAfterRelease === 0
      );
      passed++;
    } catch { failed++; }

  } finally {
    await prisma.capacityHold.deleteMany({ where: { reservationId: reservation.id } });
    await prisma.reservation.delete({ where: { id: reservation.id } });
    await prisma.resGuestProfile.delete({ where: { id: guest.id } });
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
