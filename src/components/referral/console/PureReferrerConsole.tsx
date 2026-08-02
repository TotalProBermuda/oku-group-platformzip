"use client";

/**
 * Pure Referrer Console — shell.
 *
 * Config-driven shell: renders a themed header + tab bar from a resolved
 * `ConsoleConfig` (see `roleConfig.ts`) and composes the QR / Activity /
 * Earnings / Profile / Menu modules. This is the ONE shell every pure
 * referrer archetype (streetside, referrer, taxi, concierge, tour guide,
 * promoter) is meant to render — surfaces differ only via `ConsoleConfig`
 * (label/theme/tabs), never via bespoke markup.
 *
 * Wired routes: /referrer/dashboard (slice B). Streetside and influencer/partner
 * adoption follows in subsequent slices.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import type { MyReferralsData } from "@/components/referral/MyReferralsFeed";
import type { ConsoleConfig, ConsoleIdentity, ConsoleTabKey } from "./types";
import { QRModule } from "./QRModule";
import { ActivityModule } from "./ActivityModule";
import { EarningsModule } from "./EarningsModule";
import { ProfileMenuModule, MenuSlotModule } from "./ProfileMenuModule";

export interface PureReferrerConsoleProps {
  config: ConsoleConfig;
  identity: ConsoleIdentity;
  destinationPath?: string;
  manualEntryPath?: string;
  appendRefQuery?: boolean;
  qrTagline?: string;
  feedData?: MyReferralsData;
  feedEndpoint?: string;
  feedPollMs?: number;
  locale?: string;
  manageBeneficiaryHref?: string;
  /** Content for the "offers" tab (assigned-offer wallet — private, not guest-facing). */
  offersSlot?: ReactNode;
  /** Content for the optional "menu" tab (e.g. guest-facing venue menu). */
  menuSlot?: ReactNode;
}

const TAB_LABEL_KEY: Record<ConsoleTabKey, string> = {
  qr: "console.tab.qr",
  offers: "console.tab.offers",
  activity: "console.tab.activity",
  earnings: "console.tab.earnings",
  profile: "console.tab.profile",
  menu: "console.tab.menu",
};

export function PureReferrerConsole({
  config,
  identity,
  destinationPath,
  manualEntryPath,
  appendRefQuery,
  qrTagline,
  feedData,
  feedEndpoint,
  feedPollMs,
  locale,
  manageBeneficiaryHref,
  offersSlot,
  menuSlot,
}: PureReferrerConsoleProps) {
  const t = useTranslation();
  const [activeTab, setActiveTab] = useState<ConsoleTabKey>(config.defaultTab);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "0.01em" }}>
          {t("referrals", "console.title")}
        </h1>
      </header>

      <nav
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 20,
          borderBottom: "1px solid var(--color-border, #e5e7eb)",
          overflowX: "auto",
        }}
      >
        {config.tabs.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "10px 14px",
                border: "none",
                borderBottom: isActive ? `2px solid ${config.theme.accent}` : "2px solid transparent",
                background: "transparent",
                color: isActive ? "var(--color-text, #111)" : "var(--color-text-muted, #6b7280)",
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t("referrals", TAB_LABEL_KEY[tab])}
            </button>
          );
        })}
      </nav>

      {activeTab === "qr" && (
        <QRModule
          referralCode={identity.referralCode}
          capabilities={config.capabilities}
          destinationPath={destinationPath}
          manualEntryPath={manualEntryPath}
          appendRefQuery={appendRefQuery}
          tagline={qrTagline}
        />
      )}

      {activeTab === "offers" && (
        <div>{offersSlot ?? null}</div>
      )}

      {activeTab === "activity" && (
        <ActivityModule data={feedData} endpoint={feedEndpoint} pollMs={feedPollMs} locale={locale} />
      )}

      {activeTab === "earnings" && <EarningsModule data={feedData} manageBeneficiaryHref={manageBeneficiaryHref} />}

      {activeTab === "profile" && <ProfileMenuModule identity={identity} roleLabelKey={config.roleLabelKey} accent={config.theme.accent} />}

      {activeTab === "menu" && config.capabilities.showMenuTab && <MenuSlotModule>{menuSlot}</MenuSlotModule>}
    </div>
  );
}

export default PureReferrerConsole;
