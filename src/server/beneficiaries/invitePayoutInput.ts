export type InvitePayoutDetails = {
  name: string;
  bankName: string;
  accountHolderName: string;
  accountType: "CHECKING" | "SAVINGS";
  currency: string;
  swiftBic: string | null;
  accountNumber: string;
};

export type InvitePayoutDetailsResult =
  | { ok: true; data: InvitePayoutDetails }
  | { ok: false; error: string };

/**
 * Validate only payout details collected through an OKÜ referrer invitation.
 * The raw account number is returned to the caller for encryption and must
 * never be logged, persisted outside the encrypted field, or sent back to UI.
 */
export function validateInvitePayoutDetails(
  input: unknown,
  invitedName: string,
): InvitePayoutDetailsResult {
  const body = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  if (body.payoutAuthorization !== true) {
    return { ok: false, error: "Confirm the bank-details authorization to continue." };
  }

  const submittedName = typeof body.name === "string" ? body.name.trim() : "";
  const name = submittedName || invitedName.trim();
  const bankName = typeof body.bankName === "string" ? body.bankName.trim() : "";
  const accountHolderName = typeof body.accountHolderName === "string" ? body.accountHolderName.trim() : "";
  const accountType = body.accountType === "CHECKING" || body.accountType === "SAVINGS"
    ? body.accountType
    : null;
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "USD";
  const swiftBicInput = typeof body.swiftBic === "string" ? body.swiftBic.trim().toUpperCase() : "";
  // Preserve the beneficiary bank's account identifier exactly (apart from
  // surrounding whitespace); the receiving-bank format is not established yet.
  const accountNumber = typeof body.bankAccountNumber === "string"
    ? body.bankAccountNumber.trim()
    : "";
  const confirmation = typeof body.bankAccountNumberConfirmation === "string"
    ? body.bankAccountNumberConfirmation.trim()
    : "";

  if (!name || name.length > 120) {
    return { ok: false, error: "Enter a valid full name." };
  }
  if (!bankName || bankName.length > 120) {
    return { ok: false, error: "Enter the name of your bank." };
  }
  if (!accountHolderName || accountHolderName.length > 120) {
    return { ok: false, error: "Enter the account holder name exactly as shown by your bank." };
  }
  if (!accountType) {
    return { ok: false, error: "Select checking or savings." };
  }
  // USD is the only currency currently offered by the OKÜ payout flow.
  // Banesco's beneficiary transfer contract is not confirmed for other currencies.
  if (currency !== "USD") {
    return { ok: false, error: "Only USD is currently available. Other payout currencies are pending Finance review." };
  }
  // No beneficiary-bank account-number format has been confirmed for OKÜ's
  // transfer route. Accept a bounded opaque identifier and leave route/format
  // verification to Finance; do not guess another bank's local format here.
  if (!accountNumber.trim() || accountNumber.length > 128 || /[\u0000-\u001f\u007f]/.test(accountNumber)) {
    return { ok: false, error: "Enter the account identifier exactly as provided by your bank." };
  }
  if (accountNumber !== confirmation) {
    return { ok: false, error: "The account numbers do not match." };
  }
  if (swiftBicInput && !/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/.test(swiftBicInput)) {
    return { ok: false, error: "Enter a valid 8- or 11-character SWIFT/BIC, or leave it blank." };
  }

  return {
    ok: true,
    data: {
      name,
      bankName,
      accountHolderName,
      accountType,
      currency,
      swiftBic: swiftBicInput || null,
      accountNumber,
    },
  };
}
