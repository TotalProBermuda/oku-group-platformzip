import { AlertStrip } from "@/components/ui/dashboard/AlertStrip";
import { BeneficiaryStatusPill, type BeneficiaryStatusValue } from "./BeneficiaryStatusPill";
import {
  deriveEligibilityDisplay,
  type PayoutReadinessResult,
} from "./payoutReadinessHelpers";

export interface PayoutEligibilityStatusProps {
  /** Single source of truth — must be the value returned by evaluatePayoutReadiness. */
  result: PayoutReadinessResult;
  /** Optional CTA shown only when blocked. */
  whyBlockedHref?: string;
  whyBlockedLabel?: string;
  /** Layout — mobile stacks the pill above the reason. */
  layout?: "stacked" | "inline";
}

export function PayoutEligibilityStatus({
  result,
  whyBlockedHref,
  whyBlockedLabel = "Why is this blocked?",
  layout = "inline",
}: PayoutEligibilityStatusProps) {
  const display = deriveEligibilityDisplay(result);
  const pillStatus = (result.status as BeneficiaryStatusValue) || "MISSING_INFO";

  const direction = layout === "stacked" ? "column" : "row";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: direction,
          alignItems: layout === "inline" ? "center" : "flex-start",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <BeneficiaryStatusPill status={pillStatus} />
        <span style={{ fontSize: 14, color: "#1a1614", fontWeight: 600 }}>
          {display.label}
        </span>
        {display.primaryReason && (
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            — {display.primaryReason}
          </span>
        )}
      </div>
      {!result.ready && display.tone !== "green" && whyBlockedHref && (
        <AlertStrip variant={display.tone === "red" ? "error" : "warning"}>
          <a
            href={whyBlockedHref}
            style={{ color: "inherit", fontWeight: 600, textDecoration: "underline" }}
          >
            {whyBlockedLabel}
          </a>
        </AlertStrip>
      )}
    </div>
  );
}

export default PayoutEligibilityStatus;
