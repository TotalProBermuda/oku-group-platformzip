"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import ThemeToggle from "@/components/ui/ThemeToggle";

const STAFF_TABS = [
  { ns: "common",  key: "sopTitle", href: "/staff",          icon: "📋", exact: true },
  { ns: "checkin", key: "title",    href: "/staff/check-in", icon: "🎫", exact: false },
];

export default function PortalNav({ title }: { title?: string }) {
  const t = useTranslation();
  const pathname = usePathname();

  const isStaff = pathname.startsWith("/staff");

  return (
    <div
      style={{
        background: "#1a1614",
        borderBottom: "1px solid #2d2420",
        padding: "0 24px",
        height: 40,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          fontWeight: 700,
          color: "#5a4a40",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          paddingRight: 20,
          marginRight: 4,
          borderRight: "1px solid #2d2420",
          whiteSpace: "nowrap",
        }}
      >
        {title ?? "Staff Portal"}
      </span>

      <div style={{ display: "flex", alignItems: "stretch", flex: 1 }}>
        {isStaff && STAFF_TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "0 16px",
                fontSize: 12,
                fontWeight: 600,
                color: active ? "#e8d5b0" : "#6b5a50",
                textDecoration: "none",
                borderBottom: active ? "2px solid #c9a96e" : "2px solid transparent",
                transition: "color 0.15s, border-color 0.15s",
                letterSpacing: "0.02em",
              }}
            >
              <span style={{ fontSize: 14 }}>{tab.icon}</span>
              {t(tab.ns, tab.key)}
            </Link>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", paddingLeft: 12 }}>
        <ThemeToggle size={26} />
      </div>
    </div>
  );
}
