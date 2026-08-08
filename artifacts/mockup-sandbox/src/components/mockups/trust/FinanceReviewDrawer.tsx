import { ViewportGallery } from "./_frames";

function Drawer() {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
      maxWidth: 560, display: "flex", flexDirection: "column",
    }}>
      <header style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 18 }}>Maria Sanchez — Beneficiary</h3>
        <button style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 18 }}>✕</button>
      </header>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div role="status" style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", borderRadius: 6,
          background: "#fef9ec", color: "#92700a", fontSize: 13, fontWeight: 600,
          border: "1px solid #fde68a",
        }}>
          <span aria-hidden>🔒</span>
          <span>Restricted compliance data — access is logged.</span>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Last viewed by L. García on May 14, 14:22 · last edited by L. García on May 13, 09:10
        </div>
        <Section title="Status">
          <span style={{
            background: "#fef9ec", color: "#92700a", padding: "3px 10px",
            borderRadius: 20, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>Ready for review</span>
        </Section>
        <Section title="Bank info">
          <div style={{ fontSize: 13, color: "#374151" }}>Holder: Maria Sanchez · Banesco · Checking · USD</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 6 }}>
            <span aria-hidden>🔒</span>
            <span>•••• 1234</span>
          </div>
        </Section>
        <Section title="Documents">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            <li style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>ID</span><span style={{ color: "#1b5e20" }}>Verified</span>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>Proof of address</span><span style={{ color: "#92700a" }}>Received</span>
            </li>
          </ul>
        </Section>
        <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
          OKÜ performs beneficiary verification and payout-eligibility checks. Banesco performs formal banking/KYC/AML.
        </p>
      </div>
      <footer style={{
        padding: 12, borderTop: "1px solid #e5e7eb",
        display: "flex", gap: 8, flexWrap: "wrap", background: "#fff",
      }}>
        <button style={primary}>Approve</button>
        <button style={secondary}>Request changes</button>
        <button style={secondary}>Hold</button>
        <a href="#" style={{ color: "#991b1b", fontSize: 13, marginLeft: "auto", alignSelf: "center", textDecoration: "underline" }}>Reject</a>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

const primary: React.CSSProperties = {
  background: "#c41e3a", color: "#fff", border: "none",
  borderRadius: 6, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
const secondary: React.CSSProperties = {
  background: "#fff", color: "#1a1614", border: "1px solid #e5e7eb",
  borderRadius: 6, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

export default function FinanceReviewDrawerPreview() {
  return (
    <ViewportGallery
      title="FinanceReviewDrawer"
      description="Admin desktop drawer for Flow B — banner, audit ribbon, masked fields, sticky footer actions."
      render={() => <div style={{ padding: 24 }}><Drawer /></div>}
    />
  );
}
