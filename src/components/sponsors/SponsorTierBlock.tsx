"use client";

import type { SponsorTierVM, SponsorSurface } from "@/lib/sponsor-render";
import SponsorLogo from "./SponsorLogo";

interface Props {
  tier: SponsorTierVM;
  surface: SponsorSurface;
  isMobile?: boolean;
  showLabel?: boolean;
  dark?: boolean;
}

export default function SponsorTierBlock({ tier, surface, isMobile = false, showLabel = true, dark = false }: Props) {
  if (!tier.sponsors.length) return null;

  const isTop = tier.tierKey === "PRESENTED_BY";
  const labelColor = dark ? "rgba(255,255,255,0.45)" : "#9ca3af";
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: labelColor,
    marginBottom: isMobile ? 10 : 14,
    textAlign: "center",
    display: "block",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: isMobile ? 12 : isTop ? 32 : 24,
  };

  return (
    <div style={{ textAlign: "center" }}>
      {showLabel && (
        <span style={labelStyle}>{tier.tierLabel}</span>
      )}
      <div style={rowStyle}>
        {tier.sponsors.map((s) => (
          <SponsorLogo
            key={s.id}
            displayName={s.displayName}
            logoUrl={s.logoUrl}
            websiteUrl={s.websiteUrl}
            tierKey={tier.tierKey}
            surface={surface}
            isMobile={isMobile}
            isInherited={s.isInherited}
          />
        ))}
      </div>
    </div>
  );
}
