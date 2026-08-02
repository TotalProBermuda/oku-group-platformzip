"use client";

import { useEffect, useState } from "react";
import type { ResolvedSponsors } from "@/lib/sponsor-render";
import SponsorTierBlock from "./SponsorTierBlock";

interface Props {
  scopeType: "SERIES" | "EVENT";
  scopeId: string;
  dark?: boolean;
  initialData?: ResolvedSponsors | null;
}

export default function EventPageSponsorBlock({ scopeType, scopeId, dark = false, initialData }: Props) {
  const [data, setData] = useState<ResolvedSponsors | null>(initialData ?? null);

  useEffect(() => {
    if (initialData) return;
    fetch(`/api/v1/sponsors/resolve?scopeType=${scopeType}&scopeId=${scopeId}&surface=event_page`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [scopeType, scopeId, initialData]);

  if (!data?.hasSponsors) return null;

  const borderColor = dark ? "rgba(255,255,255,0.1)" : "#e5e0d8";
  const containerBg = dark ? "transparent" : "transparent";

  return (
    <section style={{
      background: containerBg,
      borderTop: `1px solid ${borderColor}`,
      padding: "48px 24px 40px",
    }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 36,
        }}>
          {data.tiers.map((tier) => (
            <SponsorTierBlock
              key={tier.tierId}
              tier={tier}
              surface="event_page"
              dark={dark}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
