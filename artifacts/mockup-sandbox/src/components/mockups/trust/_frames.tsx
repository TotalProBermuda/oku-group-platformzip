import type { ReactNode } from "react";

const VIEWPORTS: Array<{ label: string; width: number }> = [
  { label: "Mobile · 375px", width: 375 },
  { label: "Tablet · 768px", width: 768 },
  { label: "Desktop · 1280px", width: 1280 },
];

export function ViewportGallery({
  title,
  description,
  render,
}: {
  title: string;
  description?: string;
  render: (width: number) => ReactNode;
}) {
  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        background: "#f5f3ee",
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <header style={{ marginBottom: 24, maxWidth: 1320 }}>
        <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 28, color: "#1a1614" }}>
          {title}
        </h1>
        {description && (
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>{description}</p>
        )}
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {VIEWPORTS.map((v) => (
          <section key={v.width}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6b7280",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {v.label}
            </div>
            <div
              style={{
                width: v.width,
                maxWidth: "100%",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {render(v.width)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
