"use client";

import { useState } from "react";
import { PrimaryPanel } from "@/components/ui/dashboard/PrimaryPanel";
import { useTranslation } from "@/i18n/useTranslation";

export type PrivacyNoticeSurface =
  | "beneficiary"
  | "newsletter"
  | "hiring"
  | "reservation"
  | "checkout"
  | "dashboard";

export interface PrivacyNoticeCopy {
  summary: string;
  fullNoticeHref: string;
  lastUpdated: string;
}

export interface PrivacyNoticePanelProps {
  surface: PrivacyNoticeSurface;
  /** When true (default), starts collapsed. */
  collapsedByDefault?: boolean;
  /** Override copy (e.g. when a caller wants a custom one-off summary). */
  copy?: Partial<PrivacyNoticeCopy>;
  /** Locale label, used purely for `lang` hint. */
  locale?: string;
}

/**
 * Privacy notice panel.
 *
 * Copy is read from the `privacy` i18n namespace by default
 * (`noticeHeading`, `notice.surface.<surface>.summary`, `readFullNotice`,
 * `lastUpdated`, `lastUpdatedDate`) so the panel renders in the user's
 * chosen locale (EN/ES/PT). See `replit.md` → "i18n parity rule".
 *
 * The `copy` prop still allows callers to override any field for one-off
 * variants without touching the translation files.
 */
export function PrivacyNoticePanel({
  surface,
  collapsedByDefault = true,
  copy,
  locale,
}: PrivacyNoticePanelProps) {
  const { t } = useTranslation();
  const defaults: PrivacyNoticeCopy = {
    summary: t("privacy", `notice.surface.${surface}.summary`),
    fullNoticeHref: "/privacy/notice",
    lastUpdated: t("privacy", "lastUpdatedDate"),
  };
  const merged: PrivacyNoticeCopy = { ...defaults, ...(copy ?? {}) };
  const [open, setOpen] = useState(!collapsedByDefault);

  return (
    <PrimaryPanel variant="muted">
      <details
        open={open}
        lang={locale}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
        style={{ fontFamily: "var(--font-body, system-ui)" }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            color: "#1a1614",
            listStyle: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 32,
          }}
        >
          <span aria-hidden="true">🔒</span>
          <span>{t("privacy", "noticeHeading")}</span>
          <span
            aria-hidden="true"
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "#6b7280",
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            ▾
          </span>
        </summary>
        <div style={{ paddingTop: 10, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}>{merged.summary}</p>
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#6b7280" }}>
            <a
              href={merged.fullNoticeHref}
              style={{ color: "#c41e3a", textDecoration: "underline" }}
            >
              {t("privacy", "readFullNotice")}
            </a>
            <span style={{ margin: "0 8px" }} aria-hidden="true">·</span>
            <span>{t("privacy", "lastUpdated")}: {merged.lastUpdated}</span>
          </p>
        </div>
      </details>
    </PrimaryPanel>
  );
}

export default PrivacyNoticePanel;
