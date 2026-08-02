import React from "react";

interface AlertStripProps {
  variant: "info" | "warning" | "error" | "success";
  icon?: React.ReactNode;
  children: React.ReactNode;
  onDismiss?: () => void;
}

const ICONS = { info: "ℹ", warning: "⚠", error: "✕", success: "✓" };
const CLASSES = {
  info: "alert-strip alert-strip-info",
  warning: "alert-strip alert-strip-warning",
  error: "alert-strip alert-strip-error",
  success: "alert-strip alert-strip-success",
};

export function AlertStrip({ variant, icon, children, onDismiss }: AlertStripProps) {
  return (
    <div className={CLASSES[variant]}>
      <span className="alert-strip-icon">{icon ?? ICONS[variant]}</span>
      <div style={{ flex: 1 }}>{children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, fontSize: 16, padding: "0 2px", lineHeight: 1 }}
          aria-label="Dismiss"
        >✕</button>
      )}
    </div>
  );
}
