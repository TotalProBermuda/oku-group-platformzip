"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/components/i18n/LocaleProvider";

export default function RevenueSubNav() {
  const pathname = usePathname();
  const t = useTranslation();

  const tabs: Array<{ href: string; label: string; exact?: boolean }> = [
    { href: "/admin/revenue", label: t("admin", "revenueDashboard") || "Dashboard", exact: true },
    { href: "/admin/revenue/sessions", label: t("admin", "revenueSessions") || "Sessions" },
    { href: "/admin/revenue/obligations", label: t("admin", "revenueObligations") || "Obligations" },
    { href: "/admin/revenue/review", label: t("admin", "revenueReview") || "Review" },
    { href: "/admin/revenue/events", label: t("admin", "revenueEvents") || "Events" },
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        borderBottom: "1px solid var(--color-border)",
        paddingBottom: 0,
      }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.href, tab.exact);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--color-text)" : "var(--color-text-muted)",
              borderBottom: active ? "2px solid var(--color-text)" : "2px solid transparent",
              textDecoration: "none",
              transition: "color var(--motion-std), border-color var(--motion-std)",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
