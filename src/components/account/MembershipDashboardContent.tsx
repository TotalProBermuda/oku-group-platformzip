"use client";

import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import Link from "next/link";
import Image from "next/image";
import MembershipBadge from "@/components/membership/MembershipBadge";

function avacaAmount(priceAnnualCents: number | null | undefined, bps: number) {
  if (!priceAnnualCents) return null;
  const amount = Math.round((priceAnnualCents * bps) / 10000 / 100);
  return `$${amount.toLocaleString()}`;
}

interface MembershipData {
  tier: string;
  status: string;
  startsAt: string | Date;
  renewsAt: string | Date | null;
  priceAnnualCents: number | null;
  avacaContributionBps: number | null;
}

interface SeriesItem {
  id: string;
  title: string;
  heroImageUrl: string | null;
  isFounderOnly: boolean;
  sessions: { startsAt: string | Date }[];
}

interface OrderItem {
  id: string;
  status: string;
  createdAt: string | Date;
  tickets: { session: { series: { title: string; venue: string } | null } | null }[];
}

interface Props {
  membership: MembershipData | null;
  eligibleData: SeriesItem[];
  recentOrders: OrderItem[];
  userName: string | null;
}

export function MembershipDashboardContent({ membership, eligibleData, recentOrders, userName }: Props) {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  function fmtDate(d: Date | string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString(dateLocale, { month: "long", day: "numeric", year: "numeric" });
  }

  const PATRON_BENEFITS = [
    t("common", "patronBenefit1"),
    t("common", "patronBenefit2"),
    t("common", "patronBenefit3"),
    t("common", "patronBenefit4"),
    t("common", "patronBenefit5"),
  ];

  const FOUNDER_EXTRA = [
    t("common", "founderBenefit1"),
    t("common", "founderBenefit2"),
    t("common", "founderBenefit3"),
    t("common", "founderBenefit4"),
    t("common", "founderBenefit5"),
  ];

  if (!membership) {
    return (
      <div className="page-container" style={{ padding: "60px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ width: 4, height: 40, background: "var(--color-border)", borderRadius: 2, margin: "0 auto 24px" }} />
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 400, marginBottom: 16 }}>
            {t("common", "notCurrentlyMember")}
          </h1>
          <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 32, fontSize: 15 }}>
            {t("common", "notCurrentlyMemberDesc")}
          </p>
          <Link href="/membership" className="btn btn-primary" style={{ marginRight: 12 }}>
            {t("common", "exploreMembership")}
          </Link>
        </div>
      </div>
    );
  }

  const isFounder = membership.tier === "FOUNDER";
  const isActive  = membership.status === "ACTIVE";
  const isPending = membership.status === "PENDING_APPROVAL";
  const avaca = avacaAmount(membership.priceAnnualCents, membership.avacaContributionBps ?? 1500);
  const isExpiringSoon = membership.renewsAt && new Date(membership.renewsAt).getTime() - Date.now() < 30 * 86400000;

  return (
    <div className="page-container" style={{ padding: "40px 24px", maxWidth: 900 }}>

      <div style={{
        background: isFounder ? "#1a1614" : "var(--color-surface)",
        border: isFounder ? "1px solid #2a2622" : "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "32px 36px",
        marginBottom: 24,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 20,
      }}>
        <div>
          <MembershipBadge tier={isActive ? membership.tier : (isPending ? "PENDING_APPROVAL" : "EXPIRED")} size="lg" />
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 400, margin: "16px 0 6px", color: isFounder ? "#e8d5a3" : "var(--color-text)" }}>
            {userName ?? "Member"}
          </h1>
          <p style={{ color: isFounder ? "rgba(232,213,163,0.55)" : "var(--color-text-muted)", fontSize: 13 }}>
            {t("common", "memberSince")} {fmtDate(membership.startsAt)}
          </p>
        </div>
        {isActive && !isPending && (
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--color-success-bg)", color: "var(--color-success)", borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-success)", display: "inline-block" }} />
              {t("common", "activeStatus")}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 24 }}>
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "24px 28px" }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "var(--color-text-secondary)", marginBottom: 20 }}>
            {t("common", "membershipStatusLabel").toUpperCase()}
          </h2>

          {isPending && (
            <div style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning)", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "var(--color-warning)", lineHeight: 1.5 }}>
              {t("common", "applicationUnderReview")}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("common", "tierLabel")}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{membership.tier.charAt(0) + membership.tier.slice(1).toLowerCase()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("common", "statusField")}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{membership.status.replace(/_/g, " ")}</span>
            </div>
            {membership.renewsAt && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("common", "renewsLabel")}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: isExpiringSoon ? "var(--color-warning)" : "inherit" }}>
                  {fmtDate(membership.renewsAt)}
                </span>
              </div>
            )}
            {membership.priceAnnualCents && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("common", "annualLabel")}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>${(membership.priceAnnualCents / 100).toLocaleString()}</span>
              </div>
            )}
          </div>

          {isExpiringSoon && (
            <div style={{ marginTop: 16, padding: "10px 14px", background: "var(--color-warning-bg)", borderRadius: 7, fontSize: 13, color: "var(--color-warning)", lineHeight: 1.5 }}>
              {t("common", "membershipRenewsSoon")}
            </div>
          )}

          {isActive && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
              <Link href="/membership" style={{ fontSize: 13, color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>
                {t("common", "manageMembership")}
              </Link>
            </div>
          )}
        </div>

        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "24px 28px" }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "var(--color-text-secondary)", marginBottom: 20 }}>
            {t("common", "yourAccess").toUpperCase()}
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {PATRON_BENEFITS.map((label) => (
              <li key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--color-text)", lineHeight: 1.5 }}>
                <span style={{ color: "var(--color-primary)", fontWeight: 700, flexShrink: 0 }}>—</span>
                {label}
              </li>
            ))}
            {isFounder && FOUNDER_EXTRA.map((label) => (
              <li key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--color-text)", lineHeight: 1.5 }}>
                <span style={{ color: "#b8973a", fontWeight: 700, flexShrink: 0 }}>—</span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ background: "#faf5f0", border: "1px solid #e8d5c4", borderRadius: 12, padding: "24px 28px", marginBottom: 24, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0, position: "relative", width: 80, height: 56 }}>
          <Image src="/images/avaca-logo.jpg" alt="AVACA" fill style={{ objectFit: "contain" }} />
        </div>
        <div>
          <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#7c5c4a", marginBottom: 8 }}>
            {t("common", "yourImpactInCasco").toUpperCase()}
          </h2>
          <p style={{ fontSize: 14, color: "#5c3d2e", lineHeight: 1.7, margin: "0 0 4px" }}>
            {t("common", "impactDesc")}
          </p>
          {avaca && (
            <p style={{ fontSize: 14, color: "#3b1f12", fontWeight: 600, margin: 0 }}>
              {t("common", "yourContributionThisYear")} <span style={{ color: "#8b4513" }}>{avaca}</span>
            </p>
          )}
        </div>
      </div>

      {eligibleData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "var(--color-text-secondary)", marginBottom: 20 }}>
            {t("common", "availableToYouNow").toUpperCase()}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {eligibleData.map((s) => (
              <Link key={s.id} href="/experiences" style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
                  {s.heroImageUrl ? (
                    <div style={{ height: 120, backgroundImage: `url(${s.heroImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                  ) : (
                    <div style={{ height: 120, background: "#f0ece9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 32, height: 3, background: "var(--color-border)", borderRadius: 2 }} />
                    </div>
                  )}
                  <div style={{ padding: "16px 18px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-primary)", letterSpacing: "0.08em", marginBottom: 6 }}>
                      {s.isFounderOnly ? t("common", "founderAccessTitle").toUpperCase() : t("common", "memberAccess").toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)", marginBottom: 6, lineHeight: 1.4 }}>{s.title}</div>
                    {s.sessions[0] && (
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                        {new Date(s.sessions[0].startsAt).toLocaleDateString(dateLocale, { month: "short", day: "numeric" })}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentOrders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "var(--color-text-secondary)", marginBottom: 20 }}>
            {t("common", "yourActivity").toUpperCase()}
          </h2>
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden" }}>
            {recentOrders.map((order, idx) => {
              const ticket = order.tickets[0];
              const seriesTitle = ticket?.session?.series?.title ?? "Experience";
              return (
                <div key={order.id} style={{ padding: "16px 24px", borderBottom: idx < recentOrders.length - 1 ? "1px solid var(--color-border-light)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{seriesTitle}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 3 }}>
                      {new Date(order.createdAt).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-success)", background: "var(--color-success-bg)", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.06em" }}>
                    {order.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isFounder && isActive && (
        <div style={{ background: "#0e0c0b", borderRadius: 12, padding: "28px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(232,213,163,0.6)", marginBottom: 10 }}>
              {t("common", "founderAccessTitle").toUpperCase()}
            </div>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#e8d5a3", fontWeight: 400, margin: "0 0 8px" }}>
              {t("common", "accessDeeperLayer")}
            </h3>
            <p style={{ color: "#6a6360", fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 400 }}>
              {t("common", "founderDesc")}
            </p>
          </div>
          <Link href="/membership" style={{ background: "rgba(232,213,163,0.1)", color: "#e8d5a3", border: "1px solid rgba(232,213,163,0.25)", padding: "12px 22px", borderRadius: 6, fontWeight: 600, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}>
            {t("common", "requestFounderAccess")}
          </Link>
        </div>
      )}
    </div>
  );
}
