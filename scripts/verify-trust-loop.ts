import { prisma } from "../src/lib/prisma";
import { resolveMatch, persistMatchResult } from "../src/server/services/invu/invuMatchService";

const VENUE_ID = "cmnzey7j400n8fnj08v4srg95";
const SUPERADMIN_ID = "cmnzey67v0000fnj0mz8j026b";
const REFERRAL_CODE = "REF-BORA";
const TARGET_INVU_ORDER_ID = "2429";

async function main() {
  console.log("\n========== TRUST LOOP VERIFICATION ==========\n");

  console.log("[1/5] Placing referred booking via REF-BORA…");
  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:5000";
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(20, 30, 0, 0);
  const res = await fetch(`${baseUrl}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conceptKey: "gold-house",
      reservationDate: tomorrow.toISOString(),
      partySize: 2,
      occasion: "Trust loop verification",
      seatingPreference: "INDOOR",
      notes: "TRUST_LOOP_TEST",
      addons: [],
      contactName: "Trust Loop Test",
      contactEmail: "trust-loop@test.local",
      contactPhone: "+1-555-0199",
      referralCode: REFERRAL_CODE,
    }),
  });
  if (!res.ok) {
    console.error("  Booking failed:", res.status, await res.text());
    process.exit(1);
  }
  const booking = await res.json();
  const reservationId: string = booking.reservationId;
  if (!reservationId) throw new Error(`No reservationId in response: ${JSON.stringify(booking)}`);
  console.log(`  reservationId: ${reservationId}`);

  const session = await prisma.attributionSession.findUnique({
    where: { reservationId },
    include: {
      referralActor: { select: { id: true, displayName: true, actorType: true } },
    },
  });
  if (!session) throw new Error("AttributionSession not created");
  console.log(`  AttributionSession: ${session.id}`);
  console.log(`    bookingCode: ${session.bookingCode}`);
  console.log(`    source:      ${session.source}`);
  console.log(`    status:      ${session.status}`);
  console.log(`    referrer:    ${session.referralActor?.displayName} (${session.referralActor?.actorType})`);

  console.log("\n[2/5] Inserting OperationalBinding (host's manual bind to INVU 2429)…");
  const binding = await prisma.operationalBinding.create({
    data: {
      attributionSessionId: session.id,
      invuOrderId: TARGET_INVU_ORDER_ID,
      bindingType: "TABLE_OPEN_BINDING",
      boundByUserId: SUPERADMIN_ID,
      supportingDataJson: { test: "TRUST_LOOP_VERIFICATION", boundAt: new Date().toISOString() },
    },
  });
  await prisma.attributionSession.update({
    where: { id: session.id },
    data: {
      status: "POS_BIND_INTENT_RECORDED",
      invuOrderId: TARGET_INVU_ORDER_ID,
      boundAt: new Date(),
      bindMethod: "MANUAL_HOST_BIND",
    },
  });
  console.log(`  OperationalBinding: ${binding.id} (boundBy=${SUPERADMIN_ID})`);

  console.log("\n[3/5] Looking up the existing InvuOrderNormalized row INVU returned for 2429…");
  const normalized = await prisma.invuOrderNormalized.findFirst({
    where: { invuOrderId: TARGET_INVU_ORDER_ID, venueId: VENUE_ID },
  });
  if (!normalized) throw new Error(`No InvuOrderNormalized for ${TARGET_INVU_ORDER_ID}`);
  console.log(`  InvuOrderNormalized: ${normalized.id}`);
  console.log(`    publicOrderNumber: ${normalized.publicOrderNumber}`);
  console.log(`    customerName:      ${normalized.customerName ?? "(NULL — INVU did not send)"}`);
  console.log(`    guestCount:        ${normalized.guestCount ?? "(NULL — INVU did not send)"}`);
  console.log(`    tableLabel:        ${normalized.tableLabel}`);
  console.log(`    openedAt:          ${normalized.openedAt?.toISOString()}`);
  console.log(`    closedAt:          ${normalized.closedAt?.toISOString()}`);
  console.log(`    netRevenueCents:   ${normalized.netRevenueCents} (${(normalized.netRevenueCents / 100).toFixed(2)} ${normalized.currency})`);
  console.log(`    externalReference: ${normalized.externalReference ?? "(NULL — vendor write off)"}`);
  console.log(`    bookingCodeRef:    ${normalized.bookingCodeRef ?? "(NULL — vendor write off)"}`);

  console.log("\n[4/5] Running 3-tier matcher on the normalized row…");
  const matchResult = await resolveMatch(normalized, []);
  console.log(`  tier:                ${matchResult.tier}`);
  console.log(`  status:              ${matchResult.status}`);
  console.log(`  confidence:          ${matchResult.confidence}`);
  console.log(`  trustScore:          ${matchResult.trustScore}`);
  console.log(`  attributionSessionId resolved: ${matchResult.attributionSessionId}`);
  console.log(`  reservationId resolved:        ${matchResult.reservationId}`);
  console.log(`  proof.matchProofType: ${matchResult.proof?.matchProofType}`);
  console.log(`  proof.sourceField:    ${matchResult.proof?.sourceField}`);
  console.log(`  proof.sourceValue:    ${matchResult.proof?.sourceValue}`);

  await persistMatchResult({
    invuOrderNormalizedId: normalized.id,
    invuOrderId: normalized.invuOrderId,
    result: matchResult,
    performedByUserId: SUPERADMIN_ID,
  });

  console.log("\n[5/5] Joined view — what the auditor would see for commission approval");
  const final = await prisma.attributionSession.findUnique({
    where: { id: session.id },
    include: {
      referralActor: { select: { displayName: true, actorType: true } },
      reservation: { select: { contactName: true, partySize: true, reservationDate: true } },
      tableSession: { select: { id: true, matchStatus: true, commissionEligibility: true } },
    },
  });
  const proofs = await prisma.matchProof.findMany({
    where: { attributionSessionId: session.id },
    orderBy: { createdAt: "desc" },
  });
  console.log("  AttributionSession:");
  console.log(`    bookingCode:  ${final?.bookingCode}`);
  console.log(`    status:       ${final?.status}`);
  console.log(`    referrer:     ${final?.referralActor?.displayName} (${final?.referralActor?.actorType})`);
  console.log(`    customer:     ${final?.reservation?.contactName} party of ${final?.reservation?.partySize}`);
  console.log(`    bookedFor:    ${final?.reservation?.reservationDate?.toISOString()}`);
  console.log(`    invuOrderId:  ${final?.invuOrderId}`);
  console.log(`    boundAt:      ${final?.boundAt?.toISOString()}`);
  console.log("  TableSession:");
  console.log(`    matchStatus:           ${final?.tableSession?.matchStatus}`);
  console.log(`    commissionEligibility: ${final?.tableSession?.commissionEligibility}`);
  console.log(`  MatchProofs (${proofs.length}):`);
  for (const p of proofs) {
    console.log(`    - ${p.matchTier} via ${p.sourceField} value="${p.sourceValue}" confidence=${p.confidence}`);
  }

  console.log("\nKeeping rows so you can inspect. To clean up, run with --cleanup.");

  if (process.argv.includes("--cleanup")) {
    console.log("\n[cleanup]");
    await prisma.matchProof.deleteMany({ where: { attributionSessionId: session.id } });
    await prisma.tableSession.updateMany({
      where: { attributionSessionId: session.id },
      data: { invuOrderNormalizedId: null, matchStatus: "UNMATCHED", commissionEligibility: "NOT_ELIGIBLE" },
    });
    await prisma.invuOrderNormalized.update({ where: { id: normalized.id }, data: { tableSessionId: null } });
    await prisma.operationalBinding.delete({ where: { id: binding.id } });
    await prisma.tableSession.deleteMany({ where: { attributionSessionId: session.id } });
    await prisma.attributionSession.delete({ where: { id: session.id } });
    if (reservationId) {
      await prisma.reservationAttribution.deleteMany({ where: { reservationId } });
      await prisma.reservation.delete({ where: { id: reservationId } });
    }
    console.log("  cleaned.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
