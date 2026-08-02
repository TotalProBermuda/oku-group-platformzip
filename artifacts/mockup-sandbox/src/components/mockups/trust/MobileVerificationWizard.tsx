import { ViewportGallery } from "./_frames";

function Wizard({ width }: { width: number }) {
  const w = Math.min(width, 480);
  return (
    <div style={{
      width: w, margin: "0 auto",
      background: "#fafaf7", display: "flex", flexDirection: "column",
      minHeight: 640, position: "relative", paddingBottom: 96,
    }}>
      <header style={{ padding: "20px 20px 0" }}>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 8, marginBottom: 16 }}>
          {["Bank info", "Documents", "Review"].map((label, i) => {
            const past = i === 0; const cur = i === 1;
            return (
              <li key={label} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 10px", borderRadius: 6,
                background: cur ? "#fef2f2" : "transparent",
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: past ? "#1f8a55" : cur ? "#c41e3a" : "#fff",
                  color: past || cur ? "#fff" : "#6b7280",
                  border: past ? "1px solid #1f8a55" : cur ? "1px solid #c41e3a" : "1px solid #d1d5db",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                }}>{past ? "✓" : i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: cur ? 600 : 500 }}>{label}</span>
              </li>
            );
          })}
        </ol>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", fontWeight: 600 }}>
          Payouts
        </div>
        <h1 style={{ margin: "6px 0 16px", fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 500 }}>
          Documents
        </h1>
      </header>
      <main style={{ flex: 1, padding: "0 20px", display: "flex", flexDirection: "column", gap: 24 }}>
        <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
          We use these to confirm your identity and address with Banesco.
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {["Identification", "Proof of address", "Tax / RUC"].map((d) => (
            <li key={d} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 14,
            }}>
              <span>{d}</span>
              <span style={{
                background: "#fef9ec", color: "#92700a", fontSize: 11, fontWeight: 700,
                letterSpacing: "0.04em", textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 12,
              }}>Missing</span>
            </li>
          ))}
        </ul>
        <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
          OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.
        </p>
      </main>
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "#fff", borderTop: "1px solid #e5e7eb",
        padding: 12, boxShadow: "0 -4px 12px rgba(0,0,0,0.04)",
      }}>
        <button style={{
          width: "100%", height: 56, background: "#c41e3a", color: "#fff",
          border: "none", borderRadius: 6, fontSize: 16, fontWeight: 600, cursor: "pointer",
        }}>Continue</button>
      </div>
    </div>
  );
}

export default function MobileVerificationWizardPreview() {
  return (
    <ViewportGallery
      title="MobileVerificationWizard"
      description="Flow A container — full-screen on mobile, constrained to 480px on desktop."
      render={(w) => <Wizard width={w} />}
    />
  );
}
