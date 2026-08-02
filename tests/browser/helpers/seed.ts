/**
 * Browser-test helpers — direct DB mutations against the dev database.
 * Used to put a known beneficiary into a specific state before each test.
 *
 * Tagged with `e2e_browser_test:true` in the unused `adminVerificationNotes`
 * column ONLY when status is admin-set (rejected/on-hold) so cleanup can
 * drop test rows precisely without touching real seed data. We DO NOT put
 * the marker into the bank account, holder name, etc — those must remain
 * realistic so the masked-display assertions are meaningful.
 */
import { prisma } from "../../../src/lib/prisma";

export const KNOWN_FULL_ACCOUNT = "1234567890987654";
export const KNOWN_LAST4 = "8654";
export const KNOWN_HOLDER = "TestHolder Browser";
export const KNOWN_BANK = "Banesco Test Branch";
export const KNOWN_HOLD_REASON = "DO-NOT-LEAK-THIS-NOTE-RAW";
export const KNOWN_ADMIN_NOTE = "DO-NOT-LEAK-FINANCE-NOTE";

export async function getUserIdByEmail(email: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) throw new Error(`Test user not found: ${email}. Run npm run seed first.`);
  return u.id;
}

export async function clearBeneficiary(email: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) return;
  await prisma.beneficiaryProfile.deleteMany({ where: { userId: u.id } });
}

type State = "READY_FOR_REVIEW" | "OKU_APPROVED" | "BANK_READY" | "ON_HOLD" | "REJECTED";

/**
 * Build a beneficiary profile in a specific bank-readiness state. The
 * encrypted account number column is set to a sentinel string — we are
 * NOT testing the real encryption pipeline here (separate vitest suite
 * covers that). The browser tests only care about: "the cleartext account
 * number is never rendered to the user; only the last4 hint is."
 */
export async function seedBeneficiary(
  email: string,
  state: State = "OKU_APPROVED",
): Promise<{ userId: string }> {
  const userId = await getUserIdByEmail(email);
  const docOk = "RECEIVED" as const;
  const base = {
    userId,
    bankName: KNOWN_BANK,
    accountHolderName: KNOWN_HOLDER,
    accountType: "CHECKING" as const,
    currency: "USD",
    swiftBic: "BANEPAPA",
    banescoAccountNumberEncrypted: "fake-ciphertext-not-real-do-not-decrypt",
    banescoAccountLast4: KNOWN_LAST4,
    proofOfAddressStatus: docOk,
    identificationStatus: docOk,
    taxOrRucStatus: docOk,
    sourceOfFundsStatus: "NOT_REQUIRED" as const,
    bankReadinessStatus: state,
    okuApprovedAt: state === "OKU_APPROVED" || state === "BANK_READY" ? new Date() : null,
    bankReadyAt: state === "BANK_READY" ? new Date() : null,
    complianceHoldReason: state === "ON_HOLD" ? KNOWN_HOLD_REASON : null,
    adminVerificationNotes: KNOWN_ADMIN_NOTE,
  };
  await prisma.beneficiaryProfile.upsert({
    where: { userId },
    create: base,
    update: base,
  });
  return { userId };
}
