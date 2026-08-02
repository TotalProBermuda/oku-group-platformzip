"use client";

/**
 * Influencer dashboard — Slice D of the Pure Referrer Console migration.
 *
 * Layout:
 *  1. PerformanceSection — influencer-specific funnel/campaign stats (clicks,
 *     bookings, conversion rate, pending commission). This is the influencer
 *     module kept OUTSIDE the shared console core.
 *  2. PureReferrerConsole (core) — QR / Activity / Earnings / Profile tabs.
 *     Activity → /api/v1/me/referrals (one governed source).
 *     Earnings → accrual-only rollups; NO paid figures from the legacy ledger.
 *  3. PayoutDashboard — legacy payout/ledger detail kept intact below the
 *     console. It reads its own endpoints (/api/v1/payout-dashboard/*) and is
 *     intentionally NOT wired into the console core so paid figures stay in
 *     the dedicated payout view and never surface in the shared earnings tab.
 *
 * The dashboard API (/api/v1/influencer/dashboard) is called for identity
 * (refCode, handle, commissionRateBps) and performance stats only. The
 * referral feed shown in the ActivityModule comes from /api/v1/me/referrals
 * via PureReferrerConsole — NOT from the dashboard payload.
 */

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { PayoutDashboard } from "@/components/dashboard/PayoutDashboard";
import { PureReferrerConsole } from "@/components/referral/console/PureReferrerConsole";
import { resolveConsoleConfig } from "@/components/referral/console/roleConfig";
import type { ConsoleConfig, ConsoleIdentity } from "@/components/referral/console/types";

interface InfluencerStats {
  profile: {
    handle: string | null;
    refCode: string | null;
    commissionRateBps: number;
  };
  stats: {
    clicks: number;
    signups: number;
    purchases: number;
    revenueCents: number;
    commissionEarnedCents: number;
    commissionPaidCents: number;
  };
}

const fmt = (cents: number) =>
  "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: "16px 18px",
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function PerformanceSection({ data }: { data: InfluencerStats }) {
  const { stats, profile } = data;
  // Only accrual figures surface here. commissionPaidCents is read from the
  // API but deliberately NOT rendered — paid status stays in PayoutDashboard.
  const pendingCents = Math.max(0, stats.commissionEarnedCents - stats.commissionPaidCents);
  const conversionRate = stats.clicks > 0 ? (stats.purchases / stats.clicks) * 100 : 0;

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
          Performance
        </h2>
        {profile.refCode && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            Code <code style={{ fontFamily: "monospace", fontWeight: 700, color: "#c8a96e" }}>{profile.refCode}</code>
            {" · "}
            <span style={{ color: "#c8a96e" }}>{(profile.commissionRateBps / 100).toFixed(1)}% commission</span>
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatTile
          label="Link Clicks"
          value={stats.clicks.toLocaleString()}
          sub={stats.purchases > 0 ? `${conversionRate.toFixed(1)}% converted` : "All time"}
          color="#f3f4f6"
        />
        <StatTile
          label="Bookings"
          value={stats.purchases.toLocaleString()}
          sub={stats.signups > 0 ? `${stats.signups} signups` : "Paid orders"}
          color="#34d399"
        />
        <StatTile
          label="Accrued Commission"
          value={fmt(pendingCents)}
          sub="Awaiting payout ledger"
          color="#c8a96e"
        />
      </div>
    </section>
  );
}

export default function InfluencerDashboardPage() {
  const locale = useLocale();
  const [data, setData] = useState<InfluencerStats | null>(null);
  const [config, setConfig] = useState<ConsoleConfig | null>(null);
  const [identity, setIdentity] = useState<ConsoleIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/influencer/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "no-profile" : "fetch-failed");
        return r.json();
      })
      .then((d: InfluencerStats) => {
        if (cancelled) return;
        setData(d);
        // Resolve the console config for the INFLUENCER archetype.
        setConfig(resolveConsoleConfig({ roles: ["INFLUENCER"], actorTypeCode: null }));
        setIdentity({
          displayName: d.profile.handle ? `@${d.profile.handle}` : "Influencer",
          referralCode: d.profile.refCode ?? "",
          organization: undefined,
        });
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #050505 0%, #0a0a0a 100%)", color: "#e5e7eb" }}>

      {/* ── 1. PURE REFERRER CONSOLE — QR / Activity / Earnings / Profile ────── */}
      {/*   QR tab is first and above the fold — the guest-handoff screen comes   */}
      {/*   first. Performance stats appear BELOW the console so they never block  */}
      {/*   the QR when the referrer hands their phone to a guest.                 */}
      {/*   ActivityModule → /api/v1/me/referrals (one governed source).          */}
      {/*   EarningsModule → accrual-only rollups; no paid figures from ledger.   */}
      {error === "no-profile" ? (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 0" }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: "20px 18px",
            marginBottom: 20,
            color: "#9ca3af",
            fontSize: 13,
            textAlign: "center",
          }}>
            You don&apos;t have an influencer profile yet. Contact OKÜ to be onboarded.
          </div>
        </div>
      ) : error ? (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 0" }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: "20px 18px",
            marginBottom: 20,
            color: "#9ca3af",
            fontSize: 13,
            textAlign: "center",
          }}>
            Couldn&apos;t load your dashboard. Refresh to try again.
          </div>
        </div>
      ) : (
        config && identity && (
          <div style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 16px",
            "--layer-1": "rgba(255,255,255,0.04)",
            "--color-border": "rgba(255,255,255,0.08)",
            "--color-text": "#f3f4f6",
            "--color-text-muted": "#9ca3af",
            "--color-bg": "#050505",
          } as React.CSSProperties}>
            <PureReferrerConsole
              config={config}
              identity={identity}
              destinationPath={identity.referralCode ? `/r/${identity.referralCode}` : "/series"}
              appendRefQuery={false}
              locale={locale}
              manageBeneficiaryHref="/my/beneficiary"
            />
          </div>
        )
      )}

      {/* ── 2. PERFORMANCE STATS — influencer-specific funnel metrics ────────── */}
      {/*   Intentionally BELOW the referrer console so private performance        */}
      {/*   numbers (clicks, bookings, commission) never appear above the QR when  */}
      {/*   the influencer hands their phone to a guest.                           */}
      {data && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px 24px" }}>
          <PerformanceSection data={data} />
        </div>
      )}

      {/* ── 3. PAYOUT DASHBOARD — legacy detail kept intact, outside the core ── */}
      {/*   Reads its own endpoints (/api/v1/payout-dashboard/*). Paid/ledger     */}
      {/*   figures stay here and do NOT surface in the shared earnings tab above. */}
      <PayoutDashboard />
    </div>
  );
}
