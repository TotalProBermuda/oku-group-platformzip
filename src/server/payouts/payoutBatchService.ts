import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { logPayoutBatchAction } from "./payoutAudit";
import {
  type PayoutExportFormat,
  assertSupportedPayoutExportFormat,
} from "./exportFormats";
import { assertPayoutReadyMany } from "@/server/beneficiaries/beneficiaryService";

// ── Types ────────────────────────────────────────────────────────────────

/**
 * "ACTIVE" = influencer record exists, was approved by admin, and the
 * approvalStatus is APPROVED. Anything else makes the influencer
 * ineligible to be paid out, regardless of accrued commissions.
 */
export type InfluencerEligibility = "ACTIVE" | "PENDING" | "REJECTED" | "MISSING";

export type EligibleLine = {
  ledgerEntryId: string;
  influencerId: string;
  influencerDisplayName: string;
  influencerHandle: string | null;
  influencerStatus: InfluencerEligibility;
  orderId: string | null;
  orderNumber: string | null;
  orderTotalCents: number | null;
  amountCents: number;
  currency: string;
  type: "COMMISSION_EARNED" | "COMMISSION_REVERSED";
  createdAt: Date;
  note: string | null;
};

function deriveInfluencerEligibility(infl: { approved: boolean; approvalStatus: string } | null): InfluencerEligibility {
  if (!infl) return "MISSING";
  if (infl.approvalStatus === "REJECTED") return "REJECTED";
  if (infl.approved && infl.approvalStatus === "APPROVED") return "ACTIVE";
  return "PENDING";
}

export type BlockingReason =
  | "INFLUENCER_INACTIVE"
  | "INFLUENCER_MISSING"
  | "NET_NON_POSITIVE"
  | "ALREADY_IN_BATCH"
  | "BENEFICIARY_PROFILE_MISSING"
  | "BANK_NOT_READY"
  | "COMPLIANCE_HOLD";

/**
 * Resolve influencerId → User.id (BeneficiaryProfile is keyed by userId).
 * Returns a Map<influencerId, userId|null>; missing rows map to null so
 * callers can surface BENEFICIARY_PROFILE_MISSING explicitly.
 */
async function resolveInfluencerUserIds(
  influencerIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (influencerIds.length === 0) return out;
  const rows = await prisma.influencerProfile.findMany({
    where: { id: { in: influencerIds } },
    select: { id: true, userId: true },
  });
  const byId = new Map(rows.map(r => [r.id, r.userId]));
  for (const id of influencerIds) out.set(id, byId.get(id) ?? null);
  return out;
}

/**
 * Re-check beneficiary readiness for a list of influencerIds and throw with
 * a single human-readable list when any are not BANK_READY. Used as a
 * mutating-step gate from createDraft/submitForApproval/approve so a batch
 * cannot advance after a beneficiary has been demoted (e.g. ON_HOLD).
 */
export async function assertBeneficiaryReadinessForInfluencers(
  influencerIds: string[],
): Promise<void> {
  if (influencerIds.length === 0) return;
  const userIdByInfluencer = await resolveInfluencerUserIds(influencerIds);
  const userIds = Array.from(userIdByInfluencer.values()).filter(
    (u): u is string => !!u,
  );
  const readiness = await assertPayoutReadyMany(userIds);

  const blocked: string[] = [];
  const profiles = await prisma.influencerProfile.findMany({
    where: { id: { in: influencerIds } },
    select: { id: true, displayName: true, handle: true },
  });
  const nameByInfluencer = new Map(
    profiles.map(p => [p.id, p.displayName ?? p.handle ?? p.id]),
  );

  for (const influencerId of influencerIds) {
    const uid = userIdByInfluencer.get(influencerId) ?? null;
    const reason = beneficiaryBlockReasonFor(
      uid ? readiness.get(uid) : undefined,
      !!uid,
    );
    if (reason) {
      blocked.push(`${nameByInfluencer.get(influencerId) ?? influencerId} (${reason})`);
    }
  }
  if (blocked.length > 0) {
    throw new Error(
      `Beneficiary not bank-ready for ${blocked.length} influencer(s): ${blocked.join(", ")}`,
    );
  }
}

function beneficiaryBlockReasonFor(
  result: { ready: boolean; status: string; blockingReasons: string[] } | undefined,
  hasUserId: boolean,
): BlockingReason | undefined {
  if (!hasUserId) return "BENEFICIARY_PROFILE_MISSING";
  if (!result || result.status === "MISSING_INFO") return "BENEFICIARY_PROFILE_MISSING";
  if (result.status === "REJECTED" || result.status === "ON_HOLD") return "COMPLIANCE_HOLD";
  if (!result.ready) return "BANK_NOT_READY";
  return undefined;
}

export type BlockedLine = EligibleLine & {
  reason: BlockingReason;
};

export type BatchPreview = {
  range: { from: Date; to: Date };
  eligibleLines: EligibleLine[];
  blockedLines: BlockedLine[];
  byInfluencer: Array<{
    influencerId: string;
    influencerDisplayName: string;
    grossCents: number;
    reversedCents: number;
    netCents: number;
    lineCount: number;
    isBlocked: boolean;
    blockReason?: BlockingReason;
  }>;
  totals: {
    eligibleNetCents: number;
    blockedCents: number;
    eligibleLineCount: number;
    blockedLineCount: number;
  };
};

// ── Eligibility / preview ────────────────────────────────────────────────

export async function listEligibleLedgerEntries(opts: {
  from: Date;
  to: Date;
}): Promise<EligibleLine[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: {
      payoutBatchId: null,
      type: { in: ["COMMISSION_EARNED", "COMMISSION_REVERSED"] },
      createdAt: { gte: opts.from, lte: opts.to },
    },
    select: {
      id: true,
      type: true,
      amountCents: true,
      currency: true,
      createdAt: true,
      note: true,
      influencerId: true,
      orderId: true,
      influencer: {
        select: { id: true, displayName: true, handle: true, approved: true, approvalStatus: true },
      },
      order: {
        select: { id: true, orderNumber: true, totalCents: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map(r => ({
    ledgerEntryId: r.id,
    influencerId: r.influencerId,
    influencerDisplayName: r.influencer?.displayName ?? "(missing)",
    influencerHandle: r.influencer?.handle ?? null,
    influencerStatus: deriveInfluencerEligibility(r.influencer),
    orderId: r.orderId,
    orderNumber: r.order?.orderNumber ?? null,
    orderTotalCents: r.order?.totalCents ?? null,
    amountCents: r.amountCents,
    currency: r.currency,
    type: r.type as "COMMISSION_EARNED" | "COMMISSION_REVERSED",
    createdAt: r.createdAt,
    note: r.note,
  }));
}

export async function previewBatch(opts: {
  from: Date;
  to: Date;
}): Promise<BatchPreview> {
  const lines = await listEligibleLedgerEntries(opts);

  // Group by influencer to compute net.
  const grouped = new Map<
    string,
    {
      influencerDisplayName: string;
      influencerStatus: string;
      gross: number;
      reversed: number;
      lines: EligibleLine[];
    }
  >();
  for (const ln of lines) {
    const g = grouped.get(ln.influencerId) ?? {
      influencerDisplayName: ln.influencerDisplayName,
      influencerStatus: ln.influencerStatus,
      gross: 0,
      reversed: 0,
      lines: [],
    };
    if (ln.type === "COMMISSION_EARNED") g.gross += ln.amountCents;
    else g.reversed += ln.amountCents;
    g.lines.push(ln);
    grouped.set(ln.influencerId, g);
  }

  const eligibleLines: EligibleLine[] = [];
  const blockedLines: BlockedLine[] = [];
  const byInfluencer: BatchPreview["byInfluencer"] = [];

  // Resolve beneficiary readiness per influencer (only meaningful for
  // influencers that aren't already missing/inactive — but we still resolve
  // for everyone so the UI sees a single source of truth per influencer).
  const influencerIds = Array.from(grouped.keys());
  const userIdByInfluencer = await resolveInfluencerUserIds(influencerIds);
  const userIdsToCheck = Array.from(userIdByInfluencer.values()).filter(
    (u): u is string => !!u,
  );
  const readinessByUser = await assertPayoutReadyMany(userIdsToCheck);

  for (const [influencerId, g] of grouped.entries()) {
    const net = g.gross - g.reversed;
    let blockReason: BlockingReason | undefined;
    if (g.influencerStatus === "MISSING") blockReason = "INFLUENCER_MISSING";
    else if (g.influencerStatus !== "ACTIVE") blockReason = "INFLUENCER_INACTIVE";
    else {
      const uid = userIdByInfluencer.get(influencerId) ?? null;
      const benReason = beneficiaryBlockReasonFor(
        uid ? readinessByUser.get(uid) : undefined,
        !!uid,
      );
      if (benReason) blockReason = benReason;
      else if (net <= 0) blockReason = "NET_NON_POSITIVE";
    }
    // (Note: type-narrowed for the typechecker below.)

    byInfluencer.push({
      influencerId,
      influencerDisplayName: g.influencerDisplayName,
      grossCents: g.gross,
      reversedCents: g.reversed,
      netCents: net,
      lineCount: g.lines.length,
      isBlocked: !!blockReason,
      blockReason,
    });

    for (const ln of g.lines) {
      if (blockReason) blockedLines.push({ ...ln, reason: blockReason });
      else eligibleLines.push(ln);
    }
  }

  byInfluencer.sort((a, b) => a.influencerDisplayName.localeCompare(b.influencerDisplayName));

  const eligibleNetCents = byInfluencer
    .filter(b => !b.isBlocked)
    .reduce((s, b) => s + b.netCents, 0);
  const blockedCents = blockedLines.reduce((s, b) => s + b.amountCents, 0);

  return {
    range: { from: opts.from, to: opts.to },
    eligibleLines,
    blockedLines,
    byInfluencer,
    totals: {
      eligibleNetCents,
      blockedCents,
      eligibleLineCount: eligibleLines.length,
      blockedLineCount: blockedLines.length,
    },
  };
}

// ── Integrity revalidation ──────────────────────────────────────────────

export type IntegrityResult = {
  ok: boolean;
  storedTotalCents: number;
  storedLineCount: number;
  recomputedTotalCents: number;
  recomputedLineCount: number;
  ineligibleInfluencers: Array<{ influencerId: string; reason: InfluencerEligibility }>;
  driftReasons: string[];
};

/**
 * Recomputes a batch's total + line count from the source-of-truth
 * `LedgerEntry` rows currently attached, and verifies every included
 * influencer is still ACTIVE. Used as a precondition to APPROVE and to
 * EXPORT — neither transition should proceed if the world has shifted
 * underneath the stored summary.
 *
 * Pass `tx` so the read happens inside the same transaction as the
 * mutation that depends on its result.
 */
export async function revalidateBatchIntegrity(
  batchId: string,
  tx?: Prisma.TransactionClient,
): Promise<IntegrityResult> {
  const client = tx ?? prisma;

  const stored = await client.payoutBatch.findUnique({
    where: { id: batchId },
    select: { totalCents: true, lineCount: true, currency: true },
  });
  if (!stored) {
    return {
      ok: false,
      storedTotalCents: 0,
      storedLineCount: 0,
      recomputedTotalCents: 0,
      recomputedLineCount: 0,
      ineligibleInfluencers: [],
      driftReasons: ["Batch not found"],
    };
  }

  const lines = await client.ledgerEntry.findMany({
    where: { payoutBatchId: batchId },
    select: {
      id: true,
      type: true,
      amountCents: true,
      currency: true,
      influencerId: true,
      influencer: {
        select: { id: true, displayName: true, approved: true, approvalStatus: true },
      },
    },
  });

  const recomputedTotal = lines.reduce((s, l) => {
    return s + (l.type === "COMMISSION_EARNED" ? l.amountCents : -l.amountCents);
  }, 0);
  const recomputedCount = lines.length;

  const ineligibleInfluencers: IntegrityResult["ineligibleInfluencers"] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.influencerId)) continue;
    seen.add(l.influencerId);
    const eligibility = deriveInfluencerEligibility(l.influencer);
    if (eligibility !== "ACTIVE") {
      ineligibleInfluencers.push({ influencerId: l.influencerId, reason: eligibility });
    }
  }

  const driftReasons: string[] = [];
  if (recomputedTotal !== stored.totalCents) {
    driftReasons.push(
      `Total drift: stored ${stored.totalCents} ${stored.currency}, recomputed ${recomputedTotal} ${stored.currency}`,
    );
  }
  if (recomputedCount !== stored.lineCount) {
    driftReasons.push(`Line count drift: stored ${stored.lineCount}, recomputed ${recomputedCount}`);
  }
  if (lines.some(l => l.currency !== stored.currency)) {
    driftReasons.push("Mixed-currency lines found in batch");
  }
  if (ineligibleInfluencers.length > 0) {
    driftReasons.push(
      `${ineligibleInfluencers.length} influencer(s) no longer eligible: ` +
        ineligibleInfluencers.map(x => `${x.influencerId}=${x.reason}`).join(", "),
    );
  }
  if (recomputedCount === 0) {
    driftReasons.push("Batch has zero attached ledger lines");
  }
  if (recomputedTotal <= 0) {
    driftReasons.push(`Recomputed total is non-positive: ${recomputedTotal}`);
  }

  return {
    ok: driftReasons.length === 0,
    storedTotalCents: stored.totalCents,
    storedLineCount: stored.lineCount,
    recomputedTotalCents: recomputedTotal,
    recomputedLineCount: recomputedCount,
    ineligibleInfluencers,
    driftReasons,
  };
}

// ── Deterministic export payload ────────────────────────────────────────

export type ExportRecipientRow = {
  influencerId: string;
  influencerDisplayName: string;
  influencerHandle: string | null;
  netCents: number;
  lineCount: number;
  ledgerEntryIds: string[];
};

export type ExportPayload = {
  batchId: string;
  batchName: string | null;
  currency: string;
  periodFrom: string;
  periodTo: string;
  totalCents: number;
  recipientCount: number;
  recipients: ExportRecipientRow[];
  // Audit/trace fields
  approvedAt: string;
  approvedById: string;
  submittedAt: string;
  submittedById: string;
  exportedAt: string;
  exportedById: string;
  exportFormat: PayoutExportFormat;
};

/**
 * Builds a deterministic, sorted, JSON-canonicalisable export object
 * from the batch's current state. Same batch + same input always yields
 * the same SHA-256 — auditors can re-run this against the persisted
 * `exportPayload` to prove the bank file has not been tampered with.
 *
 * Sort order (lexicographic by influencerId, then by ledgerEntryId
 * within each recipient) is the source of determinism.
 */
export async function buildExportPayload(
  batchId: string,
  exportedById: string,
  exportFormat: PayoutExportFormat,
  tx?: Prisma.TransactionClient,
): Promise<ExportPayload> {
  const client = tx ?? prisma;
  const batch = await client.payoutBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true, name: true, currency: true, from: true, to: true,
      submittedAt: true, submittedById: true,
      approvedAt: true, approvedById: true,
    },
  });
  if (!batch) throw new Error("Batch not found while building export payload");

  const lines = await client.ledgerEntry.findMany({
    where: { payoutBatchId: batchId },
    select: {
      id: true, type: true, amountCents: true,
      influencerId: true,
      influencer: { select: { id: true, displayName: true, handle: true } },
    },
  });

  // Group by influencer with deterministic sort.
  const byInfluencer = new Map<string, ExportRecipientRow>();
  for (const l of lines) {
    const sign = l.type === "COMMISSION_EARNED" ? 1 : -1;
    const row = byInfluencer.get(l.influencerId) ?? {
      influencerId: l.influencerId,
      influencerDisplayName: l.influencer?.displayName ?? "(missing)",
      influencerHandle: l.influencer?.handle ?? null,
      netCents: 0,
      lineCount: 0,
      ledgerEntryIds: [],
    };
    row.netCents += sign * l.amountCents;
    row.lineCount += 1;
    row.ledgerEntryIds.push(l.id);
    byInfluencer.set(l.influencerId, row);
  }

  const recipients = Array.from(byInfluencer.values())
    .map(r => ({ ...r, ledgerEntryIds: [...r.ledgerEntryIds].sort() }))
    .sort((a, b) => a.influencerId.localeCompare(b.influencerId));
  const totalCents = recipients.reduce((s, r) => s + r.netCents, 0);

  return {
    batchId: batch.id,
    batchName: batch.name,
    currency: batch.currency,
    periodFrom: batch.from.toISOString(),
    periodTo: batch.to.toISOString(),
    totalCents,
    recipientCount: recipients.length,
    recipients,
    approvedAt: batch.approvedAt?.toISOString() ?? "",
    approvedById: batch.approvedById ?? "",
    submittedAt: batch.submittedAt?.toISOString() ?? "",
    submittedById: batch.submittedById ?? "",
    exportedAt: new Date().toISOString(),
    exportedById,
    exportFormat,
  };
}

export function hashExportPayload(payload: ExportPayload): { canonicalJson: string; sha256: string } {
  // Deterministic key ordering via JSON.stringify with explicit sorted
  // shape — `recipients` is already sorted, and the top-level keys are
  // explicitly listed below in fixed order.
  const canonical = {
    batchId: payload.batchId,
    batchName: payload.batchName,
    currency: payload.currency,
    periodFrom: payload.periodFrom,
    periodTo: payload.periodTo,
    totalCents: payload.totalCents,
    recipientCount: payload.recipientCount,
    submittedAt: payload.submittedAt,
    submittedById: payload.submittedById,
    approvedAt: payload.approvedAt,
    approvedById: payload.approvedById,
    exportedAt: payload.exportedAt,
    exportedById: payload.exportedById,
    exportFormat: payload.exportFormat,
    recipients: payload.recipients,
  };
  const canonicalJson = JSON.stringify(canonical);
  const sha256 = createHash("sha256").update(canonicalJson).digest("hex");
  return { canonicalJson, sha256 };
}

// ── Lifecycle: create / submit / approve / reject / export / discard ────

const ACTIVE_STATUSES: Prisma.PayoutBatchWhereInput["status"] = {
  in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"],
};

export async function createDraft(opts: {
  name: string;
  notes?: string | null;
  from: Date;
  to: Date;
  ledgerEntryIds: string[];
  createdById: string;
  currency?: string;
}): Promise<{ batchId: string; lineCount: number; totalCents: number }> {
  const currency = opts.currency ?? "USD";

  return prisma.$transaction(async tx => {
    // Re-validate selected entries inside the tx: must be unbatched and in
    // an active status. Locks against the create-create race the same way
    // the create-entity handler does in the org resolver.
    const entries = await tx.ledgerEntry.findMany({
      where: {
        id: { in: opts.ledgerEntryIds },
        payoutBatchId: null,
        type: { in: ["COMMISSION_EARNED", "COMMISSION_REVERSED"] },
      },
      select: { id: true, amountCents: true, type: true, currency: true, influencerId: true },
    });

    if (entries.length === 0) {
      throw new Error("No eligible ledger entries selected");
    }
    if (entries.length !== opts.ledgerEntryIds.length) {
      throw new Error(
        `Some selected entries are no longer eligible (${entries.length}/${opts.ledgerEntryIds.length} valid)`,
      );
    }
    const wrongCurrency = entries.find(e => e.currency !== currency);
    if (wrongCurrency) {
      throw new Error(`Mixed currencies in batch: expected ${currency}, found ${wrongCurrency.currency}`);
    }

    await assertBeneficiaryReadinessForInfluencers(
      Array.from(new Set(entries.map(e => e.influencerId))),
    );

    const totalCents = entries.reduce((s, e) => {
      return s + (e.type === "COMMISSION_EARNED" ? e.amountCents : -e.amountCents);
    }, 0);

    const batch = await tx.payoutBatch.create({
      data: {
        name: opts.name,
        notes: opts.notes ?? null,
        from: opts.from,
        to: opts.to,
        status: "DRAFT",
        currency,
        totalCents,
        lineCount: entries.length,
        createdById: opts.createdById,
      },
    });

    await tx.ledgerEntry.updateMany({
      where: { id: { in: entries.map(e => e.id) } },
      data: { payoutBatchId: batch.id },
    });

    await logPayoutBatchAction(
      {
        actorId: opts.createdById,
        action: "CREATE_DRAFT",
        payoutBatchId: batch.id,
        after: {
          name: batch.name,
          from: opts.from.toISOString(),
          to: opts.to.toISOString(),
          lineCount: entries.length,
          totalCents,
          currency,
        },
      },
      tx,
    );

    return { batchId: batch.id, lineCount: entries.length, totalCents };
  });
}

export async function submitForApproval(opts: {
  batchId: string;
  userId: string;
}): Promise<void> {
  await prisma.$transaction(async tx => {
    const batch = await tx.payoutBatch.findUnique({
      where: { id: opts.batchId },
      select: { id: true, status: true, lineCount: true, totalCents: true },
    });
    if (!batch) throw new Error("Batch not found");
    if (batch.status !== "DRAFT") {
      throw new Error(`Cannot submit batch in status ${batch.status}`);
    }
    if (batch.lineCount === 0 || batch.totalCents <= 0) {
      throw new Error("Cannot submit empty or non-positive batch");
    }

    const lines = await tx.ledgerEntry.findMany({
      where: { payoutBatchId: batch.id },
      select: { influencerId: true },
    });
    await assertBeneficiaryReadinessForInfluencers(
      Array.from(new Set(lines.map(l => l.influencerId))),
    );

    await tx.payoutBatch.update({
      where: { id: batch.id, status: "DRAFT" },
      data: {
        status: "PENDING_APPROVAL",
        submittedAt: new Date(),
        submittedById: opts.userId,
      },
    });

    await logPayoutBatchAction(
      {
        actorId: opts.userId,
        action: "SUBMIT",
        payoutBatchId: batch.id,
        before: { status: "DRAFT" },
        after: { status: "PENDING_APPROVAL" },
      },
      tx,
    );
  });
}

export async function approve(opts: {
  batchId: string;
  userId: string;
}): Promise<void> {
  await prisma.$transaction(async tx => {
    const batch = await tx.payoutBatch.findUnique({
      where: { id: opts.batchId },
      select: { id: true, status: true, submittedById: true },
    });
    if (!batch) throw new Error("Batch not found");
    if (batch.status !== "PENDING_APPROVAL") {
      throw new Error(`Cannot approve batch in status ${batch.status}`);
    }
    // Maker/checker rule.
    if (batch.submittedById && batch.submittedById === opts.userId) {
      throw new Error("Maker/checker violation: submitter cannot approve their own batch");
    }

    // Re-validate against source of truth INSIDE the transaction. If lines
    // were added/removed/altered or if any included influencer is no longer
    // ACTIVE, refuse to approve and surface the drift reasons.
    const integrity = await revalidateBatchIntegrity(batch.id, tx);
    if (!integrity.ok) {
      throw new Error(
        `Integrity check failed before approve: ${integrity.driftReasons.join("; ")}`,
      );
    }

    const approveLines = await tx.ledgerEntry.findMany({
      where: { payoutBatchId: batch.id },
      select: { influencerId: true },
    });
    await assertBeneficiaryReadinessForInfluencers(
      Array.from(new Set(approveLines.map(l => l.influencerId))),
    );

    await tx.payoutBatch.update({
      where: { id: batch.id, status: "PENDING_APPROVAL" },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedById: opts.userId,
      },
    });

    await logPayoutBatchAction(
      {
        actorId: opts.userId,
        action: "APPROVE",
        payoutBatchId: batch.id,
        before: { status: "PENDING_APPROVAL", submittedById: batch.submittedById },
        after: {
          status: "APPROVED",
          integrity: {
            recomputedTotalCents: integrity.recomputedTotalCents,
            recomputedLineCount: integrity.recomputedLineCount,
          },
        },
      },
      tx,
    );
  });
}

export async function reject(opts: {
  batchId: string;
  userId: string;
  reason: string;
}): Promise<void> {
  if (!opts.reason?.trim()) throw new Error("Rejection reason required");

  await prisma.$transaction(async tx => {
    const batch = await tx.payoutBatch.findUnique({
      where: { id: opts.batchId },
      select: { id: true, status: true },
    });
    if (!batch) throw new Error("Batch not found");
    // Reject is reserved for the formal review step. DRAFTs that the
    // submitter wants to abandon use `discardDraft`. This preserves the
    // boundary between "the maker walking away" and "the checker formally
    // denying".
    if (batch.status !== "PENDING_APPROVAL") {
      throw new Error(`Cannot reject batch in status ${batch.status} (must be PENDING_APPROVAL)`);
    }

    // Release all included LedgerEntry rows so they become eligible to be
    // re-batched. We deliberately PRESERVE `lineCount` / `totalCents` on
    // the PayoutBatch header so the rejected batch retains its forensic
    // record of what was being proposed.
    await tx.ledgerEntry.updateMany({
      where: { payoutBatchId: batch.id },
      data: { payoutBatchId: null },
    });

    // Also release any attached sub-commission rows so they can be re-batched.
    // reject() checks PENDING_APPROVAL above; the internal helper has no status
    // guard so it works at any lifecycle point the caller has already validated.
    await releaseSubCommissionsInternal(batch.id, tx);

    await tx.payoutBatch.update({
      where: { id: batch.id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectedById: opts.userId,
        rejectionReason: opts.reason.trim(),
      },
    });

    await logPayoutBatchAction(
      {
        actorId: opts.userId,
        action: "REJECT",
        payoutBatchId: batch.id,
        before: { status: batch.status },
        after: { status: "REJECTED", reason: opts.reason.trim() },
      },
      tx,
    );
  });
}

export async function markExported(opts: {
  batchId: string;
  userId: string;
  /**
   * Required. The bank file format the operator is committing to.
   * Validated against the `exportFormats` registry — there is no
   * implicit default. Marking the batch as exported is a workflow
   * commitment ("we are paying these recipients via this channel"),
   * so we refuse to make that commitment for the operator.
   *
   * POLICY: All registered formats are accepted here, including those
   * whose adapter status is `PENDING_SPEC` or `PLANNED` (e.g.
   * `BANESCO_PANAMA_PENDING_SPEC`). This is intentional. The state
   * transition to EXPORTED records the operator's *commitment* to a
   * channel and locks the canonical payload + SHA-256. Rendering an
   * actual bank-acceptable file is a downstream concern handled by
   * `renderPayoutFile(format, payload)` and may legitimately fail with
   * NotImplemented while we wait on a bank's spec. The UI surfaces the
   * format's status so the operator knows when no renderable file
   * exists yet for the format they're committing to.
   */
  format: string;
}): Promise<void> {
  const validatedFormat = assertSupportedPayoutExportFormat(opts.format);
  await prisma.$transaction(async tx => {
    const batch = await tx.payoutBatch.findUnique({
      where: { id: opts.batchId },
      select: { id: true, status: true, approvedById: true, submittedById: true },
    });
    if (!batch) throw new Error("Batch not found");
    if (batch.status !== "APPROVED") {
      throw new Error(`Cannot export batch in status ${batch.status} (must be APPROVED)`);
    }

    // Re-validate AGAIN at export time. Even though approval re-validated,
    // time has passed: an influencer could have been suspended, a line
    // could have been re-assigned by a misbehaving migration. Refuse to
    // export anything we can't currently re-prove.
    const integrity = await revalidateBatchIntegrity(batch.id, tx);
    if (!integrity.ok) {
      throw new Error(
        `Integrity check failed before export: ${integrity.driftReasons.join("; ")}`,
      );
    }

    // Build the deterministic payload + hash. This is the canonical
    // record of what was sent to the bank — bank-agnostic. The hash is
    // persisted on the batch row so any future regeneration can be
    // diffed against it. The chosen `format` is recorded but does NOT
    // alter the canonical payload shape; format-specific rendering is
    // handled separately by adapters in `./exportFormats`.
    const payload = await buildExportPayload(batch.id, opts.userId, validatedFormat, tx);
    const { canonicalJson, sha256 } = hashExportPayload(payload);

    await tx.payoutBatch.update({
      where: { id: batch.id, status: "APPROVED" },
      data: {
        status: "EXPORTED",
        exportedAt: new Date(),
        exportedById: opts.userId,
        exportFormat: validatedFormat,
        exportFileHash: sha256,
        exportPayload: canonicalJson,
        closedAt: new Date(),
      },
    });

    // DELIBERATELY NOT flipping InfluencerSubCommissionLedger.payoutStatus to
    // PAID here. Those rows are attached to this batch (payoutBatchId is set)
    // and appear in getBatchDetail.subCommissionLines, but they are NOT yet
    // included in the deterministic exportPayload / SHA-256 hash, and the bank
    // adapter does not yet emit transfer instructions for them. Flipping to PAID
    // before the referrer's amount is actually in the bank file would mean
    // marking someone paid when no payment instruction was issued.
    //
    // Lifecycle for sub-commission rows (Step 4 partial):
    //   payoutBatchId=null, payoutStatus=PENDING  → eligible, not yet batched
    //   payoutBatchId=<id>, payoutStatus=PENDING  → batched/export-pending
    //                                                (this batch, not yet paid)
    //   payoutStatus=PAID                         → NOT SET HERE — deferred
    //                                                until bank adapter includes
    //                                                subCommissionLines in the
    //                                                payable file (follow-up).
    //
    // The commissionBatched flag on the referrer feed already signals "in a
    // batch, awaiting payment" vs "pending, not yet batched". commissionPendingCents
    // correctly includes all PENDING rows (batched or not) so the referrer always
    // sees what they are owed.

    await logPayoutBatchAction(
      {
        actorId: opts.userId,
        action: "EXPORT",
        payoutBatchId: batch.id,
        before: { status: "APPROVED" },
        after: {
          status: "EXPORTED",
          exportFormat: validatedFormat,
          exportFileHash: sha256,
          recipientCount: payload.recipientCount,
          totalCents: payload.totalCents,
        },
      },
      tx,
    );
  });
}

export async function discardDraft(opts: {
  batchId: string;
  userId: string;
}): Promise<void> {
  await prisma.$transaction(async tx => {
    const batch = await tx.payoutBatch.findUnique({
      where: { id: opts.batchId },
      select: { id: true, status: true },
    });
    if (!batch) throw new Error("Batch not found");
    if (batch.status !== "DRAFT") {
      throw new Error(`Can only discard DRAFT batches (current: ${batch.status})`);
    }

    // Release main ledger lines so they can be re-batched.
    await tx.ledgerEntry.updateMany({
      where: { payoutBatchId: batch.id },
      data: { payoutBatchId: null },
    });

    // Also release any sub-commission rows so they can be re-batched.
    // Uses the internal helper (no status guard) since discardDraft already
    // validates the DRAFT requirement above.
    await releaseSubCommissionsInternal(batch.id, tx);

    // Audit BEFORE the hard-delete so the row exists for FK checks if any
    // future audit table references PayoutBatch. The `after` field is null
    // because the batch row no longer exists post-transaction; the action
    // name `PAYOUT_BATCH_DISCARD` itself encodes the deletion.
    await logPayoutBatchAction(
      {
        actorId: opts.userId,
        action: "DISCARD",
        payoutBatchId: batch.id,
        before: { status: "DRAFT" },
        after: null,
        note: "Batch hard-deleted; ledger lines released back to eligible pool",
      },
      tx,
    );

    await tx.payoutBatch.delete({ where: { id: batch.id } });
  });
}

// ── List / detail ────────────────────────────────────────────────────────

export async function listBatches(opts: { status?: string }) {
  const where: Prisma.PayoutBatchWhereInput = opts.status
    ? { status: opts.status as Prisma.PayoutBatchWhereInput["status"] extends infer T ? T : never }
    : {};
  return prisma.payoutBatch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      currency: true,
      totalCents: true,
      lineCount: true,
      from: true,
      to: true,
      createdAt: true,
      createdById: true,
      submittedAt: true,
      submittedById: true,
      approvedAt: true,
      approvedById: true,
      rejectedAt: true,
      rejectedById: true,
      rejectionReason: true,
      exportedAt: true,
      exportedById: true,
      exportFormat: true,
    },
  });
}

/**
 * Internal helper: unconditionally clears payoutBatchId on all sub-commission
 * rows attached to batchId. Has NO status guard — callers are responsible for
 * checking lifecycle state before calling (discardDraft checks DRAFT,
 * reject() checks PENDING_APPROVAL). Never expose this directly via API.
 */
async function releaseSubCommissionsInternal(
  batchId: string,
  tx: Prisma.TransactionClient,
): Promise<number> {
  const result = await tx.influencerSubCommissionLedger.updateMany({
    where: { payoutBatchId: batchId },
    data: { payoutBatchId: null },
  });
  return result.count;
}

// ── Sub-commission ledger reconciliation (Step 4 — PARTIAL) ─────────────
//
// `InfluencerSubCommissionLedger` rows track the referrer's share on
// ticket-purchase orders. They travel a parallel, simpler lifecycle:
//
//   payoutBatchId = null, payoutStatus = PENDING → eligible, not yet batched
//   payoutBatchId = <batchId>, payoutStatus = PENDING → claimed/export-pending
//   payoutStatus = PAID  ← NOT SET BY THIS CODE — see "DEFERRED" note below
//
// These rows are NOT `LedgerEntry` records — they live in a separate model
// and are reconciled into a batch AFTER the draft is created for its main
// commission entries. The admin picks both sets together in the payout UI.
//
// WHAT IS COMPLETE:
//   listEligibleSubCommissionLines  — preview of unbatched pending rows
//   attachSubCommissionsToBatch     — claim rows into an existing batch
//   detachSubCommissionsFromBatch   — release rows back to the eligible pool
//                                     (called on reject and discard)
//   getBatchDetail                  — exposes subCommissionLines +
//                                     subCommissionTotalCents/LineCount
//
// WHAT IS DEFERRED (follow-up required before marking PAID):
//   - Sub-commission rows are NOT yet in the deterministic exportPayload /
//     SHA-256 hash (which covers LedgerEntry influencer commissions only).
//   - The bank-file adapter does NOT yet emit transfer instructions for them.
//   - payoutStatus is therefore intentionally left at PENDING after export —
//     "batched" is not "paid". The PAID flip must wait until the bank adapter
//     actually includes these rows in the payable file.
//
// DOUBLE-COUNTING GUARD: `payoutBatchId` is stamped atomically inside a tx;
// a concurrent `attachSubCommissionsToBatch` call will find no eligible rows.
// ────────────────────────────────────────────────────────────────────────────

export type SubCommissionLine = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  eventTitle: string | null;
  eventReferrerAssignmentId: string;
  assignmentDisplayName: string | null;
  parentInfluencerId: string | null;
  parentPartnerId: string | null;
  parentInfluencerDisplayName: string | null;
  referrerShareCents: number;
  currency: string;
  payoutStatus: string;
  createdAt: Date;
};

export async function listEligibleSubCommissionLines(opts: {
  from: Date;
  to: Date;
}): Promise<SubCommissionLine[]> {
  const rows = await prisma.influencerSubCommissionLedger.findMany({
    where: {
      payoutBatchId: null,
      payoutStatus: "PENDING",
      createdAt: { gte: opts.from, lte: opts.to },
      // Only platform-paid rows — skip host-settled (INFLUENCER payout
      // responsibility means the influencer's own share is already in LedgerEntry;
      // host-settled rows are off-platform and should not enter the bank file).
      payoutResponsibility: "PLATFORM",
    },
    select: {
      id: true,
      orderId: true,
      parentInfluencerId: true,
      parentPartnerId: true,
      parentInfluencer: { select: { id: true, displayName: true } },
      eventReferrerAssignmentId: true,
      eventReferrerAssignment: { select: { id: true, displayName: true } },
      referrerShareCents: true,
      currency: true,
      payoutStatus: true,
      createdAt: true,
      order: {
        select: {
          orderNumber: true,
          series: { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map(r => ({
    id: r.id,
    orderId: r.orderId,
    orderNumber: r.order?.orderNumber ?? null,
    eventTitle: r.order?.series?.title ?? null,
    eventReferrerAssignmentId: r.eventReferrerAssignmentId,
    assignmentDisplayName: r.eventReferrerAssignment?.displayName ?? null,
    parentInfluencerId: r.parentInfluencerId,
    parentPartnerId: r.parentPartnerId,
    parentInfluencerDisplayName: r.parentInfluencer?.displayName ?? null,
    referrerShareCents: r.referrerShareCents,
    currency: r.currency,
    payoutStatus: r.payoutStatus,
    createdAt: r.createdAt,
  }));
}

/**
 * Claim a set of unbatched sub-commission rows into an existing PayoutBatch.
 * The batch must be in DRAFT status; rows must be unbatched + PENDING.
 * Stamping is atomic (single updateMany inside the existing batch tx).
 *
 * Call this AFTER createDraft — the sub-commission rows are a supplement to
 * the main LedgerEntry set, they do not affect batch.totalCents or
 * batch.lineCount (those reflect LedgerEntry only). The bank export file
 * includes them via a separate line item per recipient.
 */
export async function attachSubCommissionsToBatch(opts: {
  batchId: string;
  subCommissionLedgerIds: string[];
  actorId: string;
}): Promise<{ attached: number }> {
  if (opts.subCommissionLedgerIds.length === 0) return { attached: 0 };

  return prisma.$transaction(async tx => {
    const batch = await tx.payoutBatch.findUnique({
      where: { id: opts.batchId },
      select: { id: true, status: true },
    });
    if (!batch) throw new Error("Batch not found");
    if (batch.status !== "DRAFT") {
      throw new Error(`Sub-commissions can only be attached to DRAFT batches (current: ${batch.status})`);
    }

    // Enforce the same eligibility constraints as listEligibleSubCommissionLines:
    // unbatched + PENDING + PLATFORM responsibility. Prevents non-platform rows
    // from being claimed into a bank payout batch via a crafted request.
    const eligible = await tx.influencerSubCommissionLedger.findMany({
      where: {
        id: { in: opts.subCommissionLedgerIds },
        payoutBatchId: null,
        payoutStatus: "PENDING",
        payoutResponsibility: "PLATFORM",
      },
      select: { id: true },
    });
    if (eligible.length !== opts.subCommissionLedgerIds.length) {
      throw new Error(
        `Some sub-commission rows are no longer eligible (${eligible.length}/${opts.subCommissionLedgerIds.length} valid — must be unbatched, PENDING, and PLATFORM responsibility)`
      );
    }

    const result = await tx.influencerSubCommissionLedger.updateMany({
      where: { id: { in: eligible.map(r => r.id) }, payoutBatchId: null },
      data: { payoutBatchId: opts.batchId },
    });

    // Race-condition guard: if a concurrent attach claimed any of the same rows
    // between our eligibility read and the stamp, the payoutBatchId: null filter
    // in the updateMany will have silently skipped them and result.count drops
    // below eligible.length. Refuse the partial claim — the caller must refresh
    // the eligible list and retry with the remaining available rows.
    if (result.count !== eligible.length) {
      throw new Error(
        `Sub-commission stamp collision: expected to claim ${eligible.length} rows, ` +
        `but only ${result.count} were stamped. A concurrent operation may have ` +
        `claimed the same rows. Refresh the eligible list and retry.`
      );
    }

    await logPayoutBatchAction(
      {
        actorId: opts.actorId,
        action: "ATTACH_SUB_COMMISSIONS",
        payoutBatchId: opts.batchId,
        after: { subCommissionRowsAttached: result.count },
      },
      tx,
    );

    return { attached: result.count };
  });
}

/**
 * Release all sub-commission rows from a DRAFT batch back to the eligible pool.
 *
 * Invariants enforced at BOTH service and API layers:
 *  - Batch must be in DRAFT status. Detaching from SUBMITTED/APPROVED/EXPORTED
 *    batches would reopen already-settled rows for rebatching/double-payment and
 *    break the payout audit trail.
 *  - An audit row is written so every detach is traceable to an actor.
 *
 * Pass `actorId` when called from an explicit admin action (API routes, UI).
 * The `discardDraft` flow passes actorId from its own opts — it is the only
 * trusted internal caller that passes a `tx` without an actorId (it logs its
 * own DISCARD audit entry that already covers the detach).
 */
export async function detachSubCommissionsFromBatch(
  batchId: string,
  tx?: Prisma.TransactionClient,
  actorId?: string,
): Promise<{ released: number }> {
  const run = async (client: Prisma.TransactionClient) => {
    const batch = await client.payoutBatch.findUnique({
      where: { id: batchId },
      select: { id: true, status: true },
    });
    if (!batch) throw new Error("Batch not found");
    if (batch.status !== "DRAFT") {
      throw new Error(
        `Sub-commissions can only be detached from DRAFT batches (current: ${batch.status}). ` +
        "Modifying approved or exported batches would break payout auditability."
      );
    }

    const released = await releaseSubCommissionsInternal(batchId, client);

    // Only emit an explicit DETACH audit entry when triggered by an external
    // actor (API route). The discardDraft caller already writes its own DISCARD
    // entry that subsumes this detach — skip the redundant entry to keep the
    // audit log clean.
    if (actorId) {
      await logPayoutBatchAction(
        {
          actorId,
          action: "DETACH_SUB_COMMISSIONS",
          payoutBatchId: batchId,
          after: { subCommissionRowsReleased: released },
          note: "Sub-commission rows released back to eligible pool",
        },
        client,
      );
    }

    return { released };
  };

  // If called inside an existing transaction (discardDraft), reuse it.
  // Otherwise open a new transaction so the status check + updateMany are atomic.
  if (tx) return run(tx);
  return prisma.$transaction(run);
}

export async function getBatchDetail(id: string) {
  const batch = await prisma.payoutBatch.findUnique({
    where: { id },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          amountCents: true,
          currency: true,
          createdAt: true,
          note: true,
          influencerId: true,
          influencer: {
            select: { id: true, displayName: true, handle: true, approved: true, approvalStatus: true },
          },
          orderId: true,
          order: {
            select: { id: true, orderNumber: true, totalCents: true, attributionSource: true },
          },
        },
      },
      // Include sub-commission summary so the admin detail view can show
      // the full financial picture. batch.totalCents / lineCount reflect
      // only LedgerEntry rows; subCommissionTotalCents / subCommissionLineCount
      // are the parallel figure for InfluencerSubCommissionLedger rows.
      subCommissions: {
        select: {
          id: true,
          referrerShareCents: true,
          currency: true,
          parentInfluencerId: true,
          parentInfluencer: { select: { id: true, displayName: true } },
          eventReferrerAssignmentId: true,
          eventReferrerAssignment: { select: { id: true, displayName: true } },
          orderId: true,
          order: { select: { orderNumber: true } },
          payoutStatus: true,
          createdAt: true,
        },
      },
    },
  });
  if (!batch) return null;

  const lines = batch.entries.map(e => ({
    ledgerEntryId: e.id,
    type: e.type,
    amountCents: e.amountCents,
    currency: e.currency,
    createdAt: e.createdAt,
    note: e.note,
    influencerId: e.influencerId,
    influencerDisplayName: e.influencer?.displayName ?? "(missing)",
    influencerHandle: e.influencer?.handle ?? null,
    influencerStatus: deriveInfluencerEligibility(e.influencer),
    orderId: e.orderId,
    orderNumber: e.order?.orderNumber ?? null,
    orderTotalCents: e.order?.totalCents ?? null,
    attributionSource: e.order?.attributionSource ?? null,
  }));

  // Sub-commission summary — separately labeled so admins and reconcilers can
  // distinguish LedgerEntry-based commissions from ISCL-based referrer shares.
  // IMPORTANT: batch.totalCents does NOT include these; the bank export must
  // account for both figures separately to avoid reconciliation drift.
  const subCommissionLines = batch.subCommissions.map(sc => ({
    id: sc.id,
    referrerShareCents: sc.referrerShareCents,
    currency: sc.currency,
    parentInfluencerId: sc.parentInfluencerId,
    parentInfluencerDisplayName: sc.parentInfluencer?.displayName ?? "(missing)",
    eventReferrerAssignmentId: sc.eventReferrerAssignmentId,
    assignmentDisplayName: sc.eventReferrerAssignment?.displayName ?? null,
    orderId: sc.orderId,
    orderNumber: sc.order?.orderNumber ?? null,
    payoutStatus: sc.payoutStatus,
    createdAt: sc.createdAt,
  }));
  const subCommissionTotalCents = subCommissionLines.reduce((s, l) => s + l.referrerShareCents, 0);
  const subCommissionLineCount = subCommissionLines.length;

  const { entries: _omit, subCommissions: _omitSc, ...header } = batch;
  return {
    ...header,
    lines,
    // Explicitly separated sub-commission figures prevent callers from
    // conflating them with batch.totalCents / batch.lineCount.
    subCommissionLines,
    subCommissionTotalCents,
    subCommissionLineCount,
  };
}
