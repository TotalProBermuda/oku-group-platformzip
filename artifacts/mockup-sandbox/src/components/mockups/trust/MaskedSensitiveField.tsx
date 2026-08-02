import { ViewportGallery } from "./_frames";

function Lock() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function Read({ last4 }: { last4: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 12px", border: "1px solid #e5e7eb",
      borderRadius: 6, background: "#fff", fontSize: 14,
    }}>
      <Lock />
      <span style={{ letterSpacing: "0.08em" }}>•••• {last4}</span>
      <button style={{
        marginLeft: "auto", background: "none", border: "none",
        color: "#c41e3a", fontWeight: 600, cursor: "pointer",
        padding: "4px 8px", textDecoration: "underline", fontSize: 13,
      }}>Replace</button>
    </div>
  );
}

function Edit() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Lock />
        <input
          defaultValue="4111-1111-1111-1234"
          aria-label="Account number — new value"
          style={{
            flex: 1, padding: "10px 12px",
            border: "1px solid #e5e7eb", borderRadius: 6,
            fontSize: 14, height: 44,
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Encrypted on save. Only the last 4 digits will appear later (will save as •••• 1234).
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <button style={{
          background: "#c41e3a", color: "#fff", border: "none",
          borderRadius: 6, padding: "10px 18px", fontSize: 14, fontWeight: 600,
          cursor: "pointer", minHeight: 44,
        }}>Save</button>
        <button style={{
          background: "none", border: "none", color: "#6b7280",
          fontSize: 14, cursor: "pointer", textDecoration: "underline",
        }}>Cancel</button>
      </div>
    </div>
  );
}

function Disabled() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 12px", border: "1px solid #e5e7eb",
      borderRadius: 6, background: "#f9fafb", color: "#6b7280", fontSize: 14,
    }}>
      <Lock />
      <span>•••• 1234</span>
      <span style={{ marginLeft: "auto", fontSize: 12, color: "#92700a" }}>
        Encryption key unavailable
      </span>
    </div>
  );
}

export default function MaskedSensitiveFieldPreview() {
  return (
    <ViewportGallery
      title="MaskedSensitiveField"
      description="The single way sensitive values reach the UI. Read mode, edit mode, and disabled state."
      render={() => (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <Section label="Read mode"><Read last4="1234" /></Section>
          <Section label="Edit mode (replace, never append)"><Edit /></Section>
          <Section label="Disabled (encryption unavailable)"><Disabled /></Section>
        </div>
      )}
    />
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}
