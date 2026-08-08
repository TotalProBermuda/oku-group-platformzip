import React from "react";

interface PrimaryPanelProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: "default" | "muted" | "elevated" | "dark";
  className?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

export function PrimaryPanel({
  children,
  title,
  subtitle,
  actions,
  variant = "default",
  className = "",
  style,
  noPadding,
}: PrimaryPanelProps) {
  const cls =
    variant === "muted" ? "panel-muted" :
    variant === "elevated" ? "panel-elevated" :
    variant === "dark" ? "" :
    "panel";

  const darkStyle: React.CSSProperties = variant === "dark" ? {
    background: "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)",
    borderRadius: "var(--radius-panel-lg)",
    padding: noPadding ? undefined : "28px",
    color: "white",
    position: "relative",
    overflow: "hidden",
    boxShadow: "var(--shadow-md)",
  } : {};

  return (
    <div
      className={variant !== "dark" ? `${cls} ${className}` : className}
      style={{
        ...darkStyle,
        ...(noPadding && variant !== "dark" ? { padding: 0 } : {}),
        ...style,
      }}
    >
      {variant === "dark" && (
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 80% 50%, rgba(196,30,58,0.12) 0%, transparent 65%)", pointerEvents: "none" }} />
      )}
      {(title || actions) && (
        <div className="panel-header" style={noPadding ? { padding: "24px 24px 0" } : undefined}>
          <div style={{ flex: 1 }}>
            {title && <div className="panel-title">{title}</div>}
            {subtitle && <div className="panel-subtitle">{subtitle}</div>}
          </div>
          {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      <div style={noPadding && !(title || actions) ? { position: "relative", zIndex: 1 } : { position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
