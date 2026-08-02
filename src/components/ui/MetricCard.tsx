"use client";

export default function MetricCard({
  label,
  value,
  sub,
  accent,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  trend?: { direction: "up" | "down" | "flat"; text: string };
}) {
  return (
    <div
      style={{
        background: accent ? "var(--color-crimson)" : "#fff",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: accent ? "rgba(255,255,255,0.75)" : "var(--color-text-muted)" }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent ? "#fff" : "var(--color-text)", lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.65)" : "var(--color-text-muted)" }}>
          {sub}
        </div>
      )}
      {trend && (
        <div style={{ fontSize: 12, color: trend.direction === "up" ? "#1f8a55" : trend.direction === "down" ? "#c41e3a" : "#999", marginTop: 2 }}>
          {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.text}
        </div>
      )}
    </div>
  );
}
