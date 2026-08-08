import { ViewportGallery } from "./_frames";

function Panel({ open }: { open: boolean }) {
  return (
    <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: 14 }}>
      <details open={open}>
        <summary style={{
          cursor: "pointer", fontSize: 14, fontWeight: 600,
          listStyle: "none", display: "flex", alignItems: "center", gap: 8, minHeight: 32,
        }}>
          <span aria-hidden>🔒</span>
          <span>How we handle your information</span>
          <span aria-hidden style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>▾</span>
        </summary>
        <div style={{ paddingTop: 10, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}>
            We use Resend to deliver email. You can unsubscribe at any time from any newsletter footer.
          </p>
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#6b7280" }}>
            <a href="#" style={{ color: "#c41e3a", textDecoration: "underline" }}>Read full privacy notice</a>
            <span style={{ margin: "0 8px" }}>·</span>
            <span>Last updated: May 15, 2026</span>
          </p>
        </div>
      </details>
    </div>
  );
}

export default function PrivacyNoticePanelPreview() {
  return (
    <ViewportGallery
      title="PrivacyNoticePanel"
      description="Reusable privacy notice excerpt — collapsed by default, surface-keyed copy from the privacy i18n namespace."
      render={() => (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel open={false} />
          <Panel open={true} />
        </div>
      )}
    />
  );
}
