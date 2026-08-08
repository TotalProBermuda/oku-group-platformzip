import { ViewportGallery } from "./_frames";

function Banner() {
  return (
    <div role="status" style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", borderRadius: 6,
      background: "#fef9ec", color: "#92700a", fontSize: 13, fontWeight: 600,
      border: "1px solid #fde68a",
    }}>
      <span aria-hidden>🔒</span>
      <span>Restricted compliance data — access is logged.</span>
    </div>
  );
}

export default function RestrictedDataBannerPreview() {
  return (
    <ViewportGallery
      title="RestrictedDataBanner"
      description="Verbatim, non-dismissable. Pinned at top of FinanceReviewDrawer."
      render={() => <div style={{ padding: 24 }}><Banner /></div>}
    />
  );
}
