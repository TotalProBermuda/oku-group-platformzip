"use client";

/**
 * Referrer dashboard — Slice B of the Pure Referrer Console migration.
 *
 * Feed source: ActivityModule → /api/v1/me/referrals (the one governed source,
 * identical to influencer/partner surfaces — NOT the legacy /api/v1/referrer/dashboard
 * BookingRow list or CommissionEntry-derived stats).
 *
 * The compat endpoint /api/v1/referrer/dashboard is called for identity only:
 * referralCode, fullName, organizationName, actorTypeCode/referrerType (for
 * archetype resolution so a TAXI_DRIVER gets the yellow TAXI console theme, a
 * concierge gets purple, etc.). Stats, attributions, and commissions in the
 * response are intentionally ignored — they contain legacy paid/approved figures
 * that must not surface in the console core. Earnings shown here are accrual-only
 * via /api/v1/me/referrals rollups.
 *
 * profileSource: "actor" means the profile was resolved from ReferralActor (v2);
 * "legacy" means it fell back to the Referrer table. Both shapes expose the same
 * identity fields consumed here.
 */
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { ShareSurfacePanel } from "@/components/referral/ShareSurfacePanel";
import { PureReferrerConsole } from "@/components/referral/console/PureReferrerConsole";
import { resolveConsoleConfig } from "@/components/referral/console/roleConfig";
import type { ConsoleConfig, ConsoleIdentity } from "@/components/referral/console/types";

/**
 * Only the identity fields we consume from the compat endpoint.
 * stats / attributions / commissions are intentionally excluded from this
 * interface so nothing in this file can accidentally read legacy money figures.
 */
interface ReferrerIdentityPayload {
  referrer: {
    fullName: string;
    /**
     * For v2 actor path: actorTypeCode (e.g. "taxi-driver", "hotel-concierge")
     * or actorType enum (e.g. TAXI_DRIVER) — passed to resolveConsoleConfig.
     * For legacy path: referrerType enum value (e.g. TAXI_DRIVER).
     */
    referrerType: string;
    actorTypeCode: string | null;
    referralCode: string | null;
    organizationName: string | null;
    isActive: boolean;
    profileSource: "actor" | "legacy";
  };
}

export default function ReferrerDashboardPage() {
  const locale = useLocale();
  const { t } = useTranslation();
  const [config, setConfig] = useState<ConsoleConfig | null>(null);
  const [identity, setIdentity] = useState<ConsoleIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noActiveCode, setNoActiveCode] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/referrer/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: ReferrerIdentityPayload & { error?: string }) => {
        if (!alive) return;
        if (d.error) {
          setError(d.error);
          return;
        }
        if (!d.referrer) {
          setError("No referrer profile found");
          return;
        }

        const ref = d.referrer;

        // When the actor has no active ReferralLink, show a specific message
        // rather than the generic "No Referrer Profile" error screen.
        if (ref.profileSource === "actor" && !ref.referralCode) {
          setNoActiveCode(true);
          // Still resolve config so the theme/branding is correct.
          setConfig(
            resolveConsoleConfig({
              roles: ["REFERRER"],
              actorTypeCode: ref.actorTypeCode ?? ref.referrerType ?? null,
            }),
          );
          setIdentity({
            displayName: ref.fullName,
            referralCode: "",
            organization: ref.organizationName ?? undefined,
          });
          return;
        }

        // Resolve console config from actorTypeCode (v2) or referrerType (legacy).
        setConfig(
          resolveConsoleConfig({
            roles: ["REFERRER"],
            actorTypeCode: ref.actorTypeCode ?? ref.referrerType ?? null,
          }),
        );
        setIdentity({
          displayName: ref.fullName,
          referralCode: ref.referralCode ?? "",
          organization: ref.organizationName ?? undefined,
        });
      })
      .catch(() => {
        if (alive) setError("Failed to load referrer profile");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
          <div
            className="rd-spinner"
            style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(200,169,110,0.2)", borderTopColor: "#c8a96e", margin: "0 auto 16px" }}
          />
          <p style={{ fontSize: 14 }}>Loading your dashboard…</p>
        </div>
        <style>{`@keyframes rdspin { to { transform: rotate(360deg); } } .rd-spinner { animation: rdspin 0.8s linear infinite; }`}</style>
      </div>
    );
  }

  // Actor linked but no active referral code — show a specific message, not the
  // generic "No Referrer Profile" error screen.
  if (noActiveCode && config && identity) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #050505 0%, #0a0a0a 100%)", color: "#e5e7eb" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 14px 80px" }}>
          <div style={{
            padding: 32, textAlign: "center", maxWidth: 440, margin: "0 auto",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12, color: "#c8a96e" }}>◎</div>
            <h2 style={{ marginBottom: 8, color: "#fff", fontSize: 18 }}>{t("referrals", "noActiveCode_title")}</h2>
            <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 6 }}>
              {t("referrals", "noActiveCode_setup")}
            </p>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              {t("referrals", "noActiveCode_contact")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !identity || !config) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", padding: 24 }}>
        <div style={{
          padding: 32, textAlign: "center", maxWidth: 400,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12, color: "#c8a96e" }}>◎</div>
          <h2 style={{ marginBottom: 8, color: "#fff", fontSize: 18 }}>No Referrer Profile</h2>
          <p style={{ color: "#9ca3af", fontSize: 14 }}>{error ?? "Profile not found."}</p>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 12 }}>
            Contact your OKÜ account manager to activate your referrer profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #050505 0%, #0a0a0a 100%)", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 14px 80px" }}>

        {/* ── PURE REFERRER CONSOLE (QR / Activity / Earnings / Profile)
            Activity feed: MyReferralsFeed → /api/v1/me/referrals (one governed source).
            No legacy paid/approved figures — earnings tab shows accrual-only rollups
            plus the PayoutTrustSummary bank-readiness card. ──
            CSS custom properties are overridden here so the console's internal
            card surfaces render correctly on the dark dashboard background instead
            of defaulting to light-mode #fff / #e5e7eb values. */}
        <div style={{
          "--layer-1": "rgba(255,255,255,0.04)",
          "--color-border": "rgba(255,255,255,0.08)",
          "--color-text": "#f3f4f6",
          "--color-text-muted": "#9ca3af",
          "--color-bg": "#050505",
        } as React.CSSProperties}>
          <PureReferrerConsole
            config={config}
            identity={identity}
            destinationPath={identity.referralCode ? `/r/${identity.referralCode}` : "/"}
            appendRefQuery={false}
            locale={locale}
            manageBeneficiaryHref="/my/beneficiary"
            offersSlot={<ShareSurfacePanel />}
          />
        </div>
      </div>
    </div>
  );
}
