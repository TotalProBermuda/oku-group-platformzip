"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminRoles } from "@/contexts/AdminContext";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { useState, useRef, useCallback } from "react";

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
  commissionRules: string;
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
  // Legacy role retained as an F&B Director alias until seeded/live users migrate.
  ADMIN_COMMERCIAL:      "F&B Director",
};

export default function AdminNav({ labels = {} }: AdminNavProps) {
  const roles    = useAdminRoles();
  const pathname = usePathname();

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = useCallback((label: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenGroup(label);
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpenGroup(null), 140);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

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
    commissionRules:        labels.commissionRules        || "Commission Rules",
  };

  const NAV_GROUPS = [
    {
      label: "Core",
      tabs: [
        { label: l.overview,        href: "/admin",                roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "ADMIN_IR", "ADMIN_HR"] },
        { label: l.launchReadiness, href: "/admin/launch-readiness", roles: ["SUPERADMIN"] },
      ],
    },
    {
      label: "Restaurant Ops",
      tabs: [
        { label: l.experiences, href: "/admin/experiences",          roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
        { label: l.series,      href: "/admin/series",               roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
        { label: l.menus,       href: "/admin/menus",                roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
        { label: "Tickets",     href: "/admin/tickets",              roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
        { label: "Spaces",      href: "/admin/spaces",               roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
        { label: l.analytics,   href: "/admin/analytics/experiences",roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
        { label: l.orders,      href: "/admin/orders",               roles: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] },
      ],
    },
    {
      label: "ProofPay",
      tabs: [
        { label: l.commissionRules,        href: "/admin/commission-rules",         roles: ["SUPERADMIN"] },
        { label: l.compensation,           href: "/admin/compensation",             roles: ["SUPERADMIN"] },
        { label: l.tableSessions,          href: "/admin/table-sessions",           roles: ["SUPERADMIN"] },
        { label: l.reviewQueue,            href: "/admin/review-queue",             roles: ["SUPERADMIN"] },
        { label: "Attribution Review",     href: "/admin/attribution-anchor",       roles: ["SUPERADMIN"] },
        { label: l.referralMergeConflicts, href: "/admin/referrals",                roles: ["SUPERADMIN"] },
        { label: "Ledger Outbox",          href: "/admin/operations/ledger-outbox", roles: ["SUPERADMIN", "ADMIN_FINANCE"] },
      ],
    },
    {
      label: "Finance",
      tabs: [
        { label: "Payments",        href: "/admin/payments",               roles: ["SUPERADMIN"] },
        { label: "Payment Ledger",  href: "/admin/payments/payment-ledger",roles: ["SUPERADMIN", "ADMIN_FINANCE"] },
        { label: "Payouts",         href: "/admin/payouts",                roles: ["SUPERADMIN", "ADMIN_FINANCE"] },
        { label: "Beneficiaries",   href: "/admin/payouts/beneficiaries",  roles: ["SUPERADMIN", "ADMIN_FINANCE"] },
        { label: l.revenue,              href: "/admin/revenue",             roles: ["SUPERADMIN"] },
        { label: l.revenueSessions,      href: "/admin/revenue/sessions",    roles: ["SUPERADMIN"] },
        { label: l.revenueObligations,   href: "/admin/revenue/obligations", roles: ["SUPERADMIN"] },
        { label: l.revenueReview,        href: "/admin/revenue/review",      roles: ["SUPERADMIN"] },
        { label: l.revenueEvents,        href: "/admin/revenue/events",      roles: ["SUPERADMIN"] },
      ],
    },
    {
      label: "Governance",
      tabs: [
        { label: l.users,                    href: "/admin/users",                  roles: ["SUPERADMIN"] },
        { label: l.profiles,                 href: "/admin/profiles",               roles: ["SUPERADMIN"] },
        { label: l.accounts,                 href: "/admin/accounts",               roles: ["SUPERADMIN"] },
        { label: "Security",                 href: "/admin/security",               roles: ["SUPERADMIN"] },
        { label: "Commerce",                 href: "/admin/commerce/settings",      roles: ["SUPERADMIN"] },
        { label: l.integrations + " — INVU", href: "/admin/integrations/invu",      roles: ["SUPERADMIN"] },
        { label: "Conversion",               href: "/admin/operations/conversion",  roles: ["SUPERADMIN"] },
        { label: "Streetside",               href: "/admin/streetside",             roles: ["SUPERADMIN"] },
      ],
    },
    {
      label: "Departments",
      tabs: [
        { label: l.irDocuments, href: "/admin/ir",               roles: ["SUPERADMIN", "ADMIN_IR"] },
        { label: l.hiring,      href: "/admin/hiring",            roles: ["SUPERADMIN", "ADMIN_HR"] },
        { label: l.sponsorship, href: "/admin/sponsorship",       roles: ["SUPERADMIN"] },
        { label: l.partners,    href: "/admin/partners/reports",  roles: ["SUPERADMIN"] },
        { label: l.memberships, href: "/admin/memberships",       roles: ["SUPERADMIN"] },
      ],
    },
  ];

  const groups = NAV_GROUPS
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((t) => t.roles.some((r) => roles.includes(r))),
    }))
    .filter((group) => group.tabs.length > 0);

  const roleLabel = ROLE_LABELS[roles.find((r) => r in ROLE_LABELS) ?? ""] ?? "Admin";

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const groupIsActive = (group: (typeof groups)[number]) =>
    group.tabs.some((t) => isActive(t.href));

  return (
    <div
      style={{
        background: "var(--layer-1)",
        borderBottom: "1px solid var(--color-border)",
        padding: "16px 0 0",
        transition: "background var(--motion-std)",
        position: "relative",
        zIndex: 50,
      }}
    >
      <div className="admin-nav-container">
        {/* ── Header row ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  marginBottom: 1,
                }}
              >
                {l.administration}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 16,
                  fontWeight: 400,
                  color: "var(--color-text)",
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {l.adminConsole}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <ThemeToggle size={30} />
            <span className="badge badge-neutral" style={{ fontSize: 10, letterSpacing: "0.08em" }}>
              {roleLabel}
            </span>
          </div>
        </div>

        {/* ── Group button bar ────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
          {groups.map((group) => {
            const active = groupIsActive(group);
            const open   = openGroup === group.label;

            return (
              <div
                key={group.label}
                style={{ position: "relative" }}
                onMouseEnter={() => openMenu(group.label)}
                onMouseLeave={scheduleClose}
              >
                {/* Group label trigger */}
                <button
                  className="admin-nav-group-btn"
                  data-active={active || open}
                  onFocus={() => openMenu(group.label)}
                  onBlur={scheduleClose}
                  aria-haspopup="true"
                  aria-expanded={open}
                >
                  {group.label}
                  <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="none"
                    style={{
                      marginLeft: 4,
                      flexShrink: 0,
                      transition: "transform 0.15s",
                      transform: open ? "rotate(180deg)" : "rotate(0deg)",
                      opacity: 0.5,
                    }}
                  >
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Dropdown panel */}
                {open && (
                  <div
                    className="admin-nav-dropdown"
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                  >
                    {group.tabs.map((t) => {
                      const tabActive = isActive(t.href);
                      return (
                        <Link
                          key={t.href}
                          href={t.href}
                          className={`admin-nav-dropdown-item${tabActive ? " active" : ""}`}
                          onClick={() => setOpenGroup(null)}
                        >
                          {t.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
