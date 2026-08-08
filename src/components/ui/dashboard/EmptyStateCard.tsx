import React from "react";

interface EmptyStateCardProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export function EmptyStateCard({
  icon = "○",
  title,
  description,
  action,
  compact,
}: EmptyStateCardProps) {
  return (
    <div className="empty-panel" style={compact ? { padding: "32px 20px" } : undefined}>
      <div className="empty-panel-icon">{icon}</div>
      <div className="empty-panel-title">{title}</div>
      {description && <div className="empty-panel-desc">{description}</div>}
      {action && <div>{action}</div>}
    </div>
  );
}
