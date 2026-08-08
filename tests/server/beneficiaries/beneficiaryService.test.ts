import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockPrisma as mp, resetMockPrisma } from "../../helpers/mockPrisma";

vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("../../helpers/mockPrisma")).mockPrisma.client,
}));
vi.mock("@/server/beneficiaries/statusEmail", () => ({
  sendBeneficiaryStatusEmail: vi.fn().mockResolvedValue(undefined),
  resolvePreferredLocale: (v: string | null | undefined) => {
    if (!v) return "en";
    const s = v.toLowerCase();
    if (s.startsWith("es") || s.startsWith("spanish")) return "es";
    if (s.startsWith("pt") || s.startsWith("portuguese")) return "pt";
    return "en";
  },
}));
vi.mock("@/server/security/encryption", () => ({
  isEncryptionAvailable: () => true,
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ""),
  maskSecret: (s: string) => ({ last4: s.slice(-4) }),
}));

import {
  upsertOwnProfile,
  adminUpsertProfile,
  transitionStatus,
  TransitionError,
  getOwnProfile,
  adminGetProfile,
} from "@/server/beneficiaries/beneficiaryService";

beforeEach(() => {
  resetMockPrisma();
});

const completeBank = {
  banescoAccountNumber: "1234567890",
  bankName: "Banesco",
  accountHolderName: "Jane Doe",
  accountType: "CHECKING" as const,
  currency: "USD",
};

describe("beneficiary state machine — auto-promotion", () => {
  it("auto-promotes MISSING_INFO → READY_FOR_REVIEW once info is complete", async () => {
    // Admin has previously verified docs but bank fields were missing.
    mp.seedProfile("user_a", {
      proofOfAddressStatus: "VERIFIED",
      identificationStatus: "VERIFIED",
      taxOrRucStatus: "VERIFIED",
      bankReadinessStatus: "MISSING_INFO",
    });
    const view = await upsertOwnProfile("user_a", completeBank);
    expect(view.status.bankReadinessStatus).toBe("READY_FOR_REVIEW");

    const audits = mp.store.auditLogs.map(a => a.action);
    expect(audits).toContain("beneficiary.profile.ready_for_review");
  });

  it("does NOT promote when info is incomplete (missing bank fields)", async () => {
    const view = await upsertOwnProfile("user_b", { bankName: "Banesco" });
    expect(view.status.bankReadinessStatus).toBe("MISSING_INFO");
  });

  it("does NOT promote when a required document status is MISSING", async () => {
    // Seed a profile that has all bank fields but a doc still MISSING.
    mp.seedProfile("user_c", {
      banescoAccountNumberEncrypted: "enc:1111",
      banescoAccountLast4: "1111",
      bankName: "Banesco",
      accountHolderName: "Jane",
      accountType: "CHECKING",
      currency: "USD",
      proofOfAddressStatus: "MISSING",
    });
    // Touch a non-bank field to trigger the auto-status pass without
    // touching bank coordinates (no demotion path).
    const view = await upsertOwnProfile("user_c", {});
    expect(view.status.bankReadinessStatus).toBe("MISSING_INFO");
  });
});

describe("beneficiary state machine — post-approval demotion on bank-field edit", () => {
  it("demotes BANK_READY → READY_FOR_REVIEW when bank fields change but profile still complete", async () => {
    mp.seedProfile("user_d", {
      banescoAccountNumberEncrypted: "enc:OLD",
      banescoAccountLast4: "OLD0",
      bankName: "Banesco",
      accountHolderName: "Jane",
      accountType: "CHECKING",
      currency: "USD",
      proofOfAddressStatus: "VERIFIED",
      identificationStatus: "VERIFIED",
      taxOrRucStatus: "VERIFIED",
      sourceOfFundsStatus: "NOT_REQUIRED",
      bankReadinessStatus: "BANK_READY",
      okuApprovedAt: new Date("2025-01-01"),
      okuApprovedById: "admin_x",
      bankReadyAt: new Date("2025-01-02"),
      bankReadyById: "admin_y",
    });

    const view = await upsertOwnProfile("user_d", { banescoAccountNumber: "9999888877" });
    expect(view.status.bankReadinessStatus).toBe("READY_FOR_REVIEW");
    expect(view.status.okuApproved).toBe(false);
    expect(view.status.bankReady).toBe(false);
    expect(view.bank.accountLast4).toBe("8877");

    const actions = mp.store.auditLogs.map(a => a.action);
    expect(actions).toContain("beneficiary.profile.reverted_to_review");
  });

  it("demotes OKU_APPROVED → MISSING_INFO when bank fields are wiped (incomplete target)", async () => {
    mp.seedProfile("user_e", {
      banescoAccountNumberEncrypted: "enc:OLD",
      banescoAccountLast4: "OLD0",
      bankName: "Banesco",
      accountHolderName: "Jane",
      accountType: "CHECKING",
      currency: "USD",
      proofOfAddressStatus: "VERIFIED",
      identificationStatus: "VERIFIED",
      taxOrRucStatus: "VERIFIED",
      bankReadinessStatus: "OKU_APPROVED",
      okuApprovedAt: new Date(),
      okuApprovedById: "admin_x",
    });

    const view = await upsertOwnProfile("user_e", { banescoAccountNumber: "" });
    expect(view.status.bankReadinessStatus).toBe("MISSING_INFO");
    expect(view.status.okuApproved).toBe(false);
    expect(view.bank.accountLast4).toBeNull();
    expect(view.bank.hasAccountNumber).toBe(false);
  });

  it("does NOT demote ON_HOLD on bank-field edit", async () => {
    mp.seedProfile("user_f", {
      banescoAccountNumberEncrypted: "enc:OLD",
      banescoAccountLast4: "OLD0",
      bankName: "Banesco",
      accountHolderName: "Jane",
      accountType: "CHECKING",
      currency: "USD",
      proofOfAddressStatus: "VERIFIED",
      identificationStatus: "VERIFIED",
      taxOrRucStatus: "VERIFIED",
      bankReadinessStatus: "ON_HOLD",
      complianceHoldReason: "Sanctions check",
    });
    const view = await upsertOwnProfile("user_f", { banescoAccountNumber: "5555444433" });
    expect(view.status.bankReadinessStatus).toBe("ON_HOLD");
  });

  it("does NOT demote REJECTED on bank-field edit", async () => {
    mp.seedProfile("user_g", {
      banescoAccountNumberEncrypted: "enc:OLD",
      banescoAccountLast4: "OLD0",
      bankName: "Banesco",
      accountHolderName: "Jane",
      accountType: "CHECKING",
      currency: "USD",
      proofOfAddressStatus: "VERIFIED",
      identificationStatus: "VERIFIED",
      taxOrRucStatus: "VERIFIED",
      bankReadinessStatus: "REJECTED",
      complianceHoldReason: "Document mismatch",
    });
    const view = await upsertOwnProfile("user_g", { banescoAccountNumber: "5555444433" });
    expect(view.status.bankReadinessStatus).toBe("REJECTED");
  });

  it("admin upsert on a BANK_READY profile also demotes when bank fields change", async () => {
    mp.seedProfile("user_h", {
      banescoAccountNumberEncrypted: "enc:OLD",
      banescoAccountLast4: "OLD0",
      bankName: "Banesco",
      accountHolderName: "Jane",
      accountType: "CHECKING",
      currency: "USD",
      proofOfAddressStatus: "VERIFIED",
      identificationStatus: "VERIFIED",
      taxOrRucStatus: "VERIFIED",
      bankReadinessStatus: "BANK_READY",
      okuApprovedAt: new Date(),
      bankReadyAt: new Date(),
    });
    const view = await adminUpsertProfile("user_h", "admin_z", { bankName: "Banco General" });
    expect(view.status.bankReadinessStatus).toBe("READY_FOR_REVIEW");
  });

  it("editing a non-bank field (notes only) does NOT demote BANK_READY", async () => {
    mp.seedProfile("user_i", {
      banescoAccountNumberEncrypted: "enc:OLD",
      banescoAccountLast4: "OLD0",
      bankName: "Banesco",
      accountHolderName: "Jane",
      accountType: "CHECKING",
      currency: "USD",
      proofOfAddressStatus: "VERIFIED",
      identificationStatus: "VERIFIED",
      taxOrRucStatus: "VERIFIED",
      bankReadinessStatus: "BANK_READY",
      okuApprovedAt: new Date(),
      bankReadyAt: new Date(),
    });
    const view = await adminUpsertProfile("user_i", "admin_z", {
      adminVerificationNotes: "Looks good — checked twice.",
    });
    expect(view.status.bankReadinessStatus).toBe("BANK_READY");
  });
});

describe("beneficiary state machine — illegal transitions", () => {
  it("throws TransitionError on illegal MISSING_INFO → BANK_READY jump", async () => {
    mp.seedProfile("user_j", { bankReadinessStatus: "MISSING_INFO" });
    await expect(
      transitionStatus({ targetUserId: "user_j", actorId: "admin", to: "BANK_READY" }),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it("throws TransitionError on OKU_APPROVED while info is incomplete", async () => {
    mp.seedProfile("user_k", { bankReadinessStatus: "READY_FOR_REVIEW" }); // no bank fields
    await expect(
      transitionStatus({ targetUserId: "user_k", actorId: "admin", to: "OKU_APPROVED" }),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it("throws TransitionError on ON_HOLD without a reason", async () => {
    mp.seedProfile("user_l", { bankReadinessStatus: "READY_FOR_REVIEW" });
    await expect(
      transitionStatus({ targetUserId: "user_l", actorId: "admin", to: "ON_HOLD" }),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it("throws TransitionError when profile does not exist", async () => {
    await expect(
      transitionStatus({ targetUserId: "ghost", actorId: "admin", to: "READY_FOR_REVIEW" }),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it("self-service GET and PATCH both null adminVerificationNotes; admin GET keeps them", async () => {
    mp.seedProfile("user_n", {
      banescoAccountNumberEncrypted: "enc:1234567890",
      banescoAccountLast4: "7890",
      bankName: "Banesco",
      accountHolderName: "Jane",
      accountType: "CHECKING",
      currency: "USD",
      proofOfAddressStatus: "VERIFIED",
      identificationStatus: "VERIFIED",
      taxOrRucStatus: "VERIFIED",
      bankReadinessStatus: "OKU_APPROVED",
      okuApprovedAt: new Date(),
      okuApprovedById: "admin_x",
      adminVerificationNotes: "INTERNAL ONLY — do not leak",
    });

    const ownGet = await getOwnProfile("user_n");
    expect(ownGet?.adminVerificationNotes).toBeNull();

    const ownPatch = await upsertOwnProfile("user_n", { accountHolderName: "Jane Doe" });
    expect(ownPatch.adminVerificationNotes).toBeNull();

    const adminGet = await adminGetProfile("user_n");
    expect(adminGet?.adminVerificationNotes).toBe("INTERNAL ONLY — do not leak");
  });

  it("allows valid READY_FOR_REVIEW → OKU_APPROVED with complete info", async () => {
    mp.seedProfile("user_m", {
      banescoAccountNumberEncrypted: "enc:1234567890",
      banescoAccountLast4: "7890",
      bankName: "Banesco",
      accountHolderName: "Jane",
      accountType: "CHECKING",
      currency: "USD",
      proofOfAddressStatus: "VERIFIED",
      identificationStatus: "VERIFIED",
      taxOrRucStatus: "VERIFIED",
      bankReadinessStatus: "READY_FOR_REVIEW",
    });
    const view = await transitionStatus({
      targetUserId: "user_m",
      actorId: "admin_q",
      to: "OKU_APPROVED",
    });
    expect(view.status.bankReadinessStatus).toBe("OKU_APPROVED");
    expect(view.status.okuApproved).toBe(true);
  });
});
