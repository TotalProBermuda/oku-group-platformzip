import { PrimaryPanel } from "@/components/ui/dashboard/PrimaryPanel";
import {
  BeneficiaryStatusPill,
  type BeneficiaryStatusValue,
} from "./BeneficiaryStatusPill";
import { BANK_VS_KYC_SENTENCE } from "./constants";

export interface TrustCardProps {
  status: BeneficiaryStatusValue;
  title?: string;
  primaryMessage: string;
  secondaryMessage?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Default true on beneficiary-touching surfaces. */
  showBankVsKycSentence?: boolean;
}

export function TrustCard({
  status,
  title = "Payouts",
  primaryMessage,
  secondaryMessage,
  ctaLabel,
  ctaHref,
  showBankVsKycSentence = true,
}: TrustCardProps) {
  return (
    <section aria-labelledby="trust-card-title">
      <PrimaryPanel
        title={<span id="trust-card-title">{title}</span>}
        actions={<BeneficiaryStatusPill status={status} />}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 15, color: "#1a1614" }}>
            {primaryMessage}
          </p>
          {secondaryMessage && (
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
              {secondaryMessage}
            </p>
          )}
          {ctaLabel && ctaHref && (
            <a
              href={ctaHref}
              style={{
                alignSelf: "flex-start",
                background: "#c41e3a",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                padding: "10px 18px",
                borderRadius: 6,
                textDecoration: "none",
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {ctaLabel}
            </a>
          )}
          {showBankVsKycSentence && (
            <p
              style={{
                margin: 0,
                marginTop: 4,
                paddingTop: 12,
                borderTop: "1px solid var(--color-border, #e5e7eb)",
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              {BANK_VS_KYC_SENTENCE}
            </p>
          )}
        </div>
      </PrimaryPanel>
    </section>
  );
}

export default TrustCard;
