/**
 * End-to-end pre-production smoke for the Payout Verification Layer.
 *
 * Exercises every state transition, every terminal-state guard, every
 * integrity-failure path, and verifies the deterministic export hash is
 * reproducible from the persisted payload.
 *
 * Run: npx tsx scripts/payout-e2e-smoke.ts
 */

import { prisma } from "../src/lib/prisma";
import {
  createDraft,
  submitForApproval,
  approve,
  reject,
  markExported,
  discardDraft,
  revalidateBatchIntegrity,
  buildExportPayload,
  hashExportPayload,
} from "../src/server/payouts/payoutBatchService";
import { createHash } from "node:crypto";

let pass = 0;
let fail = 0;
const log = (label: string, ok: boolean, detail = "") => {
  const tag = ok ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

async function expectThrows(label: string, fn: () => Promise<unknown>, mustContain?: string) {
  try {
    await fn();
    log(label, false, "expected throw, got success");
  } catch (e) {
    const msg = (e as Error).message;
    if (mustContain && !msg.includes(mustContain)) {
      log(label, false, `wrong error: ${msg}`);
    } else {
      log(label, true, msg.slice(0, 80));
    }
  }
}

async function main() {
  console.log("\n=== Payout E2E Smoke ===\n");

  // ── Setup: pick two distinct admin users (maker/checker) and clear any
  //          smoke leftovers from a previous run.
  const admins = await prisma.user.findMany({
    where: { roles: { some: { roleKey: { in: ["SUPERADMIN", "ADMIN_COMMERCIAL"] } } } },
    select: { id: true, email: true },
    take: 2,
  });
  if (admins.length < 2) {
    console.log("Need at least 2 admin users; aborting.");
    process.exit(1);
  }
  const maker = admins[0];
  const checker = admins[1];
  console.log(`Maker: ${maker.email}\nChecker: ${checker.email}\n`);

  // Clean up any prior smoke batches to keep runs idempotent.
  const stale = await prisma.payoutBatch.findMany({
    where: { name: { startsWith: "SMOKE-" } },
    select: { id: true },
  });
  for (const s of stale) {
    await prisma.ledgerEntry.updateMany({
      where: { payoutBatchId: s.id }, data: { payoutBatchId: null },
    });
    await prisma.auditLog.deleteMany({
      where: { action: { startsWith: "PAYOUT_BATCH_" }, metadata: { path: ["payoutBatchId"], equals: s.id } },
    });
    await prisma.payoutBatch.delete({ where: { id: s.id } });
  }

  // ── Find some eligible commission lines.
  const eligible = await prisma.ledgerEntry.findMany({
    where: { type: "COMMISSION_EARNED", payoutBatchId: null },
    select: { id: true, amountCents: true, influencerId: true, currency: true },
    take: 6,
  });
  if (eligible.length < 3) {
    console.log(`Need >= 3 eligible lines; found ${eligible.length}. Aborting.`);
    process.exit(1);
  }
  console.log(`Eligible lines available: ${eligible.length}\n`);

  // ─────────────────────────────────────────────────────────────────────
  // Section 1: Happy path DRAFT → SUBMIT → APPROVE → EXPORT
  // ─────────────────────────────────────────────────────────────────────
  console.log("[1] Happy path");
  const lineIds = eligible.slice(0, 3).map(l => l.id);
  const expectedTotal = eligible.slice(0, 3).reduce((s, l) => s + l.amountCents, 0);

  const { batchId } = await createDraft({
    name: "SMOKE-happy",
    notes: "smoke",
    from: new Date(Date.now() - 90 * 86400_000),
    to: new Date(),
    ledgerEntryIds: lineIds,
    createdById: maker.id,
  });
  log("createDraft returns batchId", !!batchId);

  const draft = await prisma.payoutBatch.findUnique({ where: { id: batchId } });
  log("draft persisted with status=DRAFT", draft?.status === "DRAFT");
  log("draft totalCents matches input", draft?.totalCents === expectedTotal,
      `stored ${draft?.totalCents} vs ${expectedTotal}`);
  log("draft lineCount = 3", draft?.lineCount === 3);

  await submitForApproval({ batchId, userId: maker.id });
  const submitted = await prisma.payoutBatch.findUnique({ where: { id: batchId } });
  log("submit → PENDING_APPROVAL", submitted?.status === "PENDING_APPROVAL");
  log("submittedById recorded", submitted?.submittedById === maker.id);

  await approve({ batchId, userId: checker.id });
  const approved = await prisma.payoutBatch.findUnique({ where: { id: batchId } });
  log("approve (different user) → APPROVED", approved?.status === "APPROVED");
  log("approvedById recorded", approved?.approvedById === checker.id);

  // Use NACHA_US to prove the registry-validated format string is
  // accepted by the state machine even when its renderer is a stub.
  await markExported({ batchId, userId: checker.id, format: "NACHA_US" });
  const exported = await prisma.payoutBatch.findUnique({ where: { id: batchId } });
  log("export → EXPORTED", exported?.status === "EXPORTED");
  log("exportFileHash persisted", !!exported?.exportFileHash,
      exported?.exportFileHash?.slice(0, 16));
  log("exportPayload persisted", !!exported?.exportPayload);

  // Verify hash is deterministic + reproducible from the persisted payload.
  if (exported?.exportPayload && exported?.exportFileHash) {
    const recomputed = createHash("sha256").update(exported.exportPayload).digest("hex");
    log("hash matches recomputed SHA-256 of stored payload",
        recomputed === exported.exportFileHash);
    const parsed = JSON.parse(exported.exportPayload);
    log("payload has recipients[]", Array.isArray(parsed.recipients) && parsed.recipients.length > 0);
    log("payload totalCents matches batch", parsed.totalCents === exported.totalCents);
    log("payload recipients sorted by influencerId", (() => {
      const ids = parsed.recipients.map((r: { influencerId: string }) => r.influencerId);
      return ids.every((id: string, i: number) => i === 0 || ids[i - 1].localeCompare(id) <= 0);
    })());
    log("payload includes audit trace fields",
        !!parsed.approvedById && !!parsed.submittedById && !!parsed.exportedById);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Section 2: Terminal-state guards on EXPORTED batch
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n[2] Terminal state: EXPORTED batch refuses all transitions");
  await expectThrows("submit on EXPORTED rejected",
    () => submitForApproval({ batchId, userId: maker.id }), "Cannot submit");
  await expectThrows("approve on EXPORTED rejected",
    () => approve({ batchId, userId: checker.id }), "Cannot approve");
  await expectThrows("reject on EXPORTED rejected",
    () => reject({ batchId, userId: checker.id, reason: "x" }), "Cannot reject");
  await expectThrows("export on EXPORTED rejected",
    () => markExported({ batchId, userId: checker.id, format: "NACHA_US" }), "must be APPROVED");
  await expectThrows("discard on EXPORTED rejected",
    () => discardDraft({ batchId, userId: maker.id }), "Can only discard DRAFT");

  // ─────────────────────────────────────────────────────────────────────
  // Section 3: Maker/checker enforcement
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n[3] Maker/checker enforcement");
  const lineIds2 = eligible.slice(3, 5).map(l => l.id);
  if (lineIds2.length === 2) {
    const { batchId: b2 } = await createDraft({
      name: "SMOKE-makerchecker",
      from: new Date(Date.now() - 90 * 86400_000),
      to: new Date(),
      ledgerEntryIds: lineIds2,
      createdById: maker.id,
    });
    await submitForApproval({ batchId: b2, userId: maker.id });
    await expectThrows("same-user approve refused",
      () => approve({ batchId: b2, userId: maker.id }), "Maker/checker");
    await reject({ batchId: b2, userId: checker.id, reason: "smoke cleanup" });
    const rejected = await prisma.payoutBatch.findUnique({ where: { id: b2 } });
    log("reject → REJECTED", rejected?.status === "REJECTED");
    log("rejected batch retains forensics (lineCount/totalCents)",
        rejected?.lineCount === 2 && rejected?.totalCents > 0);
    const releasedLines = await prisma.ledgerEntry.count({
      where: { id: { in: lineIds2 }, payoutBatchId: b2 },
    });
    log("rejected batch released its lines", releasedLines === 0);

    // Terminal: REJECTED can't be approved/exported/re-submitted.
    await expectThrows("approve on REJECTED rejected",
      () => approve({ batchId: b2, userId: checker.id }), "Cannot approve");
    await expectThrows("export on REJECTED rejected",
      () => markExported({ batchId: b2, userId: checker.id, format: "NACHA_US" }), "must be APPROVED");
    await expectThrows("submit on REJECTED rejected",
      () => submitForApproval({ batchId: b2, userId: maker.id }), "Cannot submit");
  }

  // ─────────────────────────────────────────────────────────────────────
  // Section 4: Integrity revalidation catches drift
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n[4] Integrity revalidation");
  const lineIds3 = eligible.slice(5, 6).map(l => l.id);
  if (lineIds3.length === 1) {
    const { batchId: b3 } = await createDraft({
      name: "SMOKE-integrity",
      from: new Date(Date.now() - 90 * 86400_000),
      to: new Date(),
      ledgerEntryIds: lineIds3,
      createdById: maker.id,
    });
    await submitForApproval({ batchId: b3, userId: maker.id });

    // Tamper: forcibly detach the line behind the service's back, simulating
    // a rogue migration. The integrity check should catch the drift.
    await prisma.ledgerEntry.updateMany({
      where: { id: { in: lineIds3 } }, data: { payoutBatchId: null },
    });
    const integrity = await revalidateBatchIntegrity(b3);
    log("integrity check detects line-count drift", !integrity.ok,
        integrity.driftReasons[0]?.slice(0, 60));
    await expectThrows("approve refused after tampering",
      () => approve({ batchId: b3, userId: checker.id }),
      "Integrity check failed");

    // Cleanup: re-attach + reject so the lines are released cleanly.
    await prisma.ledgerEntry.updateMany({
      where: { id: { in: lineIds3 } }, data: { payoutBatchId: b3 },
    });
    await reject({ batchId: b3, userId: checker.id, reason: "smoke cleanup" });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Section 5: Audit trail completeness
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n[5] Audit trail");
  const auditRows = await prisma.auditLog.findMany({
    where: {
      action: { startsWith: "PAYOUT_BATCH_" },
      metadata: { path: ["payoutBatchId"], equals: batchId },
    },
    orderBy: { createdAt: "asc" },
    select: { action: true, actorId: true },
  });
  const actions = auditRows.map(a => a.action);
  log("audit chain CREATE→SUBMIT→APPROVE→EXPORT recorded",
    actions.includes("PAYOUT_BATCH_CREATE_DRAFT") &&
    actions.includes("PAYOUT_BATCH_SUBMIT") &&
    actions.includes("PAYOUT_BATCH_APPROVE") &&
    actions.includes("PAYOUT_BATCH_EXPORT"),
    actions.join(" → "));

  // ─────────────────────────────────────────────────────────────────────
  // Section 6: Determinism — rebuild payload, hash should match
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n[6] Export determinism");
  // Note: rebuilding includes a fresh exportedAt timestamp, so the *full*
  // hash will differ. We instead verify the recipient/total/audit-trace
  // sub-payload (the bank-relevant content) is byte-identical.
  const fresh = await buildExportPayload(batchId, checker.id, "NACHA_US");
  const persisted = JSON.parse(exported!.exportPayload!);
  const stripped = (p: typeof fresh) => JSON.stringify({
    batchId: p.batchId,
    currency: p.currency,
    totalCents: p.totalCents,
    recipientCount: p.recipientCount,
    recipients: p.recipients,
    submittedById: p.submittedById,
    approvedById: p.approvedById,
  });
  log("recipient + total payload is deterministic on rebuild",
      stripped(fresh) === stripped(persisted));

  // ─────────────────────────────────────────────────────────────────────
  // Section 7: Bank-agnostic export-format registry boundary tests
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n[7] Export format registry");

  // 7a: legacy "NACHA" string normalises to "NACHA_US" through the
  //     service boundary (proves the on-the-wire compat layer works
  //     end-to-end, not just at the helper level).
  const eligibleForFormatTest = await prisma.ledgerEntry.findMany({
    where: { type: "COMMISSION_EARNED", payoutBatchId: null },
    select: { id: true },
    take: 1,
  });
  if (eligibleForFormatTest.length === 1) {
    const { batchId: bFmt } = await createDraft({
      name: "SMOKE-format-legacy",
      from: new Date(Date.now() - 90 * 86400_000),
      to: new Date(),
      ledgerEntryIds: eligibleForFormatTest.map(l => l.id),
      createdById: maker.id,
    });
    await submitForApproval({ batchId: bFmt, userId: maker.id });
    await approve({ batchId: bFmt, userId: checker.id });
    await markExported({ batchId: bFmt, userId: checker.id, format: "NACHA" });
    const persistedFmt = await prisma.payoutBatch.findUnique({
      where: { id: bFmt }, select: { exportFormat: true, status: true },
    });
    log("legacy 'NACHA' normalised to 'NACHA_US' on persist",
        persistedFmt?.exportFormat === "NACHA_US",
        `stored: ${persistedFmt?.exportFormat}`);
    log("legacy-format batch still reaches EXPORTED",
        persistedFmt?.status === "EXPORTED");
  }

  // 7b: unsupported format rejected at the service boundary.
  const eligibleForReject = await prisma.ledgerEntry.findMany({
    where: { type: "COMMISSION_EARNED", payoutBatchId: null },
    select: { id: true },
    take: 1,
  });
  if (eligibleForReject.length === 1) {
    const { batchId: bBad } = await createDraft({
      name: "SMOKE-format-bad",
      from: new Date(Date.now() - 90 * 86400_000),
      to: new Date(),
      ledgerEntryIds: eligibleForReject.map(l => l.id),
      createdById: maker.id,
    });
    await submitForApproval({ batchId: bBad, userId: maker.id });
    await approve({ batchId: bBad, userId: checker.id });
    await expectThrows("unsupported format rejected by markExported",
      () => markExported({ batchId: bBad, userId: checker.id, format: "ZELLE_INSTANT" }),
      "Unsupported payout export format");
    // Cleanup so reruns stay idempotent.
    const stillApproved = await prisma.payoutBatch.findUnique({
      where: { id: bBad }, select: { status: true },
    });
    log("rejected-format batch stayed APPROVED (no partial transition)",
        stillApproved?.status === "APPROVED");
    // Clean up by exporting with a real format, then leaving it as
    // historical data alongside the other smoke batches.
    await markExported({ batchId: bBad, userId: checker.id, format: "CSV_GENERIC" });
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===\n`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async e => {
  console.error("\nFATAL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
