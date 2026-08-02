"use client";

import { useTranslation } from "@/components/i18n/LocaleProvider";

interface Props {
  tier: string;
  size?: "sm" | "md" | "lg";
}

const TIER_STYLE: Record<string, { bg: string; color: string; labelKey: string }> = {
  PATRON:           { bg: "var(--color-primary)",    color: "#fff",                labelKey: "badgePatronMember" },
  FOUNDER:          { bg: "#1a1614",                 color: "#e8d5a3",             labelKey: "badgeFounderMember" },
  PENDING_APPROVAL: { bg: "var(--color-warning-bg)", color: "var(--color-warning)", labelKey: "badgePendingApproval" },
  EXPIRED:          { bg: "var(--color-border)",     color: "var(--color-text-muted)", labelKey: "badgeExpired" },
};

const SIZE_STYLE = {
  sm: { fontSize: 11, padding: "3px 8px",  borderRadius: 4, letterSpacing: "0.08em" },
  md: { fontSize: 12, padding: "4px 12px", borderRadius: 5, letterSpacing: "0.10em" },
  lg: { fontSize: 13, padding: "6px 16px", borderRadius: 6, letterSpacing: "0.12em" },
};

export default function MembershipBadge({ tier, size = "md" }: Props) {
  const t = useTranslation();
  const cfg = TIER_STYLE[tier] ?? TIER_STYLE.PATRON;
  const sz  = SIZE_STYLE[size];

  return (
    <span style={{
      display: "inline-block",
      background: cfg.bg,
      color: cfg.color,
      fontWeight: 700,
      fontFamily: "inherit",
      textTransform: "uppercase" as const,
      whiteSpace: "nowrap" as const,
      ...sz,
    }}>
      {t("common", cfg.labelKey)}
    </span>
  );
}
