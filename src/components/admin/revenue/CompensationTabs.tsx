"use client";
import { useState } from "react";
import ObligationsPanel from "./ObligationsPanel";
import UnresolvedOrganizationsPanel from "../compensation/UnresolvedOrganizationsPanel";

type Tab = "manual" | "obligations" | "unresolvedOrgs";

export default function CompensationTabs({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("manual");

  return (
    <div>
      <div style={{
        background: "var(--layer-1)",
        borderBottom: "1px solid var(--color-border)",
        padding: "0 24px",
        display: "flex",
        gap: 4,
      }}>
        <TabButton active={tab === "manual"} onClick={() => setTab("manual")}>
          Manual Entries
          <span style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", background: "#f59e0b", color: "#fff", borderRadius: 4, fontWeight: 700 }}>LEGACY</span>
        </TabButton>
        <TabButton active={tab === "obligations"} onClick={() => setTab("obligations")}>
          INVU-Verified Obligations
          <span style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", background: "#10b981", color: "#fff", borderRadius: 4, fontWeight: 700 }}>NEW</span>
        </TabButton>
        <TabButton active={tab === "unresolvedOrgs"} onClick={() => setTab("unresolvedOrgs")}>
          Unresolved Organizations
          <span style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", background: "#6366f1", color: "#fff", borderRadius: 4, fontWeight: 700 }}>RESOLVER</span>
        </TabButton>
      </div>

      {tab === "manual" && children}
      {tab === "obligations" && (
        <div style={{ padding: 24 }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 4 }}>INVU-Verified Obligations</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 20 }}>
            Commission allocations created by the INVU sync from verified table-session closes.
            Group by earner, then approve, dispute, mark paid, or reverse each allocation.
            Every action writes an immutable audit log entry.
          </p>
          <ObligationsPanel />
        </div>
      )}
      {tab === "unresolvedOrgs" && <UnresolvedOrganizationsPanel />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: "14px 18px",
        fontSize: 13,
        fontWeight: 600,
        color: active ? "var(--color-text)" : "var(--color-text-muted)",
        borderBottom: active ? "2px solid var(--brand-primary, #c41e3a)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
