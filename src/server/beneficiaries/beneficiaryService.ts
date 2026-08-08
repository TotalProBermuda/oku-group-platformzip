import { prisma } from "@/lib/prisma";
import type { Prisma, BeneficiaryProfile } from "@prisma/client";
import {
  encryptSecret,
  decryptSecret,
  isEncryptionAvailable,
  maskSecret,
} from "@/server/security/encryption";
import { sendBeneficiaryStatusEmail, resolvePreferredLocale } from "./statusEmail";

// ─────────────────────────────────────────────────────────────────────────────
// Beneficiary Verification — bank-readiness workflow for Banesco payouts.
//
// IMPORTANT: OKÜ is NOT a bank-grade KYC authority. Banesco performs formal
// KYC/AML. This service captures structured beneficiary info, document status
// flags (no uploads in P1), and a state machine that distinguishes:
//   1. OKÜ approval        — Finance has reviewed the profile internally.
//   2. Bank readiness      — Banesco has accepted the beneficiary file.
//   3. Payout eligibility  — derived (BANK_READY + no compliance hold).
//
// Account numbers are AES-256-GCM-encrypted via @/server/security/encryption.
// Only `*Last4` is stored unmasked. We NEVER return the plaintext account
// number from any service call (intentionally — admins also only see last4).
// ─────────────────────────────────────────────────────────────────────────────

export type DocStatus =
  | "NOT_REQUIRED"
  | "MISSING"
  | "RECEIVED"
  | "VERIFIED"
  | "REJECTED";

export type BankAccountTypeValue = "CHECKING" | "SAVINGS";

export type BankReadinessStatusValue =
  | "MISSING_INFO"
  | "READY_FOR_REVIEW"
  | "OKU_APPROVED"
  | "AWAITING_BANK_CONFIRMATION"
  | "BANK_READY"
  | "REJECTED"
  | "ON_HOLD";

/** Public-shape we hand to UI / API consumers — never includes plaintext. */
export type BeneficiaryProfileView = {
  userId: string;
  bank: {
    accountLast4: string | null;
    bankName: string | null;
    accountHolderName: string | null;
    accountType: BankAccountTypeValue | null;
    currency: string;
    swiftBic: string | null;
    hasAccountNumber: boolean;
  };
  documents: {
    proofOfAddressStatus: DocStatus;
    identificationStatus: DocStatus;
    taxOrRucStatus: DocStatus;
    sourceOfFundsStatus: DocStatus;
    incomeCertificationRequired: boolean;
    incomeCertificationExpiresAt: string | null;
  };
  status: {
    bankReadinessStatus: BankReadinessStatusValue;
    complianceHoldReason: string | null;
    okuApproved: boolean;
    okuApprovedAt: string | null;
    bankReady: boolean;
    bankReadyAt: string | null;
    payoutEligible: boolean;
    blockingReasons: string[];
  };
  preferences: {
    statusEmailOptOut: boolean;
  };
  adminVerificationNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Self-service input (beneficiary submits their own info) ────────────────
export type SelfServiceInput = {
  /** When provided, encrypts and overwrites the stored account number. */
  banescoAccountNumber?: string | null;
  bankName?: string | null;
  accountHolderName?: string | null;
  accountType?: BankAccountTypeValue | null;
  currency?: string | null;
  swiftBic?: string | null;
  /** Beneficiary preference: suppress informational status-change emails. */
  statusEmailOptOut?: boolean;
};

// ── Admin override input ───────────────────────────────────────────────────
export type AdminOverrideInput = SelfServiceInput & {
  proofOfAddressStatus?: DocStatus;
  identificationStatus?: DocStatus;
  taxOrRucStatus?: DocStatus;
  sourceOfFundsStatus?: DocStatus;
  incomeCertificationRequired?: boolean;
  incomeCertificationExpiresAt?: Date | string | null;
  adminVerificationNotes?: string | null;
};

// ─── Pure helpers ──────────────────────────────────────────────────────────

/** Required structured fields for OKÜ to accept the profile for review. */
function isInfoComplete(p: BeneficiaryProfile): boolean {
  if (!p.banescoAccountNumberEncrypted) return false;
  if (!p.bankName?.trim()) return false;
  if (!p.accountHolderName?.trim()) return false;
  if (!p.accountType) return false;
  if (!p.currency?.trim()) return false;

  const docOk = (s: DocStatus) =>
    s === "RECEIVED" || s === "VERIFIED" || s === "NOT_REQUIRED";
  if (!docOk(p.proofOfAddressStatus as DocStatus)) return false;
  if (!docOk(p.identificationStatus as DocStatus)) return false;
  if (!docOk(p.taxOrRucStatus as DocStatus)) return false;
  if (!docOk(p.sourceOfFundsStatus as DocStatus)) return false;

  if (p.incomeCertificationRequired) {
    if (!p.incomeCertificationExpiresAt) return false;
    if (p.incomeCertificationExpiresAt.getTime() <= Date.now()) return false;
  }
  return true;
}

/** Full payout-eligibility check used by the payout batch service. */
export type PayoutReadinessResult = {
  ready: boolean;
  /** Current bank-readiness status, or "MISSING_INFO" when no profile exists. */
  status: BankReadinessStatusValue;
  /** Empty when ready. Each entry is human-readable. */
  blockingReasons: string[];
};

export function evaluatePayoutReadiness(
  p: BeneficiaryProfile | null,
): PayoutReadinessResult {
  if (!p) return { ready: false, status: "MISSING_INFO", blockingReasons: ["Beneficiary profile missing"] };
  const reasons: string[] = [];
  if (p.bankReadinessStatus === "REJECTED") reasons.push("Beneficiary rejected by OKÜ");
  if (p.bankReadinessStatus === "ON_HOLD") {
    reasons.push(
      p.complianceHoldReason
        ? `Compliance hold: ${p.complianceHoldReason}`
        : "Compliance hold",
    );
  }
  if (p.bankReadinessStatus !== "BANK_READY" && p.bankReadinessStatus !== "ON_HOLD" && p.bankReadinessStatus !== "REJECTED") {
    reasons.push(`Bank readiness incomplete (${p.bankReadinessStatus})`);
  }
  if (
    p.bankReadinessStatus === "BANK_READY" &&
    p.complianceHoldReason &&
    p.complianceHoldReason.trim().length > 0
  ) {
    reasons.push(`Compliance hold: ${p.complianceHoldReason}`);
  }
  return {
    ready: reasons.length === 0,
    status: p.bankReadinessStatus as BankReadinessStatusValue,
    blockingReasons: reasons,
  };
}

function toView(p: BeneficiaryProfile): BeneficiaryProfileView {
  const eligibility = evaluatePayoutReadiness(p);
  return {
    userId: p.userId,
    bank: {
      accountLast4: p.banescoAccountLast4,
      bankName: p.bankName,
      accountHolderName: p.accountHolderName,
      accountType: (p.accountType as BankAccountTypeValue | null) ?? null,
      currency: p.currency,
      swiftBic: p.swiftBic,
      hasAccountNumber: !!p.banescoAccountNumberEncrypted,
    },
    documents: {
      proofOfAddressStatus: p.proofOfAddressStatus as DocStatus,
      identificationStatus: p.identificationStatus as DocStatus,
      taxOrRucStatus: p.taxOrRucStatus as DocStatus,
      sourceOfFundsStatus: p.sourceOfFundsStatus as DocStatus,
      incomeCertificationRequired: p.incomeCertificationRequired,
      incomeCertificationExpiresAt:
        p.incomeCertificationExpiresAt?.toISOString() ?? null,
    },
    status: {
      bankReadinessStatus: p.bankReadinessStatus as BankReadinessStatusValue,
      complianceHoldReason: p.complianceHoldReason,
      okuApproved: !!p.okuApprovedAt,
      okuApprovedAt: p.okuApprovedAt?.toISOString() ?? null,
      bankReady: p.bankReadinessStatus === "BANK_READY",
      bankReadyAt: p.bankReadyAt?.toISOString() ?? null,
      payoutEligible: eligibility.ready,
      blockingReasons: eligibility.blockingReasons,
    },
    preferences: {
      statusEmailOptOut: p.statusEmailOptOut,
    },
    adminVerificationNotes: p.adminVerificationNotes,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────

// `adminVerificationNotes` is finance/admin metadata about this beneficiary;
// it must NEVER reach the beneficiary themselves (would also leak via SSR
// hydration props on /my/beneficiary). Use this for every self-service return
// site (GET + PATCH). Browser test `tests/browser/trust-components.spec.ts`
// pins this for the GET path; vitest covers PATCH.
function toOwnView(p: BeneficiaryProfile): BeneficiaryProfileView {
  return { ...toView(p), adminVerificationNotes: null };
}

export async function getOwnProfile(userId: string): Promise<BeneficiaryProfileView | null> {
  const p = await prisma.beneficiaryProfile.findUnique({ where: { userId } });
  return p ? toOwnView(p) : null;
}

export async function adminGetProfile(userId: string): Promise<BeneficiaryProfileView | null> {
  const p = await prisma.beneficiaryProfile.findUnique({ where: { userId } });
  return p ? toView(p) : null;
}

export type ListFilters = {
  status?: BankReadinessStatusValue;
  q?: string;
  take?: number;
};

/**
 * Queue-only summary shape — intentionally a *separate type* from
 * `BeneficiaryProfileView` so any drift that adds bank/document keys to
 * the queue payload fails TypeScript at the call site. The
 * `BeneficiarySummaryHasNoBankDetailKeys` brand-check below also asserts
 * at compile time that the two types share no field name beyond `userId`
 * and `updatedAt`.
 *
 * Anyone holding `admin:beneficiaries:summary` (but not `:detail`) sees
 * only this shape — display name, status pill, payout-eligibility flag,
 * and blocking reasons. No raw bank account, holder name, swift/bic,
 * document statuses, compliance hold reason, or admin notes.
 */
export type BeneficiaryProfileSummaryView = {
  userId: string;
  status: {
    bankReadinessStatus: BankReadinessStatusValue;
    okuApproved: boolean;
    bankReady: boolean;
    payoutEligible: boolean;
    blockingReasons: string[];
  };
  updatedAt: string;
};

/** Bank/document/notes keys that must never appear on the summary view. */
type BankDetailKey =
  | "bank"
  | "documents"
  | "preferences"
  | "adminVerificationNotes"
  | "complianceHoldReason"
  | "okuApprovedAt"
  | "bankReadyAt";

// Compile-time guard: if a future edit accidentally widens
// BeneficiaryProfileSummaryView with a bank-detail key, this line fails
// to typecheck.
type _SummaryHasNoBankDetail = Extract<
  keyof BeneficiaryProfileSummaryView,
  BankDetailKey
> extends never
  ? true
  : never;
const _summaryHasNoBankDetail: _SummaryHasNoBankDetail = true;
void _summaryHasNoBankDetail;

/**
 * Strip any freeform reviewer-entered text from blocking reasons before
 * surfacing them through the summary view. Today the only freeform leak
 * is `evaluatePayoutReadiness()` embedding `complianceHoldReason` after
 * the literal "Compliance hold:" prefix — so we collapse anything matching
 * that prefix back to the bare label. This keeps the queue informative
 * (the row is still flagged "Compliance hold") while never exposing the
 * compliance-officer's note text to summary-only viewers.
 */
function sanitizeBlockingReasonsForSummary(reasons: string[]): string[] {
  return reasons.map((r) =>
    r.startsWith("Compliance hold:") ? "Compliance hold" : r,
  );
}

function toSummaryView(p: BeneficiaryProfile): BeneficiaryProfileSummaryView {
  const eligibility = evaluatePayoutReadiness(p);
  return {
    userId: p.userId,
    status: {
      bankReadinessStatus: p.bankReadinessStatus as BankReadinessStatusValue,
      okuApproved: !!p.okuApprovedAt,
      bankReady: p.bankReadinessStatus === "BANK_READY",
      payoutEligible: eligibility.ready,
      blockingReasons: sanitizeBlockingReasonsForSummary(eligibility.blockingReasons),
    },
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * List queue summaries for `admin:beneficiaries:summary` callers. The
 * returned shape carries display name + email (for row identification),
 * status, and payout-eligibility — but never bank-detail keys. See
 * `BeneficiaryProfileSummaryView`.
 */
export async function adminListProfileSummaries(
  f: ListFilters = {},
): Promise<
  Array<
    BeneficiaryProfileSummaryView & {
      user: { id: string; name: string | null; email: string };
    }
  >
> {
  const where: Prisma.BeneficiaryProfileWhereInput = {};
  if (f.status) where.bankReadinessStatus = f.status;
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [
      { user: { email: { contains: q, mode: "insensitive" } } },
      { user: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  const rows = await prisma.beneficiaryProfile.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.min(Math.max(f.take ?? 100, 1), 500),
  });
  return rows.map((r) => ({ ...toSummaryView(r), user: r.user }));
}

export async function adminListProfiles(
  f: ListFilters = {},
): Promise<Array<BeneficiaryProfileView & { user: { id: string; name: string | null; email: string } }>> {
  const where: Prisma.BeneficiaryProfileWhereInput = {};
  if (f.status) where.bankReadinessStatus = f.status;
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [
      { user: { email: { contains: q, mode: "insensitive" } } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { accountHolderName: { contains: q, mode: "insensitive" } },
      { bankName: { contains: q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.beneficiaryProfile.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.min(Math.max(f.take ?? 100, 1), 500),
  });
  return rows.map(r => ({ ...toView(r), user: r.user }));
}

// ─── Writes ────────────────────────────────────────────────────────────────

function buildUpdateData(input: AdminOverrideInput): Prisma.BeneficiaryProfileUpdateInput {
  const data: Prisma.BeneficiaryProfileUpdateInput = {};
  if (input.banescoAccountNumber !== undefined) {
    if (input.banescoAccountNumber === null || input.banescoAccountNumber === "") {
      data.banescoAccountNumberEncrypted = null;
      data.banescoAccountLast4 = null;
    } else {
      if (!isEncryptionAvailable()) {
        throw new Error(
          "APP_ENCRYPTION_KEY is not configured; bank account number cannot be saved.",
        );
      }
      const trimmed = input.banescoAccountNumber.replace(/\s|-/g, "");
      data.banescoAccountNumberEncrypted = encryptSecret(trimmed);
      data.banescoAccountLast4 = maskSecret(trimmed).last4;
    }
  }
  if (input.bankName !== undefined) data.bankName = input.bankName?.trim() || null;
  if (input.accountHolderName !== undefined)
    data.accountHolderName = input.accountHolderName?.trim() || null;
  if (input.accountType !== undefined) data.accountType = input.accountType ?? null;
  if (input.currency !== undefined) data.currency = (input.currency ?? "USD").toUpperCase();
  if (input.swiftBic !== undefined) data.swiftBic = input.swiftBic?.trim() || null;

  if ("proofOfAddressStatus" in input && input.proofOfAddressStatus)
    data.proofOfAddressStatus = input.proofOfAddressStatus;
  if ("identificationStatus" in input && input.identificationStatus)
    data.identificationStatus = input.identificationStatus;
  if ("taxOrRucStatus" in input && input.taxOrRucStatus)
    data.taxOrRucStatus = input.taxOrRucStatus;
  if ("sourceOfFundsStatus" in input && input.sourceOfFundsStatus)
    data.sourceOfFundsStatus = input.sourceOfFundsStatus;

  if ("incomeCertificationRequired" in input && typeof input.incomeCertificationRequired === "boolean")
    data.incomeCertificationRequired = input.incomeCertificationRequired;
  if ("incomeCertificationExpiresAt" in input) {
    const v = input.incomeCertificationExpiresAt;
    data.incomeCertificationExpiresAt = v
      ? typeof v === "string"
        ? new Date(v)
        : v
      : null;
  }
  if ("adminVerificationNotes" in input)
    data.adminVerificationNotes = input.adminVerificationNotes ?? null;
  if ("statusEmailOptOut" in input && typeof input.statusEmailOptOut === "boolean")
    data.statusEmailOptOut = input.statusEmailOptOut;
  return data;
}

async function writeAudit(
  tx: Prisma.TransactionClient | typeof prisma,
  actorId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  await tx.auditLog.create({
    data: { actorId, action, metadata: metadata as Prisma.InputJsonValue },
  });
}

/**
 * Beneficiary self-submits or updates their own profile. Cannot change
 * document statuses (admin only) — those are explicitly rejected here.
 * After save, if all info is complete the status is auto-promoted from
 * MISSING_INFO → READY_FOR_REVIEW. Returns the updated view.
 */
/**
 * Bank-coordinate fields whose mutation must invalidate any prior OKÜ
 * approval / bank-readiness state. Document-status fields are excluded —
 * those are admin-managed and don't change the underlying account.
 */
function bankFieldsTouched(input: SelfServiceInput): boolean {
  return (
    input.banescoAccountNumber !== undefined ||
    input.bankName !== undefined ||
    input.accountHolderName !== undefined ||
    input.accountType !== undefined ||
    input.swiftBic !== undefined ||
    input.currency !== undefined
  );
}

/**
 * Centralized auto-status transitions applied after every upsert (self or
 * admin). Two rules:
 *   1) MISSING_INFO → READY_FOR_REVIEW once info is complete.
 *   2) Any post-MISSING_INFO state (READY_FOR_REVIEW, OKU_APPROVED,
 *      AWAITING_BANK_CONFIRMATION, BANK_READY) is demoted whenever bank
 *      coordinate fields change. Target is READY_FOR_REVIEW if the new
 *      profile is complete, else MISSING_INFO. Approval and bank-ready
 *      timestamps are cleared so payout-eligibility recomputes correctly.
 *      ON_HOLD and REJECTED are left alone — only an explicit transition
 *      can move them back into the active flow.
 */
async function applyAutoStatusTransitions(
  tx: Prisma.TransactionClient,
  userId: string,
  existing: BeneficiaryProfile | null,
  next: BeneficiaryProfile,
  input: SelfServiceInput,
  source: "self" | "admin",
): Promise<BeneficiaryProfile> {
  // Rule 1: auto-promote when complete.
  if (next.bankReadinessStatus === "MISSING_INFO" && isInfoComplete(next)) {
    const updated = await tx.beneficiaryProfile.update({
      where: { userId },
      data: { bankReadinessStatus: "READY_FOR_REVIEW" },
    });
    await writeAudit(tx, userId, "beneficiary.profile.ready_for_review", {
      userId, source, before: "MISSING_INFO", after: "READY_FOR_REVIEW",
    });
    return updated;
  }

  // Rule 2: demote on bank-coord change from any post-approval state. We
  // include READY_FOR_REVIEW so a re-edit visibly re-affirms the review
  // queue position and clears any partially-set approval timestamps.
  const demotable: BankReadinessStatusValue[] = [
    "READY_FOR_REVIEW",
    "OKU_APPROVED",
    "AWAITING_BANK_CONFIRMATION",
    "BANK_READY",
  ];
  const isDemotable = demotable.includes(next.bankReadinessStatus as BankReadinessStatusValue);
  if (existing && isDemotable && bankFieldsTouched(input)) {
    const target: BankReadinessStatusValue = isInfoComplete(next)
      ? "READY_FOR_REVIEW"
      : "MISSING_INFO";
    if (target !== next.bankReadinessStatus) {
      const updated = await tx.beneficiaryProfile.update({
        where: { userId },
        data: {
          bankReadinessStatus: target,
          okuApprovedAt: null,
          okuApprovedById: null,
          bankReadyAt: null,
          bankReadyById: null,
        },
      });
      await writeAudit(tx, userId, "beneficiary.profile.reverted_to_review", {
        userId, source, reason: "bank_fields_changed_after_approval",
        before: next.bankReadinessStatus, after: target,
      });
      return updated;
    }
  }

  return next;
}

export async function upsertOwnProfile(
  userId: string,
  input: SelfServiceInput,
): Promise<BeneficiaryProfileView> {
  return prisma.$transaction(async tx => {
    const existing = await tx.beneficiaryProfile.findUnique({ where: { userId } });
    const data = buildUpdateData(input);
    const next = existing
      ? await tx.beneficiaryProfile.update({ where: { userId }, data })
      : await tx.beneficiaryProfile.create({
          data: { ...(data as Prisma.BeneficiaryProfileUncheckedCreateInput), userId },
        });

    const final = await applyAutoStatusTransitions(tx, userId, existing, next, input, "self");

    await writeAudit(tx, userId, "beneficiary.profile.self_update", {
      userId,
      changedFields: Object.keys(data),
      // Never log raw values — booleans only.
      accountNumberChanged: input.banescoAccountNumber !== undefined,
    });

    return toOwnView(final);
  });
}

/**
 * Admin override / edit on behalf of beneficiary. Allows editing document
 * statuses + notes too. Same auto-promotion rule applies.
 */
export async function adminUpsertProfile(
  targetUserId: string,
  actorId: string,
  input: AdminOverrideInput,
): Promise<BeneficiaryProfileView> {
  return prisma.$transaction(async tx => {
    const existing = await tx.beneficiaryProfile.findUnique({ where: { userId: targetUserId } });
    const data = buildUpdateData(input);
    const next = existing
      ? await tx.beneficiaryProfile.update({ where: { userId: targetUserId }, data })
      : await tx.beneficiaryProfile.create({
          data: { ...(data as Prisma.BeneficiaryProfileUncheckedCreateInput), userId: targetUserId },
        });

    const final = await applyAutoStatusTransitions(tx, targetUserId, existing, next, input, "admin");

    await writeAudit(tx, actorId, "beneficiary.profile.admin_update", {
      targetUserId,
      changedFields: Object.keys(data),
      accountNumberChanged: input.banescoAccountNumber !== undefined,
    });
    return toOwnView(final);
  });
}

// ─── State machine ─────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<BankReadinessStatusValue, BankReadinessStatusValue[]> = {
  MISSING_INFO:               ["READY_FOR_REVIEW", "ON_HOLD", "REJECTED"],
  READY_FOR_REVIEW:           ["OKU_APPROVED", "MISSING_INFO", "ON_HOLD", "REJECTED"],
  OKU_APPROVED:               ["AWAITING_BANK_CONFIRMATION", "READY_FOR_REVIEW", "ON_HOLD", "REJECTED"],
  AWAITING_BANK_CONFIRMATION: ["BANK_READY", "OKU_APPROVED", "ON_HOLD", "REJECTED"],
  BANK_READY:                 ["AWAITING_BANK_CONFIRMATION", "ON_HOLD", "REJECTED"],
  ON_HOLD:                    ["READY_FOR_REVIEW", "OKU_APPROVED", "AWAITING_BANK_CONFIRMATION", "BANK_READY", "REJECTED"],
  REJECTED:                   ["READY_FOR_REVIEW", "MISSING_INFO"],
};

export class TransitionError extends Error {}

export async function transitionStatus(opts: {
  targetUserId: string;
  actorId: string;
  to: BankReadinessStatusValue;
  reason?: string | null;
}): Promise<BeneficiaryProfileView> {
  const result = await prisma.$transaction(async tx => {
    const p = await tx.beneficiaryProfile.findUnique({
      where: { userId: opts.targetUserId },
      include: {
        user: {
          select: {
            email: true,
            name: true,
            profile: { select: { language: true } },
            influencer: { select: { preferredLanguage: true } },
          },
        },
      },
    });
    if (!p) throw new TransitionError("Beneficiary profile not found");
    const from = p.bankReadinessStatus as BankReadinessStatusValue;
    if (from === opts.to) return { view: toView(p), notify: null as null | { email: string | null; name: string | null; optOut: boolean; preferredLanguage: string | null } };
    if (!ALLOWED_TRANSITIONS[from].includes(opts.to)) {
      throw new TransitionError(`Illegal transition ${from} → ${opts.to}`);
    }
    if (opts.to === "OKU_APPROVED" && !isInfoComplete(p)) {
      throw new TransitionError("Cannot OKÜ-approve: profile information is incomplete");
    }
    if (opts.to === "ON_HOLD" && !opts.reason?.trim()) {
      throw new TransitionError("ON_HOLD requires a complianceHoldReason");
    }
    if (opts.to === "REJECTED" && !opts.reason?.trim()) {
      throw new TransitionError("REJECTED requires a reason");
    }

    const data: Prisma.BeneficiaryProfileUpdateInput = { bankReadinessStatus: opts.to };
    if (opts.to === "OKU_APPROVED") {
      data.okuApprovedAt = new Date();
      data.okuApprovedBy = { connect: { id: opts.actorId } };
      data.complianceHoldReason = null;
    }
    if (opts.to === "BANK_READY") {
      data.bankReadyAt = new Date();
      data.bankReadyBy = { connect: { id: opts.actorId } };
      data.complianceHoldReason = null;
    }
    if (opts.to === "ON_HOLD") {
      data.complianceHoldReason = opts.reason!.trim();
    }
    if (opts.to === "REJECTED") {
      data.complianceHoldReason = opts.reason!.trim();
    }
    if (opts.to === "READY_FOR_REVIEW" || opts.to === "MISSING_INFO") {
      // clearing prior approval traces if explicitly walked back
      if (from === "OKU_APPROVED" || from === "AWAITING_BANK_CONFIRMATION" || from === "BANK_READY") {
        data.okuApprovedAt = null;
        data.okuApprovedBy = { disconnect: true };
        data.bankReadyAt = null;
        data.bankReadyBy = { disconnect: true };
      }
    }

    const next = await tx.beneficiaryProfile.update({
      where: { userId: opts.targetUserId },
      data,
    });

    await writeAudit(tx, opts.actorId, "beneficiary.status.transition", {
      targetUserId: opts.targetUserId,
      before: from,
      after: opts.to,
      reason: opts.reason?.trim() || null,
    });
    return {
      view: toView(next),
      notify: {
        email: p.user?.email ?? null,
        name: p.user?.name ?? null,
        optOut: next.statusEmailOptOut,
        preferredLanguage:
          p.user?.profile?.language ?? p.user?.influencer?.preferredLanguage ?? null,
      },
    };
  });

  // Fire-and-forget notification AFTER the transaction commits — never
  // block or fail the state-machine transition on email delivery.
  if (result.notify) {
    void sendBeneficiaryStatusEmail({
      toEmail: result.notify.email,
      toName: result.notify.name,
      to: opts.to,
      reason: opts.reason?.trim() || null,
      optOut: result.notify.optOut,
      locale: resolvePreferredLocale(result.notify.preferredLanguage),
    });
  }
  return result.view;
}

// ─── Payout-batch hook ─────────────────────────────────────────────────────

/**
 * Used by the payout batch service to assert a single user is fully
 * payout-ready. Returns blocking reasons (empty when ready). Does NOT
 * throw — caller decides how to surface the error (the batch flow lists
 * all blocked beneficiaries together, not just the first failure).
 */
export async function assertPayoutReady(userId: string): Promise<PayoutReadinessResult> {
  const p = await prisma.beneficiaryProfile.findUnique({ where: { userId } });
  return evaluatePayoutReadiness(p);
}

/** Bulk check used by previewBatch; returns { userId → result }. */
export async function assertPayoutReadyMany(
  userIds: string[],
): Promise<Map<string, PayoutReadinessResult>> {
  const out = new Map<string, PayoutReadinessResult>();
  if (userIds.length === 0) return out;
  const rows = await prisma.beneficiaryProfile.findMany({
    where: { userId: { in: userIds } },
  });
  const byUser = new Map<string, BeneficiaryProfile>();
  for (const r of rows) byUser.set(r.userId, r);
  for (const uid of userIds) out.set(uid, evaluatePayoutReadiness(byUser.get(uid) ?? null));
  return out;
}

// ─── Document upload → auto status promotion ─────────────────────────────
//
// When a beneficiary uploads a file for one of the four tracked document
// types, the corresponding status flag on the profile auto-promotes
// MISSING → RECEIVED (and reverts RECEIVED → MISSING when the last
// non-deleted file of that type is removed). VERIFIED, REJECTED, and
// NOT_REQUIRED are never auto-changed — admins keep full control of
// terminal/exempt states. INCOME_CERTIFICATION has no doc-status field
// (it uses required + expiry), so it's a no-op here.
// ──────────────────────────────────────────────────────────────────────────

type DocStatusField =
  | "proofOfAddressStatus"
  | "identificationStatus"
  | "taxOrRucStatus"
  | "sourceOfFundsStatus";

const DOC_TYPE_TO_STATUS_FIELD: Record<string, DocStatusField | null> = {
  PROOF_OF_ADDRESS: "proofOfAddressStatus",
  IDENTIFICATION: "identificationStatus",
  TAX_OR_RUC: "taxOrRucStatus",
  SOURCE_OF_FUNDS: "sourceOfFundsStatus",
  INCOME_CERTIFICATION: null,
};

/**
 * Auto-promote MISSING → RECEIVED for the doc type that just had a file
 * uploaded. No-op when the field is anything else (VERIFIED / REJECTED /
 * NOT_REQUIRED / RECEIVED) — admins retain control of those states.
 */
export async function autoPromoteDocStatusOnUpload(opts: {
  profileId: string;
  targetUserId: string;
  actorId: string;
  docType: string;
}): Promise<void> {
  const field = DOC_TYPE_TO_STATUS_FIELD[opts.docType];
  if (!field) return;
  const result = await prisma.beneficiaryProfile.updateMany({
    where: { id: opts.profileId, [field]: "MISSING" } as Prisma.BeneficiaryProfileWhereInput,
    data: { [field]: "RECEIVED" } as Prisma.BeneficiaryProfileUpdateManyMutationInput,
  });
  if (result.count > 0) {
    await writeAudit(prisma, opts.actorId, "beneficiary.document.status.auto_received", {
      targetUserId: opts.targetUserId,
      docType: opts.docType,
      field,
      before: "MISSING",
      after: "RECEIVED",
      reason: "file_uploaded",
    });
  }
}

/**
 * Auto-revert RECEIVED → MISSING after the last non-deleted file of a
 * doc type is soft-deleted. VERIFIED / REJECTED / NOT_REQUIRED stay put.
 * Caller must invoke AFTER the soft-delete is committed so the count
 * reflects the post-delete state.
 */
export async function autoRevertDocStatusOnDelete(opts: {
  profileId: string;
  targetUserId: string;
  actorId: string;
  docType: string;
}): Promise<void> {
  const field = DOC_TYPE_TO_STATUS_FIELD[opts.docType];
  if (!field) return;
  const remaining = await prisma.beneficiaryDocument.count({
    where: {
      profileId: opts.profileId,
      docType: opts.docType as Prisma.BeneficiaryDocumentWhereInput["docType"],
      deletedAt: null,
    },
  });
  if (remaining > 0) return;
  const result = await prisma.beneficiaryProfile.updateMany({
    where: { id: opts.profileId, [field]: "RECEIVED" } as Prisma.BeneficiaryProfileWhereInput,
    data: { [field]: "MISSING" } as Prisma.BeneficiaryProfileUpdateManyMutationInput,
  });
  if (result.count > 0) {
    await writeAudit(prisma, opts.actorId, "beneficiary.document.status.auto_reverted", {
      targetUserId: opts.targetUserId,
      docType: opts.docType,
      field,
      before: "RECEIVED",
      after: "MISSING",
      reason: "last_file_deleted",
    });
  }
}

// ─── Doc-status provenance (audit-log derived; no schema change) ─────────

export type DocStatusSourceKind =
  | "AUTO_UPLOAD"   // beneficiary.document.status.auto_received
  | "AUTO_DELETE"   // beneficiary.document.status.auto_reverted
  | "ADMIN"         // beneficiary.profile.admin_update changed this field
  | "SELF";         // beneficiary.profile.self_update changed this field
                     // (only possible if/when self-service ever opens up
                     // doc fields — currently it doesn't, but we still
                     // surface it correctly if it appears in the audit log)

export type DocStatusSource = {
  source: DocStatusSourceKind;
  at: string;
  actorName: string | null;
};

export type DocStatusSources = Partial<Record<DocStatusField, DocStatusSource>>;

const ALL_DOC_FIELDS: DocStatusField[] = [
  "proofOfAddressStatus",
  "identificationStatus",
  "taxOrRucStatus",
  "sourceOfFundsStatus",
];

/**
 * For each tracked doc-status field, return the most recent provenance
 * entry from the audit log (source kind, timestamp, actor display name).
 * Returns an empty object when nothing has touched the fields. Does NOT
 * back-fill historical pre-audit values (those simply have no entry).
 */
export async function getDocStatusSources(
  targetUserId: string,
): Promise<DocStatusSources> {
  // Scope at the DB level so a beneficiary with old audit entries is not
  // truncated out by a global LIMIT. We OR two shapes:
  //   1) Auto + admin actions:  metadata.targetUserId == targetUserId
  //   2) self_update:           actorId == targetUserId (no metadata.targetUserId)
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        {
          action: {
            in: [
              "beneficiary.document.status.auto_received",
              "beneficiary.document.status.auto_reverted",
              "beneficiary.profile.admin_update",
            ],
          },
          metadata: {
            path: ["targetUserId"],
            equals: targetUserId,
          },
        },
        {
          action: "beneficiary.profile.self_update",
          actorId: targetUserId,
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const out: DocStatusSources = {};
  const actorIds = new Set<string>();

  for (const log of logs) {
    const m = (log.metadata ?? {}) as Record<string, unknown>;
    const metaTarget = typeof m.targetUserId === "string" ? m.targetUserId : null;

    // Only consider entries for this beneficiary. self_update audits are
    // written under actorId === targetUserId with no metadata.targetUserId.
    if (log.action === "beneficiary.profile.self_update") {
      if (log.actorId !== targetUserId) continue;
    } else if (metaTarget !== targetUserId) {
      continue;
    }

    for (const f of ALL_DOC_FIELDS) {
      if (out[f]) continue;
      let kind: DocStatusSourceKind | null = null;
      if (
        log.action === "beneficiary.document.status.auto_received" &&
        m.field === f
      ) kind = "AUTO_UPLOAD";
      else if (
        log.action === "beneficiary.document.status.auto_reverted" &&
        m.field === f
      ) kind = "AUTO_DELETE";
      else if (
        log.action === "beneficiary.profile.admin_update" &&
        Array.isArray(m.changedFields) &&
        (m.changedFields as unknown[]).includes(f)
      ) kind = "ADMIN";
      else if (
        log.action === "beneficiary.profile.self_update" &&
        Array.isArray(m.changedFields) &&
        (m.changedFields as unknown[]).includes(f)
      ) kind = "SELF";

      if (kind) {
        out[f] = {
          source: kind,
          at: log.createdAt.toISOString(),
          actorName: null, // resolved below
        };
        actorIds.add(log.actorId);
      }
    }
    if (ALL_DOC_FIELDS.every(f => out[f])) break;
  }

  if (actorIds.size > 0) {
    // Map actor IDs → displayable name. Auto_* audits use the uploader/
    // deleter as actor, but we display the source kind ("Auto from upload")
    // anyway — the actor name is informational only. SELF audits use the
    // beneficiary themselves; show their name too. ADMIN audits show the
    // admin name.
    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(actorIds) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map(u => [u.id, u.name ?? u.email ?? null]));
    // Re-walk to fill names — we need to know the matching log's actorId
    // per field. Simpler: re-derive from the same loop by tracking it.
    // Since we already lost actorId per field, re-scan logs minimally.
    const remaining = new Set(ALL_DOC_FIELDS.filter(f => out[f] && out[f]!.actorName === null));
    for (const log of logs) {
      if (remaining.size === 0) break;
      const m = (log.metadata ?? {}) as Record<string, unknown>;
      const metaTarget = typeof m.targetUserId === "string" ? m.targetUserId : null;
      const isSelf = log.action === "beneficiary.profile.self_update";
      if (isSelf ? log.actorId !== targetUserId : metaTarget !== targetUserId) continue;
      for (const f of Array.from(remaining)) {
        const entry = out[f]!;
        const matchAuto = (log.action === "beneficiary.document.status.auto_received" && m.field === f && entry.source === "AUTO_UPLOAD")
          || (log.action === "beneficiary.document.status.auto_reverted" && m.field === f && entry.source === "AUTO_DELETE");
        const matchProfile = ((log.action === "beneficiary.profile.admin_update" && entry.source === "ADMIN")
          || (log.action === "beneficiary.profile.self_update" && entry.source === "SELF"))
          && Array.isArray(m.changedFields)
          && (m.changedFields as unknown[]).includes(f);
        if ((matchAuto || matchProfile) && log.createdAt.toISOString() === entry.at) {
          entry.actorName = byId.get(log.actorId) ?? null;
          remaining.delete(f);
        }
      }
    }
  }

  return out;
}

// ─── For-admin-only: decrypt full account # (used by export builder). ─────
//
// Surfacing this is intentionally narrow — only the payout export builder
// (NOT the admin UI list / drawer) should ever need the plaintext account
// number to write into the bank file. Always called server-side; never
// returned through any HTTP route.
export async function decryptAccountNumberForExport(userId: string): Promise<string | null> {
  const p = await prisma.beneficiaryProfile.findUnique({
    where: { userId },
    select: { banescoAccountNumberEncrypted: true },
  });
  if (!p?.banescoAccountNumberEncrypted) return null;
  if (!isEncryptionAvailable()) {
    throw new Error("APP_ENCRYPTION_KEY missing — cannot decrypt account number");
  }
  return decryptSecret(p.banescoAccountNumberEncrypted);
}
