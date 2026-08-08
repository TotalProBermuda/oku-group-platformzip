/**
 * Regression tests: PENDING_APPROVAL → CONFIRMED host-accept path in transitionStatus.
 *
 * These tests call transitionStatus() directly (bypassing the HTTP layer) so they
 * cover the critical business invariants atomically — no auth setup required.
 *
 * Scenarios covered:
 *   1. Happy path: PENDING_APPROVAL + requestedSpaceId → CONFIRMED, assignedSpaceId
 *      promoted, ACTIVE CapacityHold created.
 *   2. Capacity exhausted: PENDING_APPROVAL accept throws 409 and rolls back — no
 *      CONFIRMED reservation or CapacityHold written.
 *   3. No requestedSpaceId: PENDING_APPROVAL → CONFIRMED with no space info doesn't
 *      create a hold.
 *
 * Run with: npx tsx src/server/host/__tests__/transitionStatus.pendingApproval.test.ts
 */

import { PrismaClient } from "@prisma/client";
import { transitionStatus } from "../hostService";

const prisma = new PrismaClient();

// ── Test helpers ──────────────────────────────────────────────────────────────

async function setup(opts: {
  partySize: number;
  reservationDate: Date;
  requestedSpaceId?: string;
}) {
  const venue = await prisma.venue.findFirstOrThrow({ where: { slug: "gold-house" }, select: { id: true } });
  const ts = Date.now();
  const gp = await prisma.resGuestProfile.create({
    data: { fullName: "PA-Test", email: `pa-test-${ts}@ex.com` },
  });
  const res = await prisma.reservation.create({
    data: {
      venueId: venue.id,
      guestProfileId: gp.id,
      source: "QR_CODE",
      status: "PENDING_APPROVAL",
      reservationDate: opts.reservationDate,
      partySize: opts.partySize,
      conceptRequested: "TERRACE",
      contactName: "PA-Test",
      contactEmail: gp.email,
      confirmationCode: `PA-${ts}`,
      requestedSpaceId: opts.requestedSpaceId ?? null,
    },
  });
  return { venueId: venue.id, gpId: gp.id, resId: res.id };
}

async function cleanup(ids: { resId: string; gpId: string; floodResId?: string; floodGpId?: string }) {
  // Remove capacity holds first (FK constraint)
  await prisma.capacityHold.deleteMany({ where: { reservationId: { in: [ids.resId, ids.floodResId].filter(Boolean) as string[] } } });
  await prisma.reservationStatusLog.deleteMany({ where: { reservationId: ids.resId } });
  await prisma.reservation.deleteMany({ where: { id: { in: [ids.resId, ids.floodResId].filter(Boolean) as string[] } } });
  await prisma.resGuestProfile.deleteMany({ where: { id: { in: [ids.gpId, ids.floodGpId].filter(Boolean) as string[] } } });
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ── Scenario 1: Happy-path PENDING_APPROVAL acceptance ───────────────────────

async function test_pendingApproval_accept_happyPath() {
  const reservationDate = new Date("2026-09-01T20:00:00.000Z");
  const ids = await setup({ partySize: 2, reservationDate, requestedSpaceId: "test-space-approval" });
  try {
    const result = await transitionStatus(ids.resId, "CONFIRMED", "system:test");
    assert(result.status === "CONFIRMED", `status should be CONFIRMED, got ${result.status}`);
    assert(result.assignedSpaceId === "test-space-approval",
      `assignedSpaceId should be promoted from requestedSpaceId, got ${result.assignedSpaceId}`);

    const hold = await prisma.capacityHold.findFirst({
      where: { reservationId: ids.resId },
      select: { status: true, partySize: true, spaceId: true },
    });
    assert(hold !== null, "CapacityHold should exist after PENDING_APPROVAL acceptance");
    assert(hold!.status === "ACTIVE", `CapacityHold.status should be ACTIVE, got ${hold!.status}`);
    assert(hold!.spaceId === "test-space-approval", `CapacityHold.spaceId should match, got ${hold!.spaceId}`);
    assert(hold!.partySize === 2, `CapacityHold.partySize should be 2, got ${hold!.partySize}`);

    console.log("✓ test_pendingApproval_accept_happyPath PASSED");
  } finally {
    await cleanup(ids);
  }
}

// ── Scenario 2: Capacity exhausted — accept must throw 409 and roll back ─────

async function test_pendingApproval_accept_capacityExhausted() {
  const reservationDate = new Date("2026-09-02T20:00:00.000Z");
  const endAt = new Date(reservationDate.getTime() + 120 * 60_000);
  const ids = await setup({ partySize: 2, reservationDate, requestedSpaceId: "test-space-approval" });

  // Create a "flood" reservation + hold that fills the space entirely
  const venue = await prisma.venue.findFirstOrThrow({ where: { slug: "gold-house" }, select: { id: true } });
  const ts = Date.now();
  const floodGp = await prisma.resGuestProfile.create({
    data: { fullName: "Flood", email: `flood-${ts}@ex.com` },
  });
  const floodRes = await prisma.reservation.create({
    data: {
      venueId: venue.id, guestProfileId: floodGp.id, source: "QR_CODE", status: "CONFIRMED",
      reservationDate, partySize: 999, conceptRequested: "TERRACE",
      contactName: "Flood", contactEmail: floodGp.email, confirmationCode: `FL-${ts}`,
    },
  });
  await prisma.capacityHold.create({
    data: { spaceId: "test-space-approval", reservationId: floodRes.id, startAt: reservationDate, endAt, partySize: 999, status: "ACTIVE", expiresAt: endAt },
  });

  try {
    let threw409 = false;
    try {
      await transitionStatus(ids.resId, "CONFIRMED", "system:test");
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      assert(err.status === 409, `Expected status 409, got ${err.status}: ${err.message}`);
      threw409 = true;
    }
    assert(threw409, "transitionStatus should throw 409 when space is exhausted");

    // Reservation must remain PENDING_APPROVAL (transaction rolled back)
    const after = await prisma.reservation.findUniqueOrThrow({ where: { id: ids.resId }, select: { status: true, assignedSpaceId: true } });
    assert(after.status === "PENDING_APPROVAL", `Reservation should still be PENDING_APPROVAL, got ${after.status}`);
    assert(after.assignedSpaceId === null, `assignedSpaceId should still be null, got ${after.assignedSpaceId}`);

    // No CapacityHold should have been created for the target reservation
    const hold = await prisma.capacityHold.findFirst({ where: { reservationId: ids.resId } });
    assert(hold === null, "No CapacityHold should exist after a rolled-back acceptance");

    console.log("✓ test_pendingApproval_accept_capacityExhausted PASSED");
  } finally {
    await cleanup({ ...ids, floodResId: floodRes.id, floodGpId: floodGp.id });
  }
}

// ── Scenario 3: No requestedSpaceId — no hold created on acceptance ───────────

async function test_pendingApproval_accept_noSpaceId_noHold() {
  const reservationDate = new Date("2026-09-03T20:00:00.000Z");
  const ids = await setup({ partySize: 2, reservationDate }); // no requestedSpaceId
  try {
    const result = await transitionStatus(ids.resId, "CONFIRMED", "system:test");
    assert(result.status === "CONFIRMED", `status should be CONFIRMED, got ${result.status}`);
    assert(result.assignedSpaceId === null, `No space: assignedSpaceId should remain null`);

    const hold = await prisma.capacityHold.findFirst({ where: { reservationId: ids.resId } });
    assert(hold === null, "No CapacityHold should be created when there is no requestedSpaceId");

    console.log("✓ test_pendingApproval_accept_noSpaceId_noHold PASSED");
  } finally {
    await cleanup(ids);
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log("Running PENDING_APPROVAL acceptance regression tests...\n");
  let failed = 0;
  for (const test of [
    test_pendingApproval_accept_happyPath,
    test_pendingApproval_accept_capacityExhausted,
    test_pendingApproval_accept_noSpaceId_noHold,
  ]) {
    try {
      await test();
    } catch (e: unknown) {
      console.error(`✗ ${test.name} FAILED:`, (e as Error).message);
      failed++;
    }
  }
  console.log(`\n${failed === 0 ? "All tests passed ✓" : `${failed} test(s) failed ✗`}`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
})();
