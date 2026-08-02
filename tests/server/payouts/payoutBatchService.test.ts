import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockPrisma as mp, resetMockPrisma } from "../../helpers/mockPrisma";

vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("../../helpers/mockPrisma")).mockPrisma.client,
}));
vi.mock("@/server/payouts/payoutAudit", () => ({
  logPayoutBatchAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  previewBatch,
  createDraft,
  submitForApproval,
  approve,
  assertBeneficiaryReadinessForInfluencers,
} from "@/server/payouts/payoutBatchService";

beforeEach(() => {
  resetMockPrisma();
});

function bankReadyProfile(userId: string) {
  return mp.seedProfile(userId, {
    banescoAccountNumberEncrypted: "enc:OK",
    banescoAccountLast4: "0000",
    bankName: "Banesco",
    accountHolderName: "Holder",
    accountType: "CHECKING",
    currency: "USD",
    proofOfAddressStatus: "VERIFIED",
    identificationStatus: "VERIFIED",
    taxOrRucStatus: "VERIFIED",
    bankReadinessStatus: "BANK_READY",
    bankReadyAt: new Date(),
  });
}

describe("previewBatch — beneficiary blocking reasons", () => {
  beforeEach(() => {
    // Three influencers, all otherwise eligible (ACTIVE), each with one
    // earned commission line in range. They differ only by beneficiary state.
    mp.seedInfluencer({ id: "inf_missing", userId: "user_missing", displayName: "No Profile" });
    mp.seedInfluencer({ id: "inf_notready", userId: "user_notready", displayName: "Not Bank Ready" });
    mp.seedInfluencer({ id: "inf_hold", userId: "user_hold", displayName: "Compliance Hold" });

    // user_missing has no BeneficiaryProfile.
    // user_notready has a profile but only READY_FOR_REVIEW.
    mp.seedProfile("user_notready", { bankReadinessStatus: "READY_FOR_REVIEW" });
    // user_hold is ON_HOLD.
    mp.seedProfile("user_hold", {
      bankReadinessStatus: "ON_HOLD",
      complianceHoldReason: "Sanctions check",
    });

    const inRange = new Date("2025-06-15");
    mp.seedLedgerEntry({ id: "le_1", influencerId: "inf_missing", amountCents: 1000, createdAt: inRange });
    mp.seedLedgerEntry({ id: "le_2", influencerId: "inf_notready", amountCents: 2000, createdAt: inRange });
    mp.seedLedgerEntry({ id: "le_3", influencerId: "inf_hold", amountCents: 3000, createdAt: inRange });
  });

  it("surfaces BENEFICIARY_PROFILE_MISSING / BANK_NOT_READY / COMPLIANCE_HOLD", async () => {
    const preview = await previewBatch({
      from: new Date("2025-06-01"),
      to: new Date("2025-06-30"),
    });

    const reasons = new Map(preview.byInfluencer.map(b => [b.influencerId, b.blockReason]));
    expect(reasons.get("inf_missing")).toBe("BENEFICIARY_PROFILE_MISSING");
    expect(reasons.get("inf_notready")).toBe("BANK_NOT_READY");
    expect(reasons.get("inf_hold")).toBe("COMPLIANCE_HOLD");

    expect(preview.eligibleLines).toHaveLength(0);
    expect(preview.blockedLines).toHaveLength(3);
    expect(preview.totals.blockedLineCount).toBe(3);
    expect(preview.totals.blockedCents).toBe(6000);
  });

  it("classifies a fully BANK_READY influencer as eligible", async () => {
    mp.seedInfluencer({ id: "inf_ok", userId: "user_ok", displayName: "All Good" });
    bankReadyProfile("user_ok");
    mp.seedLedgerEntry({
      id: "le_ok",
      influencerId: "inf_ok",
      amountCents: 5000,
      createdAt: new Date("2025-06-15"),
    });

    const preview = await previewBatch({
      from: new Date("2025-06-01"),
      to: new Date("2025-06-30"),
    });

    const ok = preview.byInfluencer.find(b => b.influencerId === "inf_ok");
    expect(ok?.isBlocked).toBe(false);
    expect(ok?.blockReason).toBeUndefined();
    expect(preview.eligibleLines.some(l => l.ledgerEntryId === "le_ok")).toBe(true);
  });
});

describe("payout-batch gating — createDraft / submitForApproval / approve", () => {
  it("createDraft refuses and lists every blocked beneficiary by display name", async () => {
    mp.seedInfluencer({ id: "inf_a", userId: "user_a", displayName: "Alice Star" });
    mp.seedInfluencer({ id: "inf_b", userId: "user_b", displayName: "Bob Hold" });
    mp.seedInfluencer({ id: "inf_c", userId: "user_c", displayName: "Carol Ready" });
    bankReadyProfile("user_c");
    mp.seedProfile("user_b", {
      bankReadinessStatus: "ON_HOLD",
      complianceHoldReason: "Compliance review",
    });
    // inf_a has no profile at all → BENEFICIARY_PROFILE_MISSING.

    const lA = mp.seedLedgerEntry({ id: "le_a", influencerId: "inf_a", amountCents: 100 });
    const lB = mp.seedLedgerEntry({ id: "le_b", influencerId: "inf_b", amountCents: 200 });
    const lC = mp.seedLedgerEntry({ id: "le_c", influencerId: "inf_c", amountCents: 300 });

    await expect(
      createDraft({
        name: "June",
        from: new Date("2025-06-01"),
        to: new Date("2025-06-30"),
        ledgerEntryIds: [lA.id, lB.id, lC.id],
        createdById: "admin",
      }),
    ).rejects.toThrow(/Alice Star.*Bob Hold|Bob Hold.*Alice Star/);

    expect(mp.store.batches.size).toBe(0);
  });

  it("createDraft succeeds when all beneficiaries are BANK_READY", async () => {
    mp.seedInfluencer({ id: "inf_x", userId: "user_x", displayName: "X" });
    bankReadyProfile("user_x");
    const le = mp.seedLedgerEntry({ id: "le_x", influencerId: "inf_x", amountCents: 1500 });

    const result = await createDraft({
      name: "June",
      from: new Date("2025-06-01"),
      to: new Date("2025-06-30"),
      ledgerEntryIds: [le.id],
      createdById: "admin",
    });

    expect(result.lineCount).toBe(1);
    expect(result.totalCents).toBe(1500);
    expect(mp.store.batches.size).toBe(1);
  });

  it("submitForApproval re-checks readiness and refuses if a beneficiary was demoted after draft", async () => {
    mp.seedInfluencer({ id: "inf_y", userId: "user_y", displayName: "Yvonne Demoted" });
    bankReadyProfile("user_y");
    const le = mp.seedLedgerEntry({ id: "le_y", influencerId: "inf_y", amountCents: 2000 });

    const { batchId } = await createDraft({
      name: "Test",
      from: new Date("2025-06-01"),
      to: new Date("2025-06-30"),
      ledgerEntryIds: [le.id],
      createdById: "admin",
    });

    // Demote between draft and submit.
    const p = mp.store.profiles.get("user_y")!;
    p.bankReadinessStatus = "ON_HOLD";
    p.complianceHoldReason = "Late review";
    mp.store.profiles.set("user_y", p);

    await expect(
      submitForApproval({ batchId, userId: "admin" }),
    ).rejects.toThrow(/Yvonne Demoted.*COMPLIANCE_HOLD/);
  });

  it("approve refuses when beneficiary slipped to ON_HOLD between submit and approve", async () => {
    mp.seedInfluencer({ id: "inf_z", userId: "user_z", displayName: "Zane Slipped" });
    bankReadyProfile("user_z");
    const le = mp.seedLedgerEntry({ id: "le_z", influencerId: "inf_z", amountCents: 4000 });

    const { batchId } = await createDraft({
      name: "Test",
      from: new Date("2025-06-01"),
      to: new Date("2025-06-30"),
      ledgerEntryIds: [le.id],
      createdById: "maker",
    });
    await submitForApproval({ batchId, userId: "maker" });

    // Slip between submit and approve.
    const p = mp.store.profiles.get("user_z")!;
    p.bankReadinessStatus = "ON_HOLD";
    p.complianceHoldReason = "AML";
    mp.store.profiles.set("user_z", p);

    await expect(
      approve({ batchId, userId: "checker" }),
    ).rejects.toThrow(/Zane Slipped.*COMPLIANCE_HOLD/);
  });

  it("assertBeneficiaryReadinessForInfluencers lists every blocked influencer by name and reason", async () => {
    mp.seedInfluencer({ id: "i1", userId: "u1", displayName: "Person One" });
    mp.seedInfluencer({ id: "i2", userId: "u2", displayName: "Person Two" });
    mp.seedInfluencer({ id: "i3", userId: "u3", displayName: "Person Three" });
    // i1 missing profile → BENEFICIARY_PROFILE_MISSING
    mp.seedProfile("u2", { bankReadinessStatus: "READY_FOR_REVIEW" }); // BANK_NOT_READY
    bankReadyProfile("u3"); // OK

    let captured = "";
    try {
      await assertBeneficiaryReadinessForInfluencers(["i1", "i2", "i3"]);
    } catch (e) {
      captured = (e as Error).message;
    }
    expect(captured).toMatch(/2 influencer\(s\)/);
    expect(captured).toContain("Person One");
    expect(captured).toContain("BENEFICIARY_PROFILE_MISSING");
    expect(captured).toContain("Person Two");
    expect(captured).toContain("BANK_NOT_READY");
    expect(captured).not.toContain("Person Three");
  });

  it("assertBeneficiaryReadinessForInfluencers passes when all are BANK_READY", async () => {
    mp.seedInfluencer({ id: "i_all", userId: "u_all", displayName: "All Ready" });
    bankReadyProfile("u_all");
    await expect(
      assertBeneficiaryReadinessForInfluencers(["i_all"]),
    ).resolves.toBeUndefined();
  });
});
