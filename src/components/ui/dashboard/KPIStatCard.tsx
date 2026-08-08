import React from "react";

interface KPIStatCardProps {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  deltaUp?: boolean;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
  onClick?: () => void;
  loading?: boolean;
}

export function KPIStatCard({
  label,
  value,
  delta,
  deltaUp,
  meta,
  icon,
  accent,
  onClick,
  loading,
}: KPIStatCardProps) {
  return (
    <div
      className="kpi-card"
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : undefined,
        borderTopColor: accent || undefined,
        "--accent-color": accent,
      } as React.CSSProperties}
    >
      {accent && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: accent, opacity: 0.85, borderRadius: "20px 20px 0 0"
        }} />
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="kpi-label">{label}</div>
          {loading ? (
            <div className="skeleton" style={{ height: 38, width: 100, marginBottom: 8, borderRadius: 8 }} />
          ) : (
            <div className="kpi-value">{value}</div>
          )}
          {delta !== undefined && !loading && (
            <div className={`kpi-delta ${deltaUp === true ? "kpi-delta-up" : deltaUp === false ? "kpi-delta-down" : ""}`}>
              {deltaUp === true && "↑ "}
              {deltaUp === false && "↓ "}
              {delta}
            </div>
          )}
          {meta && !loading && (
            <div className="kpi-delta">{meta}</div>
          )}
        </div>
        {icon && (
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "var(--layer-4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
