import { ViewportGallery } from "./_frames";

type State = "past" | "current" | "future";
const STEPS: Array<{ label: string; state: State; caption?: string }> = [
  { label: "Submitted", state: "past", caption: "May 1" },
  { label: "OKÜ approval", state: "past", caption: "May 3" },
  { label: "Sent to Banesco", state: "current" },
  { label: "Banesco confirmation", state: "future" },
  { label: "Bank-ready", state: "future" },
];

function Stepper({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const isH = orientation === "horizontal";
  return (
    <ol
      style={{
        listStyle: "none", margin: 0, padding: 0,
        display: "flex", flexDirection: isH ? "row" : "column",
        gap: isH ? 8 : 14, flexWrap: isH ? "wrap" : "nowrap",
      }}
    >
      {STEPS.map((s, i) => {
        const past = s.state === "past";
        const cur = s.state === "current";
        return (
          <li key={i} style={{
            display: "flex", flexDirection: isH ? "column" : "row",
            alignItems: isH ? "center" : "flex-start", gap: isH ? 6 : 12,
            padding: isH ? "6px 10px" : 0, borderRadius: 6,
            background: isH && cur ? "#fef2f2" : "transparent",
          }}>
            <span style={{
              width: 24, height: 24, borderRadius: "50%",
              background: past ? "#1f8a55" : cur ? "#c41e3a" : "#fff",
              color: past || cur ? "#fff" : "#6b7280",
              border: past ? "1px solid #1f8a55" : cur ? "1px solid #c41e3a" : "1px solid #d1d5db",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>{past ? "✓" : i + 1}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: cur ? 600 : 500 }}>{s.label}</div>
              {s.caption && <div style={{ fontSize: 12, color: "#6b7280" }}>{s.caption}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function VerificationStepperPreview() {
  return (
    <ViewportGallery
      title="VerificationStepper"
      description="Five-step beneficiary journey. Vertical on mobile, horizontal on desktop."
      render={(w) => (
        <div style={{ padding: 24 }}>
          <Stepper orientation={w >= 1024 ? "horizontal" : "vertical"} />
        </div>
      )}
    />
  );
}
