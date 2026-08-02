"use client";

import type { ResolvedSponsors } from "@/lib/sponsor-render";
import SponsorLogo from "./SponsorLogo";

interface Props {
  data: ResolvedSponsors;
  compact?: boolean;
}

export default function TicketSponsorStrip({ data, compact = false }: Props) {
  if (!data?.hasSponsors) return null;

  const topTier = data.tiers[0];
  const restTiers = data.tiers.slice(1);

  return (
    <div style={{
      borderTop: "1px solid #e5e0d8",
      paddingTop: compact ? 10 : 16,
      marginTop: compact ? 10 : 16,
    }}>
      {topTier && topTier.sponsors.length > 0 && (
        <div style={{ textAlign: "center", marginBottom: restTiers.length > 0 ? 10 : 0 }}>
          <span style={{
            display: "block",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#9ca3af",
            marginBottom: 8,
          }}>{topTier.tierLabel}</span>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            {topTier.sponsors.map((s) => (
              <SponsorLogo
                key={s.id}
                displayName={s.displayName}
                logoUrl={s.logoUrl}
                websiteUrl={s.websiteUrl}
                tierKey={topTier.tierKey}
                surface="ticket"
                isMobile={compact}
              />
            ))}
          </div>
        </div>
      )}

      {restTiers.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderTop: topTier ? "1px solid #f0ede8" : undefined,
          paddingTop: topTier ? 8 : 0,
        }}>
          {restTiers.flatMap((tier) =>
            tier.sponsors.map((s) => (
              <SponsorLogo
                key={s.id}
                displayName={s.displayName}
                logoUrl={s.logoUrl}
                websiteUrl={s.websiteUrl}
                tierKey={tier.tierKey}
                surface="ticket"
                isMobile
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
