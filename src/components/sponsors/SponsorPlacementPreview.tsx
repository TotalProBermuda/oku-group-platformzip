"use client";

import type { ResolvedSponsors } from "@/lib/sponsor-render";
import SponsorTierBlock from "./SponsorTierBlock";
import TicketSponsorStrip from "./TicketSponsorStrip";

type PreviewSurface = "event_page" | "ticket" | "email";

interface Props {
  data: ResolvedSponsors | null;
  surface: PreviewSurface;
}

export default function SponsorPlacementPreview({ data, surface }: Props) {
  if (!data) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
        Loading preview…
      </div>
    );
  }

  if (!data.hasSponsors) {
    return (
      <div style={{ padding: "32px 24px", textAlign: "center", background: "#fafaf9", border: "1px dashed #d1cdc7", borderRadius: 12 }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>◎</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
          No active sponsors on this surface yet
        </div>
        <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
          Select a <strong>Brand</strong> and <strong>Tier</strong> in the form above, then click <strong style={{ color: "#c41e3a" }}>Add Sponsor</strong> to see the live preview here.
        </div>
      </div>
    );
  }

  if (surface === "event_page") {
    return (
      <div style={{ background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ background: "#1a1614", padding: "24px 24px 16px", color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Event Page — Sponsor Block Preview
        </div>
        <div style={{ padding: "40px 32px", background: "white" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {data.tiers.map((tier) => (
              <SponsorTierBlock key={tier.tierId} tier={tier} surface="event_page" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (surface === "ticket") {
    return (
      <div style={{ background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ background: "#1a1614", padding: "24px 24px 16px", color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Ticket — Sponsor Strip Preview
        </div>
        <div style={{ maxWidth: 380, margin: "0 auto", padding: "24px" }}>
          <div style={{ background: "white", borderRadius: 12, padding: "24px", border: "1px solid #e5e0d8" }}>
            <div style={{ height: 8, background: "#e5e0d8", borderRadius: 4, marginBottom: 12 }} />
            <div style={{ height: 6, background: "#f0ede8", borderRadius: 4, width: "60%", marginBottom: 20 }} />
            <div style={{ width: 80, height: 80, background: "#f0ede8", borderRadius: 8, margin: "0 auto 20px" }} />
            <TicketSponsorStrip data={data} compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: "#1a1614", padding: "24px 24px 16px", color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Email — Sponsor Section Preview
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px" }}>
        <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ background: "#1a1614", height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Event Hero</span>
          </div>
          <div style={{ padding: "28px 24px 8px", borderTop: "1px solid #f0ede8" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {data.tiers.map((tier) => (
                <SponsorTierBlock key={tier.tierId} tier={tier} surface="email" isMobile />
              ))}
            </div>
          </div>
          <div style={{ background: "#fafaf9", borderTop: "1px solid #e5e0d8", padding: "16px 24px", textAlign: "center" }}>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>OKÜ Hospitality Group · Unsubscribe</span>
          </div>
        </div>
      </div>
    </div>
  );
}
