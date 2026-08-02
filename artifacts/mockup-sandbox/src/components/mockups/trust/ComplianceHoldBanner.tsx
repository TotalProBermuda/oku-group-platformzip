import { ViewportGallery } from "./_frames";

function Banner() {
  return (
    <div role="alert" style={{
      padding: "12px 14px", borderRadius: 6,
      background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b",
      display: "flex", flexDirection: "column", gap: 4, fontSize: 14,
    }}>
      <strong>Your beneficiary profile is on hold.</strong>
      <span>Reason: Identification document expired — please upload a current ID.</span>
      <span>Please reply to the email we sent, or contact us at <a href="mailto:payouts@oku.group" style={{ color: "inherit", textDecoration: "underline" }}>payouts@oku.group</a>.</span>
      <span style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
        OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.
      </span>
    </div>
  );
}

export default function ComplianceHoldBannerPreview() {
  return (
    <ViewportGallery
      title="ComplianceHoldBanner"
      description="Beneficiary-facing red banner. role='alert' on first render, downgrades to role='status'."
      render={() => <div style={{ padding: 24 }}><Banner /></div>}
    />
  );
}
