"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";

interface Tier { id: string; key: string; label: string; displayOrder: number; isActive: boolean; }

const TIER_PROMINENCE: Record<string, { size: string; color: string }> = {
  PRESENTED_BY:     { size: "18px", color: "#1a1614" },
  HOSTED_WITH:      { size: "15px", color: "#374151" },
  PARTNER:          { size: "14px", color: "#4b5563" },
  SUPPORTING_PARTNER: { size: "13px", color: "#6b7280" },
};

const QUICK_LINKS = [
  { href: "/admin/experiences",             label: "Assign to Series",    icon: "✦", desc: "Open any experience → Sponsors tab to assign sponsors to a series" },
  { href: "/admin/sponsorship/slots",       label: "Slot Inventory",      icon: "▣", desc: "Manage sponsorship slot categories and pricing (legacy marketplace inventory)" },
  { href: "/admin/sponsorship/applications", label: "Applications",       icon: "◻", desc: "Review inbound brand partnership inquiries" },
  { href: "/admin/sponsorship/deals",       label: "Deals",               icon: "◈", desc: "Manage confirmed deals, payments, and placements" },
];

export default function SponsorPlacementEnginePage() {
  const t = useTranslation();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/admin/sponsor-tiers").then((r) => r.json()).then((d) => {
      setTiers(d.tiers ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#fafaf9" }}>
      <div style={{ background: "white", borderBottom: "1px solid #e5e0d8", padding: "28px 0" }}>
        <div className="page-container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>OKÜ Admin</div>
              <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 30, fontWeight: 400, color: "#1a1614", margin: 0 }}>Sponsor Placement Engine</h1>
              <p style={{ fontSize: 14, color: "#7c7168", marginTop: 8 }}>
                Admin-controlled sponsor assignment — hierarchical, surface-aware, series-to-event inherited.
              </p>
            </div>
            <Link href="/admin/experiences" className="btn btn-primary" style={{ fontSize: 13 }}>
              Open an Experience → Sponsors ↗
            </Link>
          </div>
        </div>
      </div>

      <div className="page-container" style={{ padding: "40px 24px" }}>

        {/* Workflow explanation */}
        <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 14, padding: "28px 32px", marginBottom: 32 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>Placement Engine Workflow</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { step: "1", title: "Assign to a Series", body: "Open any Experience → Sponsors tab. Pick the brand entity, set the tier, toggle which surfaces it appears on." },
              { step: "2", title: "Events Inherit Automatically", body: "Every event in the series shows the series sponsors — no duplication required." },
              { step: "3", title: "Override at Event Level", body: "Sessions can disable inheritance and define their own sponsor list for one-off activations." },
              { step: "4", title: "Renders Everywhere", body: "Event pages, tickets, and emails all render sponsors in correct tier hierarchy based on the placement toggles." },
            ].map(({ step, title, body }) => (
              <div key={step} style={{ display: "flex", gap: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1a1614", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{step}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1614", marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tier Hierarchy */}
        <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 14, padding: "28px 32px", marginBottom: 32 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 4 }}>Sponsor Tier Hierarchy</h2>
          <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>Sponsors render in this fixed order on all surfaces. Top tiers receive larger, more prominent treatment.</p>
          {loading ? (
            <div className="loading-spinner" style={{ margin: "24px auto" }} />
          ) : (
            <div>
              {tiers.map((tier, i) => {
                const prom = TIER_PROMINENCE[tier.key] ?? { size: "14px", color: "#6b7280" };
                return (
                  <div key={tier.id} style={{
                    display: "flex", alignItems: "center", gap: 20,
                    padding: "18px 0",
                    borderBottom: i < tiers.length - 1 ? "1px solid #f0ede8" : undefined,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f0ede8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#6b7280", flexShrink: 0 }}>{tier.displayOrder}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: prom.size, fontWeight: 600, color: prom.color }}>{tier.label}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, letterSpacing: "0.07em", textTransform: "uppercase" }}>{tier.key.replace(/_/g, " ")}</div>
                    </div>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: tier.isActive ? "#dcfce7" : "#f0ede8", color: tier.isActive ? "#16a34a" : "#9ca3af", fontWeight: 600 }}>{tier.isActive ? "Active" : "Inactive"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 32 }}>
          {QUICK_LINKS.map(({ href, label, icon, desc }) => (
            <Link key={href} href={href} style={{ textDecoration: "none" }}>
              <div
                style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "22px 24px", height: "100%", transition: "border-color 0.15s", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#c41e3a")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e0d8")}
              >
                <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1614", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 13, color: "#7c7168", lineHeight: 1.5 }}>{desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Surface guide */}
        <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 14, padding: "28px 32px" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>Placement Surfaces</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
            {[
              { icon: "◻", name: "Event Page",  desc: "Tiered sponsor block below the event hero. Primary, most visible surface for attendees." },
              { icon: "▣", name: "Ticket",      desc: "Compressed sponsor strip at ticket bottom — never near QR. Elegant secondary treatment." },
              { icon: "✉", name: "Email",       desc: "Sponsor section in invitation, RSVP, and ticket emails. Email-safe, restrained sizing." },
              { icon: "◈", name: "Check-In",    desc: "Optional context for host view during premium activations. Disabled by default." },
            ].map(({ icon, name, desc }) => (
              <div key={name} style={{ padding: "18px", background: "#fafaf9", borderRadius: 10, border: "1px solid #f0ede8" }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1614", marginBottom: 6 }}>{name}</div>
                <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
