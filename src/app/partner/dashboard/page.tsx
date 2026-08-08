"use client";

/**
 * Partner dashboard — Slice D of the Pure Referrer Console migration.
 *
 * Layout:
 *  0. Share offers (ShareSurfacePanel) — offer wallet; NOT the referral feed.
 *  1. Active Series — Open Invite Tools (partner business module, unchanged).
 *  2. KPI strip (partner business module, unchanged).
 *  3. PureReferrerConsole (core) — QR / Activity / Earnings / Profile tabs.
 *     Activity → /api/v1/me/referrals (one governed source).
 *     Earnings → accrual-only rollups; no paid figures.
 *  4. Drafts & Past Series (partner business module, unchanged).
 *
 * Partner business modules (events/series, sessions, guest lists, invites,
 * co-hosts/delegates, reporting, ticketing) are deliberately NOT standardized
 * or moved inside the shared console — only the referral core is shared.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslation } from "@/components/i18n/LocaleProvider";
import { KPIStatCard, EmptyStateCard } from "@/components/ui/dashboard";
import { ShareSurfacePanel } from "@/components/referral/ShareSurfacePanel";
import { PureReferrerConsole } from "@/components/referral/console/PureReferrerConsole";
import { resolveConsoleConfig } from "@/components/referral/console/roleConfig";
import type { ConsoleConfig, ConsoleIdentity } from "@/components/referral/console/types";
import type { MyReferralsData } from "@/components/referral/MyReferralsFeed";

interface PartnerData {
  profile: { name: string };
  stats: {
    totalSeries: number;
    totalSessions: number;
    totalTicketsSold: number;
    totalRevenueCents: number;
  };
  series: {
    id: string;
    title: string;
    status: string;
    sessionsCount: number;
    ticketsSold: number;
    revenueCents: number;
  }[];
  referrals?: MyReferralsData;
  referral?: {
    referralCode: string | null;
    actorTypeCode: string | null;
  };
}

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
}

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "badge badge-success",
  DRAFT: "badge badge-warning",
  ARCHIVED: "badge badge-neutral",
};

export default function PartnerDashboard() {
  const t = useTranslation();
  const locale = useLocale();

  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [consoleConfig, setConsoleConfig] = useState<ConsoleConfig | null>(null);
  const [consoleIdentity, setConsoleIdentity] = useState<ConsoleIdentity | null>(null);

  useEffect(() => {
    fetch("/api/v1/partner/dashboard")
      .then((r) => r.json())
      .then((d: PartnerData & { error?: string }) => {
        if (d.profile) {
          setData(d);
          // Resolve the console config for the PARTNER archetype. If the
          // partner has a known actorTypeCode use it; otherwise PARTNER gold.
          setConsoleConfig(
            resolveConsoleConfig({
              roles: ["PARTNER"],
              actorTypeCode: d.referral?.actorTypeCode ?? null,
            })
          );
          setConsoleIdentity({
            displayName: d.profile.name,
            referralCode: d.referral?.referralCode ?? "",
            organization: undefined,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeSeries = data?.series.filter((s) => s.status === "PUBLISHED") ?? [];
  const otherSeries = data?.series.filter((s) => s.status !== "PUBLISHED") ?? [];

  return (
    <div className="dashboard-canvas">
      {/* Header band */}
      <div style={{ background: "var(--layer-2)", borderBottom: "1px solid var(--color-border)", padding: "36px 0 28px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <div className="dash-eyebrow">{t("admin", "partners") || "Partners"}</div>
          <h1 className="page-header" style={{ marginBottom: 0 }}>{t("admin", "partnerDashboard")}</h1>
          {data?.profile?.name && (
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: 6 }}>{data.profile.name}</p>
          )}
        </div>
      </div>

      <div className="dashboard-body">
        {loading ? (
          <>
            <div className="skeleton" style={{ height: 200, borderRadius: "var(--radius-panel)", marginBottom: 24 }} />
            <div className="kpi-grid" style={{ marginBottom: 32 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="kpi-card">
                  <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 12 }} />
                  <div className="skeleton" style={{ height: 38, width: 100, marginBottom: 8 }} />
                </div>
              ))}
            </div>
          </>
        ) : !data ? (
          <div style={{
            padding: "48px 24px",
            textAlign: "center",
            maxWidth: 440,
            margin: "0 auto",
          }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>◑</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, color: "var(--color-text)" }}>
              {t("referrals", "partner.noProfile_title")}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              {t("referrals", "partner.noProfile_body")}
            </div>
          </div>
        ) : (
          <>
            {/* ── 0. PURE REFERRER CONSOLE — QR-first guest handoff ────────────
                QR tab is first above the fold — same pattern as streetside.
                The partner hands their phone to a guest; the QR screen must be
                immediately visible without scrolling past business modules.
                ActivityModule → /api/v1/me/referrals (one governed source).
                EarningsModule → accrual-only rollups; no paid figures.
                Partner business modules follow below. */}
            {consoleConfig && consoleIdentity && (
              <div style={{ marginBottom: 24 }}>
                <PureReferrerConsole
                  config={consoleConfig}
                  identity={consoleIdentity}
                  destinationPath={
                    consoleIdentity.referralCode
                      ? `/r/${consoleIdentity.referralCode}`
                      : "/series"
                  }
                  appendRefQuery={false}
                  locale={locale}
                  feedData={data.referrals}
                  manageBeneficiaryHref="/my/beneficiary"
                />
              </div>
            )}

            {/* ── 1. SHARE WALLET — partner-scoped multi-offer surface ─────────
                Reads /api/v1/partner/share-surface (offer wallet — what to share
                right now). NOT the referral feed — not a fork of referral truth. */}
            <div className="panel" style={{ marginBottom: 24, padding: "16px 14px 18px" }}>
              <div className="panel-header" style={{ marginBottom: 12 }}>
                <div>
                  <div className="panel-title">Share offers</div>
                  <div className="panel-subtitle">Your assigned offers, organised by intent</div>
                </div>
              </div>
              <ShareSurfacePanel endpoint="/api/v1/partner/share-surface" />
            </div>

            {/* ── 2. ACTIVE SELLING / INVITE ACTIONS — partner business module ── */}
            <div className="panel" style={{ marginBottom: 24 }}>
              <div className="panel-header">
                <div>
                  <div className="panel-title">Active Series — Open Invite Tools</div>
                  <div className="panel-subtitle">Pick a series to manage sessions, send invites, and capture sales</div>
                </div>
              </div>
              {activeSeries.length === 0 ? (
                <EmptyStateCard
                  icon="◈"
                  title={data.series.length === 0 ? t("admin", "noSeries") : "No published series right now"}
                  compact
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activeSeries.map((s) => (
                    <div
                      key={s.id}
                      className="data-row"
                      style={{ alignItems: "center" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="data-row-primary">{s.title}</div>
                        <div className="data-row-meta">
                          {s.sessionsCount} {t("admin", "sessions")} · {s.ticketsSold} {t("admin", "ticketsSold")} · {fmt(s.revenueCents)}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <Link
                          href={`/partner/series/${s.id}`}
                          className="btn btn-primary"
                          style={{ textDecoration: "none", fontSize: 13, padding: "8px 14px" }}
                        >
                          Open Invite Tools →
                        </Link>
                        <Link
                          href={`/partner/series/${s.id}?tab=earnings`}
                          className="btn btn-secondary"
                          style={{ textDecoration: "none", fontSize: 13, padding: "8px 14px" }}
                        >
                          View Earnings
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 3. KPI strip — partner business metrics ──────────────────── */}
            <div className="kpi-grid" style={{ marginBottom: 24 }}>
              <KPIStatCard label={t("admin", "totalSeries")} value={data.stats.totalSeries} icon="◈" accent="var(--color-primary)" />
              <KPIStatCard label={t("admin", "totalSessions")} value={data.stats.totalSessions} icon="◇" accent="var(--color-info)" />
              <KPIStatCard label={t("admin", "ticketsSold")} value={data.stats.totalTicketsSold} icon="⬟" accent="var(--color-warning)" />
              <KPIStatCard label={t("admin", "revenue")} value={fmt(data.stats.totalRevenueCents)} icon="⬡" accent="var(--color-success)" />
            </div>

            {/* ── 4. Other / archived series — partner business module ──────── */}
            {otherSeries.length > 0 && (
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Drafts & Past Series</div>
                    <div className="panel-subtitle">Not currently selling</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {otherSeries.map((s) => (
                    <Link
                      key={s.id}
                      href={`/partner/series/${s.id}`}
                      className="data-row"
                      style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="data-row-primary">{s.title}</div>
                        <div className="data-row-meta">
                          {s.sessionsCount} {t("admin", "sessions")} · {s.ticketsSold} {t("admin", "ticketsSold")}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ textAlign: "right", minWidth: 80 }}>
                          <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, fontWeight: 400, color: "var(--color-text)" }}>
                            {fmt(s.revenueCents)}
                          </div>
                          <div className="kpi-label" style={{ marginBottom: 0 }}>{t("admin", "revenue")}</div>
                        </div>
                        <span className={STATUS_BADGE[s.status] || "badge badge-neutral"}>{s.status}</span>
                        <span style={{ color: "var(--color-text-secondary)", fontSize: 18 }}>›</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
