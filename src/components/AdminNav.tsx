"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminRoles } from "@/contexts/AdminContext";
import ThemeToggle from "@/components/ui/ThemeToggle";

interface AdminNavLabels {
  administration: string;
  adminConsole: string;
  overview: string;
  experiences: string;
  analytics: string;
  orders: string;
  users: string;
  memberships: string;
  menus: string;
  irDocuments: string;
  hiring: string;
  compensation: string;
  partners: string;
  series: string;
  entities: string;
  sponsorship: string;
  profiles: string;
  accounts: string;
  integrations: string;
  tableSessions: string;
  reviewQueue: string;
  revenue: string;
  revenueSessions: string;
  revenueObligations: string;
  revenueReview: string;
  revenueEvents: string;
  launchReadiness: string;
  referralMergeConflicts: string;
}

interface AdminNavProps {
  labels?: Partial<AdminNavLabels>;
}

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN:            "Superadmin",
  FB_DIRECTOR:           "F&B Director",
  RESTAURANT_SUPERVISOR: "Restaurant Supervisor",
  ADMIN_IR:              "Admin — IR",
  ADMIN_HR:              "Admin — HR",
  ADMIN_FINANCE:         "Admin — Finance",
  // Legacy — kept so existing sessions still render a label before expiry
  ADMIN_COMMERCIAL:      "Admin — Commercial (legacy)",
};

export default function AdminNav({ labels = {} }: AdminNavProps) {
  const roles    = useAdminRoles();
  const pathname = usePathname();

  const l: AdminNavLabels = {
    administration: labels.administration     || "Administration",
    adminConsole:   labels.adminConsole       || "Admin Console",
    overview:       labels.overview           || "Overview",
    experiences:    labels.experiences        || "Experiences",
    series:         labels.series             || "Series",
    entities:       labels.entities           || "Entities",
    profiles:       labels.profiles           || "Profiles",
    accounts:       labels.accounts           || "Accounts",
    sponsorship:    labels.sponsorship        || "Sponsorship",
    analytics:      labels.analytics          || "Analytics",
    orders:         labels.orders             || "Orders",
    users:          labels.users              || "Users",
    memberships:    labels.memberships        || "Memberships",
    menus:          labels.menus              || "Menus",
    irDocuments:    labels.irDocuments        || "IR Documents",
    hiring:         labels.hiring             || "Hiring",
    compensation:   labels.compensation       || "Compensation",
    partners:       labels.partners           || "Partners",
    integrations:        labels.integrations        || "Integrations",
    tableSessions:       labels.tableSessions       || "Table Sessions",
    reviewQueue:         labels.reviewQueue         || "Review Queue",
    revenue:             labels.revenue             || "Revenue",
    revenueSessions:     labels.revenueSessions     || "Sessions",
    revenueObligations:  labels.revenueObligations  || "Obligations",
    revenueReview:       labels.revenueReview       || "Review",
    revenueEvents:       labels.revenueEvents       || "Events",
    launchReadiness:        labels.launchReadiness        || "Launch Readiness",
    referralMergeConflicts: labels.referralMergeConflicts || "Referral Merge Conflicts",
  };

  const ALL_TABS = [
    // Operations — visible to FB_DIRECTOR and SUPERADMIN
    { label: l.overview,     href: "/admin",                        roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_IR", "ADMIN_HR"] },
    { label: l.experiences,  href: "/admin/experiences",            roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    { label: l.series,       href: "/admin/series",                 roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    { label: l.profiles,     href: "/admin/profiles",               roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    { label: l.sponsorship,  href: "/admin/sponsorship",            roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    { label: l.analytics,    href: "/admin/analytics/experiences",  roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    { label: l.orders,       href: "/admin/orders",                 roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    { label: l.memberships,  href: "/admin/memberships",            roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    { label: l.menus,        href: "/admin/menus",                  roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    { label: "Tickets",             href: "/admin/tickets",                   roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    { label: "Spaces",              href: "/admin/spaces",                    roles: ["SUPERADMIN", "FB_DIRECTOR"] },
    // Role-specific non-finance departments
    { label: l.irDocuments,  href: "/admin/ir",                     roles: ["SUPERADMIN", "ADMIN_IR"] },
    { label: l.hiring,       href: "/admin/hiring",                 roles: ["SUPERADMIN", "ADMIN_HR"] },
    // Finance / governance — SUPERADMIN only (or shared with ADMIN_FINANCE for payouts)
    { label: l.compensation, href: "/admin/compensation",           roles: ["SUPERADMIN"] },
    { label: l.partners,     href: "/admin/partners/reports",       roles: ["SUPERADMIN"] },
    { label: "Conversion",    href: "/admin/operations/conversion",  roles: ["SUPERADMIN"] },
    { label: "Ledger Outbox", href: "/admin/operations/ledger-outbox", roles: ["SUPERADMIN", "ADMIN_FINANCE"] },
    { label: "Streetside",   href: "/admin/streetside",             roles: ["SUPERADMIN"] },
    { label: l.referralMergeConflicts,   href: "/admin/referrals",           roles: ["SUPERADMIN"] },
    { label: l.integrations + " — INVU", href: "/admin/integrations/invu", roles: ["SUPERADMIN"] },
    { label: l.tableSessions, href: "/admin/table-sessions",        roles: ["SUPERADMIN"] },
    { label: l.reviewQueue,   href: "/admin/review-queue",          roles: ["SUPERADMIN"] },
    { label: l.revenue,             href: "/admin/revenue",              roles: ["SUPERADMIN"] },
    { label: l.revenueSessions,     href: "/admin/revenue/sessions",     roles: ["SUPERADMIN"] },
    { label: l.revenueObligations,  href: "/admin/revenue/obligations",  roles: ["SUPERADMIN"] },
    { label: l.revenueReview,       href: "/admin/revenue/review",       roles: ["SUPERADMIN"] },
    { label: l.revenueEvents,       href: "/admin/revenue/events",       roles: ["SUPERADMIN"] },
    { label: "Payments",            href: "/admin/payments",                  roles: ["SUPERADMIN"] },
    { label: "Payment Ledger",      href: "/admin/payments/payment-ledger",   roles: ["SUPERADMIN", "ADMIN_FINANCE"] },
    { label: l.launchReadiness,     href: "/admin/launch-readiness",          roles: ["SUPERADMIN"] },
    { label: "Payouts",             href: "/admin/payouts",                   roles: ["SUPERADMIN", "ADMIN_FINANCE"] },
    { label: "Beneficiaries",       href: "/admin/payouts/beneficiaries",     roles: ["SUPERADMIN", "ADMIN_FINANCE"] },
    { label: "Commerce",            href: "/admin/commerce/settings",         roles: ["SUPERADMIN"] },
    { label: "Security",            href: "/admin/security",                  roles: ["SUPERADMIN"] },
    { label: "Attribution Review",  href: "/admin/attribution-anchor",        roles: ["SUPERADMIN"] },
  ];

  const tabs = ALL_TABS.filter((t) => t.roles.some((r) => roles.includes(r)));
  const roleLabel = ROLE_LABELS[roles.find((r) => r in ROLE_LABELS) ?? ""] ?? "Admin";

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <div style={{ background: "var(--layer-1)", borderBottom: "1px solid var(--color-border)", padding: "16px 0 0", transition: "background var(--motion-std)" }}>
      <div className="admin-nav-container">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 1 }}>
                {l.administration}
              </div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 400, color: "var(--color-text)", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.adminConsole}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <ThemeToggle size={30} />
            <span className="badge badge-neutral" style={{ fontSize: 10, letterSpacing: "0.08em" }}>{roleLabel}</span>
          </div>
        </div>
        {/* Horizontally scrollable tabs — no wrapping, no scrollbar visible */}
        <div className="admin-nav-tabs-scroller" style={{ overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <div className="tabs" style={{ borderBottom: "none", paddingBottom: 0, flexWrap: "nowrap", whiteSpace: "nowrap", display: "flex", gap: 0 }}>
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`tab ${isActive(t.href) ? "active" : ""}`}
                style={{ flexShrink: 0 }}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
