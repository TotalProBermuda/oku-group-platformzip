import { ViewportGallery } from "./_frames";

const BANK_VS_KYC =
  "OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.";

function Pill({ tone, label }: { tone: "green" | "amber" | "red" | "gray"; label: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    green: { bg: "#e8f5e9", color: "#1b5e20" },
    amber: { bg: "#fef9ec", color: "#92700a" },
    red: { bg: "#fef2f2", color: "#991b1b" },
    gray: { bg: "#f3f4f6", color: "#6b7280" },
  };
  const s = map[tone];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "3px 10px",
        borderRadius: 20,
      }}
    >
      {label}
    </span>
  );
}

function Card({ tone, label, message }: { tone: "green" | "amber" | "red"; label: string; message: string }) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 24,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 18, color: "#1a1614" }}>
          Payouts
        </h2>
        <Pill tone={tone} label={label} />
      </header>
      <p style={{ margin: 0, fontSize: 15, color: "#1a1614" }}>{message}</p>
      <a
        href="#"
        style={{
          display: "inline-block",
          marginTop: 16,
          background: "#c41e3a",
          color: "#fff",
          padding: "10px 18px",
          borderRadius: 6,
          textDecoration: "none",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Manage your bank info
      </a>
      <p style={{ margin: "16px 0 0", paddingTop: 12, borderTop: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280" }}>
        {BANK_VS_KYC}
      </p>
    </section>
  );
}

export default function TrustCardPreview() {
  return (
    <ViewportGallery
      title="TrustCard"
      description="Payout-trust card on every earner dashboard. Status drives accent colour."
      render={(w) => (
        <div style={{ padding: w >= 768 ? 24 : 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <Card tone="green" label="Bank-ready" message="Bank-ready. You'll receive payouts on the next cycle." />
          <Card tone="amber" label="Awaiting Banesco" message="OKÜ has approved. Waiting on Banesco confirmation." />
          <Card tone="red" label="On hold" message="Your beneficiary profile is on hold." />
        </div>
      )}
    />
  );
}
