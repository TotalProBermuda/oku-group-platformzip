"use client";

import { useContext } from "react";
import { LocaleContext } from "@/components/i18n/LocaleProvider";

type StatusKey =
  | "PAID" | "PENDING" | "REFUNDED" | "FAILED" | "CANCELLED" | "PARTIALLY_REFUNDED"
  | "ACTIVE" | "SUSPENDED" | "LOCKED" | "ARCHIVED" | "BANNED" | "PASSWORD_RESET_REQUIRED"
  | "PUBLISHED" | "DRAFT" | "ENDED" | "INACTIVE" | "SOLD_OUT"
  | "OPEN" | "CLOSED" | "PROCESSING"
  | "COMMISSION_EARNED" | "COMMISSION_REVERSED" | "COMMISSION_PAID"
  | "NEW" | "SCREENING" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED" | "WITHDRAWN"
  | "INITIATED" | "SETTLED" | "VOIDED" | "CAPTURED"
  | string;

interface StyleEntry { bg: string; color: string; dot?: string }

const STATUS_MAP: Record<string, StyleEntry> = {
  PAID:                    { bg: "#ecfdf5", color: "#065f46", dot: "#10b981" },
  CAPTURED:                { bg: "#ecfdf5", color: "#065f46", dot: "#10b981" },
  SETTLED:                 { bg: "#ecfdf5", color: "#065f46", dot: "#10b981" },
  ACTIVE:                  { bg: "#ecfdf5", color: "#065f46", dot: "#10b981" },
  PUBLISHED:               { bg: "#ecfdf5", color: "#065f46", dot: "#10b981" },
  COMMISSION_EARNED:       { bg: "#ecfdf5", color: "#065f46", dot: "#10b981" },
  HIRED:                   { bg: "#ecfdf5", color: "#065f46", dot: "#10b981" },
  CLOSED:                  { bg: "#ecfdf5", color: "#065f46", dot: "#10b981" },

  PENDING:                 { bg: "#fffbeb", color: "#92400e", dot: "#f59e0b" },
  PROCESSING:              { bg: "#fffbeb", color: "#92400e", dot: "#f59e0b" },
  INITIATED:               { bg: "#fffbeb", color: "#92400e", dot: "#f59e0b" },
  DRAFT:                   { bg: "#fffbeb", color: "#92400e", dot: "#f59e0b" },
  SCREENING:               { bg: "#fffbeb", color: "#92400e", dot: "#f59e0b" },
  INTERVIEW:               { bg: "#eff6ff", color: "#1e40af", dot: "#3b82f6" },
  OFFER:                   { bg: "#f5f3ff", color: "#5b21b6", dot: "#8b5cf6" },
  SUSPENDED:               { bg: "#fffbeb", color: "#92400e", dot: "#f59e0b" },
  PASSWORD_RESET_REQUIRED: { bg: "#fff7ed", color: "#9a3412", dot: "#f97316" },
  OPEN:                    { bg: "#fff7ed", color: "#9a3412", dot: "#f97316" },
  COMMISSION_PAID:         { bg: "#eff6ff", color: "#1e40af", dot: "#3b82f6" },
  NEW:                     { bg: "#eff6ff", color: "#1e40af", dot: "#3b82f6" },

  REFUNDED:                { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },
  FAILED:                  { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },
  CANCELLED:               { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },
  LOCKED:                  { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },
  BANNED:                  { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },
  REJECTED:                { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },
  WITHDRAWN:               { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },
  VOIDED:                  { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },
  INACTIVE:                { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },
  SOLD_OUT:                { bg: "#fdf2f4", color: "#9f1239", dot: "#e11d48" },

  ARCHIVED:                { bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
  ENDED:                   { bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
  COMMISSION_REVERSED:     { bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
  PARTIALLY_REFUNDED:      { bg: "#fef9c3", color: "#713f12", dot: "#ca8a04" },
};

const LABEL_FALLBACK: Record<string, string> = {
  COMMISSION_EARNED:       "Earned",
  COMMISSION_PAID:         "Paid",
  COMMISSION_REVERSED:     "Reversed",
  PASSWORD_RESET_REQUIRED: "Reset Required",
  PARTIALLY_REFUNDED:      "Part. Refunded",
};

const TRANSLATABLE_KEYS = new Set([
  "DRAFT", "PUBLISHED", "ACTIVE", "INACTIVE", "ENDED", "SOLD_OUT",
]);

export default function StatusBadge({
  status,
  labelOverride,
  size = "sm",
  dot = false,
}: {
  status: StatusKey;
  labelOverride?: string;
  size?: "xs" | "sm" | "md";
  dot?: boolean;
}) {
  const ctx = useContext(LocaleContext);
  const key = status?.toUpperCase() ?? "";
  const style: StyleEntry = STATUS_MAP[key] ?? { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af" };

  let label: string;
  if (labelOverride) {
    label = labelOverride;
  } else if (ctx && TRANSLATABLE_KEYS.has(key)) {
    const translated = ctx.t("admin", `status.${key}`);
    label = translated !== `status.${key}` ? translated : (LABEL_FALLBACK[key] ?? key.replace(/_/g, " "));
  } else {
    label = LABEL_FALLBACK[key] ?? key.replace(/_/g, " ");
  }

  const padding =
    size === "xs" ? "2px 6px" : size === "md" ? "5px 14px" : "3px 9px";
  const fontSize = size === "xs" ? 10 : size === "md" ? 12 : 11;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: dot ? 5 : 0,
        padding,
        borderRadius: 20,
        background: style.bg,
        color: style.color,
        fontSize,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: style.dot,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}
