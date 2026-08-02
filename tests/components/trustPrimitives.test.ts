import { describe, it, expect } from "vitest";
import {
  ariaLabelEndingIn,
  applyReplacement,
  formatMaskedDisplay,
  lastFourFromInput,
  spacedDigitsForScreenReader,
} from "@/components/trust/maskedFieldHelpers";
import {
  deriveEligibilityDisplay,
  type PayoutReadinessResult,
} from "@/components/trust/payoutReadinessHelpers";
import { evaluatePayoutReadiness } from "@/server/beneficiaries/beneficiaryService";

describe("MaskedSensitiveField helpers", () => {
  it("formats masked display with the last 4 digits only", () => {
    expect(formatMaskedDisplay("1234")).toBe("•••• 1234");
    expect(formatMaskedDisplay("00001234")).toBe("•••• 1234");
    expect(formatMaskedDisplay(null)).toBe("••••");
    expect(formatMaskedDisplay("")).toBe("••••");
  });

  it("emits the screen-reader label 'ending in 1 2 3 4'", () => {
    expect(spacedDigitsForScreenReader("1234")).toBe("1 2 3 4");
    expect(ariaLabelEndingIn("Account number", "1234")).toBe(
      "Account number ending in 1 2 3 4",
    );
    expect(ariaLabelEndingIn("Account number", null)).toBe(
      "Account number not set",
    );
  });

  it("replaces (never appends) the saved value on edit submit", () => {
    // applyReplacement is the single helper the component uses to compute the
    // submitted value — simulating "previous + next" must NOT happen.
    const previous = "9876543210";
    const next = "1234";
    expect(applyReplacement(previous, next)).toBe("1234");
    expect(applyReplacement(previous, next)).not.toBe(previous + next);
    expect(applyReplacement(null, "5555")).toBe("5555");
  });

  it("reduces a noisy edit-mode input to its last 4 digits", () => {
    expect(lastFourFromInput("4111-1111-1111-1234")).toBe("1234");
    expect(lastFourFromInput("abc")).toBe("");
    expect(lastFourFromInput("12")).toBe("12");
  });
});

describe("PayoutEligibilityStatus derivation", () => {
  function makeResult(p: Partial<PayoutReadinessResult>): PayoutReadinessResult {
    return {
      ready: false,
      status: "MISSING_INFO",
      blockingReasons: [],
      ...p,
    };
  }

  it("renders Eligible (green) when evaluatePayoutReadiness returns ready", () => {
    const r = makeResult({ ready: true, status: "BANK_READY" });
    const d = deriveEligibilityDisplay(r);
    expect(d.tone).toBe("green");
    expect(d.label).toBe("Eligible");
    expect(d.primaryReason).toBeNull();
  });

  it("surfaces a single primary reason when blocked (no parallel logic)", () => {
    const r = makeResult({
      ready: false,
      status: "MISSING_INFO",
      blockingReasons: [
        "Bank readiness incomplete (MISSING_INFO)",
        "Some other reason",
      ],
    });
    const d = deriveEligibilityDisplay(r);
    expect(d.tone).toBe("amber");
    expect(d.label).toBe("Blocked");
    expect(d.primaryReason).toBe("Bank readiness incomplete (MISSING_INFO)");
  });

  it("treats ON_HOLD as red 'On hold'", () => {
    const r = makeResult({
      ready: false,
      status: "ON_HOLD",
      blockingReasons: ["Compliance hold: pending KYC docs"],
    });
    const d = deriveEligibilityDisplay(r);
    expect(d.tone).toBe("red");
    expect(d.label).toBe("On hold");
    expect(d.primaryReason).toBe("Compliance hold: pending KYC docs");
  });

  it("treats REJECTED as red 'Blocked'", () => {
    const r = makeResult({
      ready: false,
      status: "REJECTED",
      blockingReasons: ["Beneficiary rejected by OKÜ"],
    });
    const d = deriveEligibilityDisplay(r);
    expect(d.tone).toBe("red");
    expect(d.label).toBe("Blocked");
  });

  it("integrates with the real evaluatePayoutReadiness output (single source of truth)", () => {
    // Feed a profile-shaped object through the real evaluator, then through
    // the component's display deriver — confirms PayoutEligibilityStatus
    // does not introduce parallel logic.
    const missingProfile = evaluatePayoutReadiness(null);
    expect(missingProfile.ready).toBe(false);
    expect(deriveEligibilityDisplay(missingProfile).label).toBe("Blocked");

    const onHold = evaluatePayoutReadiness({
      bankReadinessStatus: "ON_HOLD",
      complianceHoldReason: "Awaiting updated ID",
    } as Parameters<typeof evaluatePayoutReadiness>[0]);
    const onHoldDisplay = deriveEligibilityDisplay(onHold);
    expect(onHoldDisplay.tone).toBe("red");
    expect(onHoldDisplay.label).toBe("On hold");
    expect(onHoldDisplay.primaryReason).toContain("Awaiting updated ID");

    const ready = evaluatePayoutReadiness({
      bankReadinessStatus: "BANK_READY",
      complianceHoldReason: null,
    } as Parameters<typeof evaluatePayoutReadiness>[0]);
    expect(ready.ready).toBe(true);
    expect(deriveEligibilityDisplay(ready).label).toBe("Eligible");
  });
});

describe("MaskedSensitiveField submit semantics", () => {
  it("submits the new value via applyReplacement (never appends to the previous one)", async () => {
    // Simulates the call site inside MaskedSensitiveField.handleSave:
    //   const next = applyReplacement(last4, draft);
    //   await onSubmit(next);
    const previousLast4 = "9876";
    const newCleartext = "4111111111111234";
    const captured: string[] = [];
    const onSubmit = async (next: string) => { captured.push(next); };

    const next = applyReplacement(previousLast4, newCleartext);
    await onSubmit(next);

    expect(captured).toEqual([newCleartext]);
    expect(captured[0]).not.toContain(previousLast4);
    expect(captured[0]).not.toBe(previousLast4 + newCleartext);
  });
});
