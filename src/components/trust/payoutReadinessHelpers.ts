export type PayoutReadinessResult = {
  ready: boolean;
  status: string;
  blockingReasons: string[];
};

export type PayoutEligibilityDisplay = {
  tone: "green" | "amber" | "red";
  label: "Eligible" | "Blocked" | "On hold";
  primaryReason: string | null;
};

export function deriveEligibilityDisplay(
  result: PayoutReadinessResult,
): PayoutEligibilityDisplay {
  if (result.ready) {
    return { tone: "green", label: "Eligible", primaryReason: null };
  }
  const primary = result.blockingReasons[0] ?? "Not yet eligible";
  if (result.status === "ON_HOLD") {
    return { tone: "red", label: "On hold", primaryReason: primary };
  }
  if (result.status === "REJECTED") {
    return { tone: "red", label: "Blocked", primaryReason: primary };
  }
  return { tone: "amber", label: "Blocked", primaryReason: primary };
}
