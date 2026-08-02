"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import TrustKpiStrip from "@/components/admin/revenue/TrustKpiStrip";
import EmptyRevenueState from "@/components/admin/revenue/EmptyRevenueState";

interface Venue {
  id: string;
  name: string;
}

interface Props {
  venues: Venue[];
  hasSessions: boolean;
}

type Preset = "TODAY" | "7D" | "30D" | "CUSTOM";

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  if (preset === "TODAY") {
    start.setHours(0, 0, 0, 0);
  } else if (preset === "7D") {
    start.setDate(start.getDate() - 7);
  } else if (preset === "30D") {
    start.setDate(start.getDate() - 30);
  } else {
    return { from: "", to: "" };
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function RevenueDashboardPanel({ venues, hasSessions }: Props) {
  const [preset, setPreset] = useState<Preset>("30D");
  const [venueId, setVenueId] = useState<string>("");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const range = useMemo(() => {
    if (preset === "CUSTOM") {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : "",
        to: customTo ? new Date(customTo).toISOString() : "",
      };
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  if (!hasSessions) {
    return (
      <EmptyRevenueState
        message="No table sessions have been synced yet. Go to INVU Integration to trigger your first sync."
      />
    );
  }

  const navCards: Array<{ title: string; description: string; href: string }> = [
    {
      title: "Sessions Ledger",
      description: "Every commissionable table session with full drill-down.",
      href: "/admin/revenue/sessions",
    },
    {
      title: "Commission Obligations",
      description: "Earner-grouped allocations: pending, approved, paid.",
      href: "/admin/revenue/obligations",
    },
    {
      title: "Financial Trust Review",
      description: "Low-trust sessions, disputes, and credit-note adjustments.",
      href: "/admin/revenue/review",
    },
    {
      title: "Event Attribution",
      description: "Per-event commission summaries and unlinked revenue.",
      href: "/admin/revenue/events",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            marginBottom: 6,
          }}
        >
          Revenue
        </div>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 26,
            fontWeight: 400,
            margin: 0,
            color: "var(--color-text)",
          }}
        >
          Executive Trust Dashboard
        </h1>
      </header>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
          padding: 12,
          background: "var(--layer-1)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Date range</label>
          <div style={{ display: "flex", gap: 4 }}>
            {(["TODAY", "7D", "30D", "CUSTOM"] as Preset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: preset === p ? "var(--color-text)" : "transparent",
                  color: preset === p ? "var(--color-bg)" : "var(--color-text)",
                  cursor: "pointer",
                }}
              >
                {p === "TODAY" ? "Today" : p === "7D" ? "7d" : p === "30D" ? "30d" : "Custom"}
              </button>
            ))}
          </div>
        </div>
        {preset === "CUSTOM" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-text)",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-text)",
                }}
              />
            </div>
          </>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Venue</label>
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text)",
              minWidth: 180,
            }}
          >
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <TrustKpiStrip venueId={venueId || undefined} dateFrom={range.from || undefined} dateTo={range.to || undefined} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {navCards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            style={{
              display: "block",
              padding: "16px 18px",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              background: "var(--layer-1)",
              textDecoration: "none",
              color: "var(--color-text)",
              transition: "border-color var(--motion-std)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
              {c.description}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
