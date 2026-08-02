import React from "react";
import Link from "next/link";

interface ModuleCardProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function ModuleCard({
  children,
  href,
  onClick,
  className = "",
  style,
  title,
  subtitle,
  actions,
}: ModuleCardProps) {
  const header = (title || actions) ? (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
      <div>
        {title && <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 400, color: "var(--color-text)", letterSpacing: "-0.01em" }}>{title}</div>}
        {subtitle && <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
    </div>
  ) : null;

  if (href) {
    return (
      <Link href={href} className={`module-card-link ${className}`} style={style}>
        {header}
        {children}
      </Link>
    );
  }

  return (
    <div
      className={`module-card ${className}`}
      style={{ cursor: onClick ? "pointer" : undefined, ...style }}
      onClick={onClick}
    >
      {header}
      {children}
    </div>
  );
}
