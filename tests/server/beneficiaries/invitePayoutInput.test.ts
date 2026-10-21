import { describe, expect, it } from "vitest";
import { validateInvitePayoutDetails } from "@/server/beneficiaries/invitePayoutInput";

const validInput = {
  name: "Alex Referrer",
  payoutAuthorization: true,
  bankName: "Another Supported Bank",
  accountHolderName: "Alex Referrer",
  accountType: "CHECKING",
  currency: "USD",
  swiftBic: "bmscpa22",
  bankAccountNumber: "1234-5678 9012",
  bankAccountNumberConfirmation: "123456789012",
};

describe("validateInvitePayoutDetails", () => {
  it("accepts a beneficiary bank separate from OKÜ's Banesco funding account", () => {
    const result = validateInvitePayoutDetails({
      ...validInput,
      bankName: "Another Supported Bank",
    }, "Invited Name");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.bankName).toBe("Another Supported Bank");
  });

  it("accepts an opaque bank-provided account identifier without assuming a bank format", () => {
    const identifier = "AB-12/34 56";
    const result = validateInvitePayoutDetails({
      ...validInput,
      bankAccountNumber: identifier,
      bankAccountNumberConfirmation: identifier,
    }, "Invited Name");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.accountNumber).toBe("AB/3456");
  });

  it("rejects unsupported payout currencies without echoing account data", () => {
    const secretAccountNumber = "PRIVATE-BANK-ACCOUNT-9988";
    const result = validateInvitePayoutDetails({
      ...validInput,
      currency: "EUR",
      bankAccountNumber: secretAccountNumber,
      bankAccountNumberConfirmation: secretAccountNumber,
    }, "Invited Name");
    expect(result).toEqual({
      ok: false,
      error: "Only USD is currently available. Other payout currencies are pending Finance review.",
    });
    expect(JSON.stringify(result)).not.toContain(secretAccountNumber);
  });

  it("rejects oversized or control-character account identifiers without echoing them", () => {
    const oversized = "A".repeat(129);
    const oversizedResult = validateInvitePayoutDetails({
      ...validInput,
      bankAccountNumber: oversized,
      bankAccountNumberConfirmation: oversized,
    }, "Invited Name");
    expect(oversizedResult.ok).toBe(false);
    expect(JSON.stringify(oversizedResult)).not.toContain(oversized);

    const controlChars = "ABCD\u0000EF";
    const controlResult = validateInvitePayoutDetails({
      ...validInput,
      bankAccountNumber: controlChars,
      bankAccountNumberConfirmation: controlChars,
    }, "Invited Name");
    expect(controlResult).toEqual({
      ok: false,
      error: "Enter the account identifier exactly as provided by your bank.",
    });
    expect(JSON.stringify(controlResult)).not.toContain("ABCD");
  });

  it("normalizes bank coordinates and keeps the invited email outside this input", () => {
    const result = validateInvitePayoutDetails(validInput, "Invited Name");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toEqual({
      name: "Alex Referrer",
      bankName: "Banesco",
      accountHolderName: "Alex Referrer",
      accountType: "CHECKING",
      currency: "USD",
      swiftBic: "BMSCPA22",
      accountNumber: "123456789012",
    });
  });

  it("requires explicit authorization before accepting payout details", () => {
    const result = validateInvitePayoutDetails(
      { ...validInput, payoutAuthorization: false },
      "Invited Name",
    );
    expect(result).toEqual({
      ok: false,
      error: "Confirm the bank-details authorization to continue.",
    });
  });

  it("rejects mismatched account-number confirmation", () => {
    const result = validateInvitePayoutDetails(
      { ...validInput, bankAccountNumberConfirmation: "123456789013" },
      "Invited Name",
    );
    expect(result).toEqual({
      ok: false,
      error: "The account numbers do not match.",
    });
  });

  it("rejects malformed account and SWIFT/BIC values", () => {
    expect(validateInvitePayoutDetails(
      { ...validInput, bankAccountNumber: "1234", bankAccountNumberConfirmation: "1234" },
      "Invited Name",
    ).ok).toBe(false);

    expect(validateInvitePayoutDetails(
      { ...validInput, swiftBic: "not-a-bank-code" },
      "Invited Name",
    )).toEqual({
      ok: false,
      error: "Enter a valid 8- or 11-character SWIFT/BIC, or leave it blank.",
    });
  });

  it("uses the invitation name when the form omits one and rejects non-object input", () => {
    const result = validateInvitePayoutDetails({
      ...validInput,
      name: "",
      swiftBic: "",
    }, "Invited Name");
    expect(result.ok && result.data.name).toBe("Invited Name");
    expect(validateInvitePayoutDetails(null, "Invited Name").ok).toBe(false);
  });
});
