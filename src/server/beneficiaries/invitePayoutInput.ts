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
  const accountNumber = typeof body.bankAccountNumber === "string"
    ? body.bankAccountNumber.replace(/[\s-]/g, "")
    : "";
  const confirmation = typeof body.bankAccountNumberConfirmation === "string"
    ? body.bankAccountNumberConfirmation.replace(/[\s-]/g, "")
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
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: "Enter a valid 3-letter account currency." };
  }
  if (!/^[A-Z0-9]{5,34}$/i.test(accountNumber)) {
    return { ok: false, error: "Enter a valid bank account number (5–34 letters or numbers)." };
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
