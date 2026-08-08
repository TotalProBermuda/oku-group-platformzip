"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SubTab {
  href: string;
  label: string;
}

export default function OperationsSubTabs({ tabs }: { tabs: SubTab[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Operations sections"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid #e2e8f0",
        marginBottom: 8,
        padding: "0 2px",
      }}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            style={{
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: active ? "#0f172a" : "#64748b",
              textDecoration: "none",
              borderBottom: active ? "2px solid #0f172a" : "2px solid transparent",
              marginBottom: -1,
              transition: "color 140ms ease, border-color 140ms ease",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
