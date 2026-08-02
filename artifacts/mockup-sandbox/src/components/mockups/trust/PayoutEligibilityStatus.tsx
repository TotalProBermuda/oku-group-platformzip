import { ViewportGallery } from "./_frames";

function Pill({ bg, color, label }: { bg: string; color: string; label: string }) {
  return (
    <span style={{
      background: bg, color, fontSize: 11, fontWeight: 700,
      letterSpacing: "0.04em", textTransform: "uppercase",
      padding: "3px 10px", borderRadius: 20,
    }}>{label}</span>
  );
}

function Row({ stack, pill, label, reason, link }: { stack: boolean; pill: React.ReactNode; label: string; reason?: string; link?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        display: "flex", flexDirection: stack ? "column" : "row",
        alignItems: stack ? "flex-start" : "center", gap: 10, flexWrap: "wrap",
      }}>
        {pill}
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        {reason && <span style={{ fontSize: 13, color: "#6b7280" }}>— {reason}</span>}
      </div>
      {link && (
        <a href="#" style={{
          fontSize: 13, color: "#92700a", background: "#fef9ec",
          padding: "8px 12px", borderRadius: 6, textDecoration: "underline", fontWeight: 600,
        }}>{link}</a>
      )}
    </div>
  );
}

export default function PayoutEligibilityStatusPreview() {
  return (
    <ViewportGallery
      title="PayoutEligibilityStatus"
      description="Single-line Eligible / Blocked verdict — derived from evaluatePayoutReadiness."
      render={(w) => {
        const stack = w < 768;
        return (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            <Row stack={stack} pill={<Pill bg="#e8f5e9" color="#1b5e20" label="Bank-ready" />} label="Eligible" />
            <Row stack={stack} pill={<Pill bg="#fef9ec" color="#92700a" label="Awaiting Banesco" />} label="Blocked" reason="Bank readiness incomplete (AWAITING_BANK_CONFIRMATION)" link="Why is this blocked?" />
            <Row stack={stack} pill={<Pill bg="#fef2f2" color="#991b1b" label="On hold" />} label="On hold" reason="Compliance hold: pending KYC docs" link="Why is this blocked?" />
          </div>
        );
      }}
    />
  );
}
