import * as React from "react";

interface AdminPageShellProps {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  kpiRow?: React.ReactNode;
  filterBar?: React.ReactNode;
  children: React.ReactNode;
  hero?: React.ReactNode;
}

export default function AdminPageShell({
  eyebrow,
  title,
  subtitle,
  actions,
  kpiRow,
  filterBar,
  children,
  hero,
}: AdminPageShellProps) {
  return (
    <div className="admin-page-shell">
      {hero}
      {(eyebrow || title || subtitle || actions) && (
        <header className="admin-page-header">
          <div className="admin-page-header-text">
            {eyebrow && <div className="dash-eyebrow admin-page-eyebrow">{eyebrow}</div>}
            {title && <h1 className="admin-page-title">{title}</h1>}
            {subtitle && <p className="admin-page-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="admin-page-actions">{actions}</div>}
        </header>
      )}
      {kpiRow && <section className="admin-page-kpi-row">{kpiRow}</section>}
      {filterBar && <section className="admin-page-filter-bar">{filterBar}</section>}
      <section className="admin-page-content">{children}</section>
    </div>
  );
}
