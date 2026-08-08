"use client";

import { useEffect, useState } from "react";
import { AlertStrip } from "@/components/ui/dashboard/AlertStrip";
import { BANK_VS_KYC_SENTENCE } from "./constants";

export { BANK_VS_KYC_SENTENCE };

export interface ComplianceHoldBannerProps {
  reason: string;
  contactHref?: string;
  contactLabel?: string;
}

export function ComplianceHoldBanner({
  reason,
  contactHref = "mailto:payouts@oku.group",
  contactLabel = "payouts@oku.group",
}: ComplianceHoldBannerProps) {
  // First render = role="alert"; subsequent renders downgrade to role="status".
  const [hasAnnounced, setHasAnnounced] = useState(false);
  useEffect(() => {
    setHasAnnounced(true);
  }, []);

  return (
    <div role={hasAnnounced ? "status" : "alert"}>
      <AlertStrip variant="error">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong>Your beneficiary profile is on hold.</strong>
          <span>Reason: {reason}</span>
          <span>
            Please reply to the email we sent, or contact us at{" "}
            <a href={contactHref} style={{ color: "inherit", textDecoration: "underline" }}>
              {contactLabel}
            </a>
            .
          </span>
          <span style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            {BANK_VS_KYC_SENTENCE}
          </span>
        </div>
      </AlertStrip>
    </div>
  );
}

export default ComplianceHoldBanner;
