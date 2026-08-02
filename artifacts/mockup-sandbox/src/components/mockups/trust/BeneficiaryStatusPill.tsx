import { ViewportGallery } from "./_frames";

const PILLS: Array<[string, string, string]> = [
  ["Missing info", "#f3f4f6", "#6b7280"],
  ["Ready for review", "#fef9ec", "#92700a"],
  ["OKÜ approved", "#fef9ec", "#92700a"],
  ["Awaiting Banesco", "#fef9ec", "#92700a"],
  ["Bank-ready", "#e8f5e9", "#1b5e20"],
  ["Rejected", "#fef2f2", "#991b1b"],
  ["On hold", "#fef2f2", "#991b1b"],
];

export default function BeneficiaryStatusPillPreview() {
  return (
    <ViewportGallery
      title="BeneficiaryStatusPill"
      description="Canonical status pill — wraps StatusChip. Maps 7 statuses to 3 semantic colours + neutral."
      render={() => (
        <div style={{ padding: 24, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {PILLS.map(([label, bg, color]) => (
            <span key={label} style={{
              background: bg, color, fontSize: 11, fontWeight: 700,
              letterSpacing: "0.04em", textTransform: "uppercase",
              padding: "3px 10px", borderRadius: 20,
            }}>{label}</span>
          ))}
        </div>
      )}
    />
  );
}
