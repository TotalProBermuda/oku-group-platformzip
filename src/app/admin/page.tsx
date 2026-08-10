"use client";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import Link from "next/link";
import {
  LayoutGrid, Package, ChevronRight, TriangleAlert,
} from "lucide-react";
import { useAdminRoles } from "@/contexts/AdminContext";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import { KPIStatCard } from "@/components/ui/dashboard";

interface Stats {
  totalOrders: number;
  revenueCents: number;
  totalUsers: number;
  activeSeries: number;
}

type CardEntry = {
  labelKey: string;
  descKey: string;
  href: string;
  roles: string[];
} & (
  | { iconSrc: string; Icon?: never }
  | { Icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>; iconSrc?: never }
);

const ACTION_CARDS: CardEntry[] = [
  // Operations — FB_DIRECTOR and SUPERADMIN
  { labelKey: "experiences",  descKey: "cardExperiencesDesc",  href: "/admin/experiences",           iconSrc: "/icons/flaticon/sparkle.png",   roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { labelKey: "series",       descKey: "browseSeries",         href: "/admin/series",                Icon: LayoutGrid,                          roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { labelKey: "analytics",    descKey: "cardAnalyticsDesc",    href: "/admin/analytics/experiences", iconSrc: "/icons/flaticon/analytics.png",  roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { labelKey: "orders",       descKey: "cardOrdersDesc",       href: "/admin/orders",                iconSrc: "/icons/flaticon/orders.png",     roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  { labelKey: "memberships",  descKey: "cardMembershipsDesc",  href: "/admin/memberships",           iconSrc: "/icons/flaticon/crown.png",      roles: ["SUPERADMIN"] },
  { labelKey: "menus",        descKey: "cardMenusDesc",        href: "/admin/menus",                 Icon: LayoutGrid,                          roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
  // Finance / governance — SUPERADMIN only
  { labelKey: "users",        descKey: "cardUsersDesc",        href: "/admin/users",                 iconSrc: "/icons/flaticon/users.png",      roles: ["SUPERADMIN"] },
  { labelKey: "payouts",      descKey: "cardPayoutsDesc",      href: "/admin/payouts",               iconSrc: "/icons/flaticon/briefcase.png",  roles: ["SUPERADMIN"] },
  { labelKey: "revenueTrust", descKey: "cardRevenueTrustDesc", href: "/admin/revenue",               iconSrc: "/icons/flaticon/wallet.png",     roles: ["SUPERADMIN"] },
  // Role-specific
  { labelKey: "irDocuments",  descKey: "cardIRDocumentsDesc",  href: "/admin/ir",                   iconSrc: "/icons/flaticon/document.png",   roles: ["SUPERADMIN", "ADMIN_IR"] },
  { labelKey: "hr",           descKey: "cardHRDesc",           href: "/admin/hr",                   Icon: Package,                             roles: ["SUPERADMIN", "ADMIN_HR"] },
];

function PortalIcon({ entry }: { entry: CardEntry }) {
  if (entry.iconSrc) {
    return (
      <img
        src={entry.iconSrc}
        alt=""
        width={26}
        height={26}
        style={{ objectFit: "contain", display: "block" }}
      />
    );
  }
  const Icon = entry.Icon!;
  return <Icon size={20} strokeWidth={1.5} style={{ color: "var(--color-primary)" }} />;
}

export default function AdminPage() {
  const roles = useAdminRoles();
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";
  const isSuperadmin = roles.includes("SUPERADMIN");
  const isFBDirector = roles.some((r) => r === "FB_DIRECTOR" || r === "ADMIN_COMMERCIAL");

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const cards = ACTION_CARDS.filter((c) => c.roles.some((r) => roles.includes(r)));

  const load = useCallback(() => {
    if (!isSuperadmin) {
      setLoading(false);
      return;
    }

    fetch("/api/v1/admin/stats")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setStats(d.data); })
      .finally(() => setLoading(false));
  }, [isSuperadmin]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 180_000);

  const fmtRevenue = (cents: number) =>
    "$" + (cents / 100).toLocaleString(dateLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {isSuperadmin && (
        <div className="kpi-grid">
          <KPIStatCard
            label={t("admin", "totalOrders")}
            value={loading ? "—" : stats?.totalOrders ?? "—"}
            loading={loading}
            icon={<img src="/icons/flaticon/orders.png" alt="" width={22} height={22} style={{ objectFit: "contain" }} />}
            accent="var(--color-primary)"
          />
          <KPIStatCard
            label={t("admin", "revenuePaid")}
            value={loading ? "—" : stats ? fmtRevenue(stats.revenueCents) : "—"}
            loading={loading}
            icon={<img src="/icons/flaticon/wallet.png" alt="" width={22} height={22} style={{ objectFit: "contain" }} />}
            accent="#0d7a4e"
          />
          <KPIStatCard
            label={t("admin", "platformUsers")}
            value={loading ? "—" : stats?.totalUsers ?? "—"}
            loading={loading}
            icon={<img src="/icons/flaticon/users.png" alt="" width={22} height={22} style={{ objectFit: "contain" }} />}
            accent="#1d4ed8"
          />
          <KPIStatCard
            label={t("admin", "activeSeries")}
            value={loading ? "—" : stats?.activeSeries ?? "—"}
            loading={loading}
            icon={<img src="/icons/flaticon/calendar.png" alt="" width={22} height={22} style={{ objectFit: "contain" }} />}
            accent="var(--color-warning)"
          />
        </div>
      )}

      {isFBDirector && (
        <div className="alert-strip alert-strip-info">
          <span className="alert-strip-icon">ℹ</span>
          <div>
            <strong>F&amp;B Operations Workspace</strong>
            <div>
              Manage menus, experiences, spaces, tickets, orders, and operational analytics. Owner-only finance,
              payout, user, and ProofPay governance modules stay hidden.
            </div>
          </div>
        </div>
      )}

      {isSuperadmin && !loading && !stats && (
        <div className="alert-strip alert-strip-error">
          <TriangleAlert size={16} className="alert-strip-icon" />
          {t("admin", "failedLoadStats")}
        </div>
      )}

      {/* Quick Access */}
      <div>
        <div className="dash-eyebrow" style={{ marginBottom: 16 }}>{t("admin", "quickAccess")}</div>
        <div className="quick-grid">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="portal-card">
              <div className="portal-card-icon">
                <PortalIcon entry={c} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="portal-card-title">{t("admin", c.labelKey)}</div>
                <div className="portal-card-desc">{t("admin", c.descKey)}</div>
              </div>
              <ChevronRight size={16} className="portal-card-arrow" strokeWidth={1.5} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
