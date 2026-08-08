"use client";

import Link from "next/link";
import { useState } from "react";

const ENGAGEMENT_LABELS: Record<string, string> = {
  FULL_TIME:  "Full-time",
  PART_TIME:  "Part-time",
  SEASONAL:   "Seasonal",
  CONTRACT:   "Contract",
  CONSULTANT: "Consultant",
  FREELANCE:  "Freelance",
};

type Props = {
  opp: {
    id: string;
    slug: string;
    title: string;
    department: string | null;
    engagementType: string;
    locationKey: string | null;
    openingsCount: number | null;
    description: string | null;
  };
};

export default function CareerJobCard({ opp }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={`/careers/${opp.slug}`} style={{ display: "block", textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: "#fff",
          border: `1px solid ${hovered ? "var(--color-crimson)" : "var(--color-border)"}`,
          borderRadius: 12,
          padding: "22px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          transition: "border-color 0.15s, box-shadow 0.15s",
          cursor: "pointer",
          boxShadow: hovered ? "0 4px 20px rgba(180,35,47,0.07)" : "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 19, fontWeight: 500, color: "var(--color-text)", marginBottom: 8 }}>
            {opp.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: opp.description ? 10 : 0 }}>
            {opp.department && <span className="badge badge-neutral">{opp.department}</span>}
            <span className="badge badge-neutral">{ENGAGEMENT_LABELS[opp.engagementType] ?? opp.engagementType}</span>
            {opp.locationKey && <span className="badge badge-neutral">{opp.locationKey}</span>}
            {opp.openingsCount && opp.openingsCount > 1 && (
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 500 }}>
                {opp.openingsCount} openings
              </span>
            )}
          </div>
          {opp.description && (
            <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.55 }}>
              {opp.description.length > 140 ? opp.description.slice(0, 140) + "…" : opp.description}
            </p>
          )}
        </div>
        <div style={{ flexShrink: 0, color: "var(--color-crimson)", fontSize: 20, fontWeight: 300, transition: "transform 0.15s", transform: hovered ? "translateX(3px)" : "none" }}>
          →
        </div>
      </div>
    </Link>
  );
}
