"use client";

/**
 * Pure Referrer Console — profile module.
 *
 * Purely-presentational identity card (name, role label, referral code,
 * optional organization) plus an optional slot for a "menu" tab (e.g. the
 * guest-facing venue menu on streetside). Never fetches or mutates anything.
 */
import type { ReactNode } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import type { ConsoleIdentity } from "./types";

export interface ProfileMenuModuleProps {
  identity: ConsoleIdentity;
  /** i18n key (referrals namespace) for the role-label pill. */
  roleLabelKey: string;
  accent?: string;
}

export function ProfileMenuModule({ identity, roleLabelKey, accent = "#c8a96e" }: ProfileMenuModuleProps) {
  const t = useTranslation();

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px", letterSpacing: "0.02em" }}>
        {t("referrals", "console.profile.title")}
      </h2>
      <div
        style={{
          background: "var(--layer-1, #fff)",
          border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: 12,
          padding: "18px 20px",
        }}
      >
        <div
          style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: accent,
            background: "rgba(0,0,0,0.04)",
            borderRadius: 999,
            padding: "4px 10px",
            marginBottom: 10,
          }}
        >
          {t("referrals", roleLabelKey)}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{identity.displayName}</div>
        {identity.organization && (
          <div style={{ fontSize: 13, color: "var(--color-text-muted, #6b7280)", marginBottom: 10 }}>
            {t("referrals", "console.profile.organizationLabel")}: {identity.organization}
          </div>
        )}
        <div style={{ fontSize: 13, color: "var(--color-text-muted, #6b7280)" }}>
          {t("referrals", "console.profile.codeLabel")}:{" "}
          <span style={{ fontWeight: 700, color: "var(--color-text, #111)" }}>{identity.referralCode}</span>
        </div>
      </div>
    </section>
  );
}

export interface MenuSlotModuleProps {
  children: ReactNode;
}

/** Generic wrapper for an optional "menu" tab (e.g. streetside venue menu). */
export function MenuSlotModule({ children }: MenuSlotModuleProps) {
  return <section style={{ marginBottom: 28 }}>{children}</section>;
}

export default ProfileMenuModule;
