/**
 * Regression test: transitionStatus acceptance path ignores expired-but-ACTIVE holds.
 *
 * A host accepting a PENDING_APPROVAL reservation should NOT be blocked by a
 * competing CapacityHold whose expiresAt has passed — even if the background
 * sweep has not yet transitioned it to EXPIRED.
 *
 * With the `expiresAt: { gt: new Date() }` filter on the competing-holds query
 * in transitionStatus, the logically-expired hold must be excluded and the
 * acceptance must succeed.
 *
 * Run with:
 *   npx tsx src/server/host/__tests__/transitionStatus.expiredHold.test.ts
 */

import { PrismaClient } from "@prisma/client";
import { transitionStatus } from "../hostService";

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
  const HOST_ID  = "system:test-expiry-acceptance";
  const TS       = Date.now();
  const EMAIL    = `expiry-accept-${TS}@test.internal`;

  const now = new Date();
  // Reservation window: tomorrow 8pm → 10pm
  const start   = new Date(now.getTime() + 24 * 60 * 60_000);
  start.setHours(20, 0, 0, 0);
  const end     = new Date(start.getTime() + 2 * 60 * 60_000);

  // ── Seed prerequisite records ────────────────────────────────────────────
  const venue = await prisma.venue.findFirst({ where: { slug: "gold-house" } });
  if (!venue) throw new Error("Venue 'gold-house' not found — run the seed first");

  const guest = await prisma.resGuestProfile.create({
    data: { fullName: "Acceptance Expiry Test", email: EMAIL },
  });

  // The reservation under test — PENDING_APPROVAL with the approval space.
  // No assignedSpaceId: this triggers the isPendingApprovalPromotion path in
  // transitionStatus which runs the hard 409 capacity check.
  const reservation = await prisma.reservation.create({
    data: {
      venueId:         venue.id,
      guestProfileId:  guest.id,
      source:          "QR_CODE",
      status:          "PENDING_APPROVAL",
      reservationDate: start,
      partySize:       2,
      conceptRequested: "TERRACE",
      contactName:     "Acceptance Expiry Test",
      contactEmail:    EMAIL,
      confirmationCode: `EXPACCEPT${TS}`,
      requestedSpaceId: SPACE_ID,  // no assignedSpaceId — triggers promotion path
    },
  });

  // A competing hold that is logically expired (expiresAt in the past) but the
  // sweep has not yet run — status still ACTIVE. Without the expiresAt filter
  // this hold would fill the space and cause transitionStatus to throw 409.
  const space = await prisma.restaurantSpace.findUnique({
    where: { id: SPACE_ID },
    select: { capacity: true },
  });
  if (!space) throw new Error(`Space ${SPACE_ID} not found`);

  // Create a "ghost" reservation so the competing hold satisfies the FK
  const ghostGuest = await prisma.resGuestProfile.create({
    data: { fullName: "Ghost Expiry", email: `ghost-expiry-${TS}@test.internal` },
  });
  const ghostReservation = await prisma.reservation.create({
    data: {
      venueId:         venue.id,
      guestProfileId:  ghostGuest.id,
      source:          "QR_CODE",
      status:          "CONFIRMED",
      reservationDate: start,
      partySize:       space.capacity, // fills the whole space
      conceptRequested: "TERRACE",
      contactName:     "Ghost",
      contactEmail:    `ghost-expiry-${TS}@test.internal`,
      confirmationCode: `GHOST${TS}`,
      assignedSpaceId: SPACE_ID,
    },
  });
  const expiredHold = await prisma.capacityHold.create({
    data: {
      spaceId:       SPACE_ID,
      reservationId: ghostReservation.id,
      startAt:       start,
      endAt:         end,
      partySize:     space.capacity,
      status:        "ACTIVE",
      expiresAt:     new Date(now.getTime() - 5 * 60_000), // 5 min in the past
    },
  });

  let passed = 0;
  let failed = 0;

  try {
    // ── The acceptance must NOT be blocked by the expired hold ───────────────
    let acceptError: Error | null = null;
    try {
      await transitionStatus(reservation.id, "CONFIRMED", HOST_ID, {
        reservationDate: start.toISOString(), tableLabel: "T1",
      });
    } catch (err: any) {
      acceptError = err;
    }

    try {
      await assert(
        "transitionStatus CONFIRMED succeeds despite expired-but-ACTIVE competing hold",
        acceptError === null
      );
      passed++;
    } catch { failed++; }

    if (acceptError === null) {
      const confirmed = await prisma.reservation.findUnique({
        where: { id: reservation.id },
        select: { status: true },
      });
      try {
        await assert(
          "reservation status is CONFIRMED after acceptance",
          confirmed?.status === "CONFIRMED"
        );
        passed++;
      } catch { failed++; }
    }

    // ── Verify: real non-expired competing hold IS still blocking ────────────
    // Create a second reservation (same space, same time) and try to accept it.
    // The confirmed reservation above now has an ACTIVE, non-expired hold.
    const blockGuest = await prisma.resGuestProfile.create({
      data: { fullName: "Block Test", email: `block-${TS}@test.internal` },
    });
    const blockedReservation = await prisma.reservation.create({
      data: {
        venueId:         venue.id,
        guestProfileId:  blockGuest.id,
        source:          "QR_CODE",
        status:          "PENDING_APPROVAL",
        reservationDate: start,
        partySize:       space.capacity, // fills the whole space → over available
        conceptRequested: "TERRACE",
        contactName:     "Block Test",
        contactEmail:    `block-${TS}@test.internal`,
        confirmationCode: `BLOCK${TS}`,
        requestedSpaceId: SPACE_ID, // no assignedSpaceId — triggers the hard 409 path
      },
    });

    let blockError: Error | null = null;
    try {
      await transitionStatus(blockedReservation.id, "CONFIRMED", HOST_ID, {
        reservationDate: start.toISOString(), tableLabel: "T1",
      });
    } catch (err: any) {
      blockError = err;
    }

    try {
      await assert(
        "transitionStatus CONFIRMED is blocked by a real non-expired competing hold",
        blockError !== null && ((blockError as any).status === 409 || /capacity/i.test(blockError.message))
      );
      passed++;
    } catch { failed++; }

    // Cleanup blocked reservation
    await prisma.capacityHold.deleteMany({ where: { reservationId: blockedReservation.id } });
    await prisma.reservation.delete({ where: { id: blockedReservation.id } });
    await prisma.resGuestProfile.delete({ where: { id: blockGuest.id } });

  } finally {
    // ── Teardown ─────────────────────────────────────────────────────────────
    await prisma.capacityHold.deleteMany({ where: { reservationId: { in: [reservation.id, ghostReservation.id] } } });
    await prisma.capacityHold.delete({ where: { id: expiredHold.id } }).catch(() => null);
    await prisma.reservation.deleteMany({ where: { id: { in: [reservation.id, ghostReservation.id] } } });
    await prisma.resGuestProfile.deleteMany({ where: { id: { in: [guest.id, ghostGuest.id] } } });
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
