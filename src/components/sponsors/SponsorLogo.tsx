"use client";

import { getLogoHeight } from "@/lib/sponsor-render";
import type { SponsorSurface } from "@/lib/sponsor-render";

interface Props {
  displayName: string;
  logoUrl: string | null;
  websiteUrl?: string | null;
  tierKey: string;
  surface: SponsorSurface;
  isMobile?: boolean;
  isInherited?: boolean;
}

export default function SponsorLogo({ displayName, logoUrl, websiteUrl, tierKey, surface, isMobile = false, isInherited = false }: Props) {
  const maxH = getLogoHeight(tierKey, surface, isMobile);

  const logoEl = logoUrl ? (
    <img
      src={logoUrl}
      alt={displayName}
      style={{
        maxHeight: maxH,
        maxWidth: "100%",
        width: "auto",
        height: "auto",
        objectFit: "contain",
        display: "block",
        opacity: isInherited ? 0.85 : 1,
      }}
    />
  ) : (
    <div style={{
      height: maxH,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 12px",
    }}>
      <span style={{
        fontSize: Math.max(10, maxH * 0.28),
        fontWeight: 600,
        color: "#4b5563",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}>{displayName}</span>
    </div>
  );

  const inner = (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "8px 16px",
      transition: "opacity 0.2s",
    }}
    onMouseEnter={(e) => { if (websiteUrl) (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
    onMouseLeave={(e) => { if (websiteUrl) (e.currentTarget as HTMLElement).style.opacity = "1"; }}
    >
      {logoEl}
    </div>
  );

  if (websiteUrl) {
    return (
      <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "inline-flex" }}>
        {inner}
      </a>
    );
  }
  return <div style={{ display: "inline-flex" }}>{inner}</div>;
}
