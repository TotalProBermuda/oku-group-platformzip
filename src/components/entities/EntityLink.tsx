"use client";

import { useCallback } from "react";
import {
  User,
  Layers,
  Calendar,
  ShoppingCart,
  CreditCard,
  Crown,
  DollarSign,
  BookOpen,
  FileText,
  Briefcase,
  Mic,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type EntityType =
  | "user"
  | "series"
  | "session"
  | "order"
  | "payment"
  | "membership"
  | "payout"
  | "ledger"
  | "application"
  | "job"
  | "document"
  | "series_host";

const ENTITY_ICONS: Record<EntityType, LucideIcon> = {
  user: User,
  series: Layers,
  session: Calendar,
  order: ShoppingCart,
  payment: CreditCard,
  membership: Crown,
  payout: DollarSign,
  ledger: BookOpen,
  application: FileText,
  job: Briefcase,
  document: FileText,
  series_host: Mic,
};

interface EntityLinkProps {
  entityType: EntityType;
  entityId: string;
  label: string;
  sublabel?: string;
  showIcon?: boolean;
  variant?: "link" | "pill" | "card";
  onOpen?: (type: EntityType, id: string) => void;
}

export default function EntityLink({
  entityType,
  entityId,
  label,
  sublabel,
  showIcon = true,
  variant = "link",
  onOpen,
}: EntityLinkProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onOpen) onOpen(entityType, entityId);
    },
    [entityType, entityId, onOpen]
  );

  const Icon = ENTITY_ICONS[entityType];

  if (variant === "card") {
    return (
      <button
        onClick={handleClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: "pointer",
          textAlign: "left",
          transition: "box-shadow 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--color-primary)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 0 0 2px var(--color-primary-muted)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--color-border)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
        }}
      >
        {showIcon && (
          <Icon size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
        )}
        <span>
          <div
            style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text)" }}
          >
            {label}
          </div>
          {sublabel && (
            <div
              style={{
                fontSize: 10,
                color: "var(--color-text-muted)",
                marginTop: 1,
              }}
            >
              {sublabel}
            </div>
          )}
        </span>
      </button>
    );
  }

  if (variant === "pill") {
    return (
      <button
        onClick={handleClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "var(--color-primary-muted)",
          border: "none",
          borderRadius: 20,
          padding: "2px 8px",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-primary)",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(196,30,58,0.15)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--color-primary-muted)";
        }}
      >
        {showIcon && <Icon size={11} style={{ flexShrink: 0 }} />}
        {label}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: "var(--color-primary)",
        fontSize: "inherit",
        fontWeight: 600,
        textDecoration: "underline",
        textDecorationColor: "transparent",
        transition: "text-decoration-color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.textDecorationColor =
          "var(--color-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.textDecorationColor =
          "transparent";
      }}
    >
      {showIcon && (
        <Icon size={12} style={{ flexShrink: 0 }} />
      )}
      {label}
    </button>
  );
}
