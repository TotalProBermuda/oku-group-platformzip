"use client";

import MetricCard from "@/components/ui/MetricCard";

type LossReason = { reason: string; count: number };

export type ZoneScorecard = {
  zone: { id: string; name: string; conceptKey: string; zoneType: string };
  metrics: {
    initiated: number;
    arrived: number;
    patronized: number;
    lost: number;
    conversionRate: number;
    operationalLosses: number;
  };
  topLossReasons: LossReason[];
};

const ZONE_COLORS: Record<string, string> = {
  oku: "#1a1614", catch: "#1e3a5f", terrace: "#2d4a1e", vip: "#4a1e1e"
};
const ZONE_LOGO: Record<string, string> = {
  oku:     "/images/oku-logo-white.svg",
  catch:   "/images/logo-catch.webp",
  terrace: "/images/logo-terrace-light.png",
  vip:     "/images/logo-vip-door.svg",
};

const LOSS_REASON_LABELS: Record<string, string> = {
  PREFERRED_SEATING_UNAVAILABLE: "Preferred seating unavailable",
  TERRACE_UNAVAILABLE:           "Terrace unavailable",
  WAIT_TOO_LONG:                 "Wait too long",
  TABLE_NOT_READY:               "Table not ready",
  GROUP_TOO_LARGE:               "Group too large",
  NOT_ENOUGH_SEATS:              "Not enough seats",
  NOT_INTERESTED_IN_MENU:        "Not interested in menu",
  PRICE_CONCERN:                 "Price concern",
  BAD_SERVICE:                   "Bad service",
  ELEVATOR_NOT_WORKING:          "Elevator not working",
  CHANGED_MIND:                  "Changed mind",
  WENT_ELSEWHERE:                "Went elsewhere",
  NO_RESPONSE:                   "No response",
  OTHER:                         "Other",
};

function isOperational(reason: string) {
  return ["PREFERRED_SEATING_UNAVAILABLE","TERRACE_UNAVAILABLE","WAIT_TOO_LONG","TABLE_NOT_READY","ELEVATOR_NOT_WORKING","NOT_ENOUGH_SEATS"].includes(reason);
}

function ConversionFunnel({ metrics }: { metrics: ZoneScorecard["metrics"] }) {
  const steps = [
    { label: "Initiated",  value: metrics.initiated,  desc: "interactions" },
    { label: "Arrived",    value: metrics.arrived,    desc: "made it upstairs" },
    { label: "Patronized", value: metrics.patronized, desc: "seated & served" },
  ];
  const max = Math.max(...steps.map(s => s.value), 1);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "12px 0" }}>
      {steps.map((step, i) => {
        const h = Math.max(24, Math.round((step.value / max) * 80));
        return (
          <div key={step.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{step.value}</div>
            <div style={{ width: "100%", height: h, background: i === 2 ? "#1f8a55" : i === 1 ? "#c41e3a" : "#e8e2dd", borderRadius: "4px 4px 0 0", transition: "height 0.4s" }} />
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", textAlign: "center" }}>{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function ZoneScorecardCard({ card }: { card: ZoneScorecard }) {
  const color   = ZONE_COLORS[card.zone.conceptKey] ?? "#555";
  const logoSrc = ZONE_LOGO[card.zone.conceptKey];
  const conv    = card.metrics.conversionRate;

  return (
    <div style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 16, overflow: "hidden" }}>
      {/* Zone header */}
      <div style={{ background: color, color: "#fff", padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>{card.zone.zoneType.replace("_"," ")}</div>
          {logoSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoSrc} alt={card.zone.name} style={{ height: 28, width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          ) : (
            <div style={{ fontSize: 20, fontWeight: 700 }}>{card.zone.name}</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: conv >= 50 ? "#34d399" : conv >= 25 ? "#fbbf24" : "#f87171" }}>{conv}%</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Conversion</div>
        </div>
      </div>

      <div style={{ padding: "18px 20px" }}>
        {/* Funnel */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 8 }}>Conversion Funnel</div>
          <ConversionFunnel metrics={card.metrics} />
        </div>

        {/* Key metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
          <MetricCard label="Total Lost" value={card.metrics.lost} />
          <MetricCard label="Operational Losses" value={card.metrics.operationalLosses} accent={card.metrics.operationalLosses > 3} />
        </div>

        {/* Loss reasons */}
        {card.topLossReasons.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 10 }}>Top Loss Reasons</div>
            {card.topLossReasons.map(lr => (
              <div key={lr.reason} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0ebe7" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isOperational(lr.reason) && <span title="Operational issue" style={{ color: "#c41e3a", fontSize: 12 }}>⚠</span>}
                  <span style={{ fontSize: 13 }}>{LOSS_REASON_LABELS[lr.reason] ?? lr.reason.replace(/_/g," ")}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: "#f0ebe7", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: isOperational(lr.reason) ? "#c41e3a" : "#e8e2dd", width: `${Math.min((lr.count / (card.topLossReasons[0]?.count ?? 1)) * 100, 100)}%`, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20 }}>{lr.count}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {card.metrics.initiated === 0 && (
          <div style={{ textAlign: "center", color: "#7d7269", fontSize: 13, padding: "12px 0" }}>No attribution data in this period.</div>
        )}
      </div>
    </div>
  );
}

interface ScorecardsPageProps {
  scorecards: ZoneScorecard[];
  embedded?: boolean;
  hideHeader?: boolean;
}

export default function ScorecardsPage({ scorecards, embedded = false, hideHeader = false }: ScorecardsPageProps) {
  const totalInitiated = scorecards.reduce((s, c) => s + c.metrics.initiated, 0);
  const totalPatronized = scorecards.reduce((s, c) => s + c.metrics.patronized, 0);
  const globalConv = totalInitiated > 0 ? Math.round((totalPatronized / totalInitiated) * 100) : 0;
  const totalOpLosses = scorecards.reduce((s, c) => s + c.metrics.operationalLosses, 0);

  const outerStyle: React.CSSProperties = embedded
    ? { fontFamily: "var(--font-sans)" }
    : { background: "#faf8f6", minHeight: "100vh", fontFamily: "var(--font-sans)" };

  return (
    <div style={outerStyle}>
      {!hideHeader && (
        <div style={{ background: "#1a1614", color: "#fff", padding: "32px 32px 28px", borderRadius: embedded ? 12 : 0 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>Admin · Operations</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 300, margin: "0 0 20px" }}>Zone Scorecards</h1>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {[
              { label: "Total Interactions",   val: totalInitiated },
              { label: "Total Patronized",     val: totalPatronized },
              { label: "Global Conversion",    val: `${globalConv}%` },
              { label: "Operational Losses",   val: totalOpLosses },
            ].map(m => (
              <div key={m.label} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{m.val}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 3 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: embedded ? "0" : "24px 28px", marginTop: hideHeader ? 0 : (embedded ? 20 : 0) }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 20 }}>
          {scorecards.map(card => (
            <ZoneScorecardCard key={card.zone.id} card={card} />
          ))}
        </div>
        {scorecards.length === 0 && (
          <div style={{ textAlign: "center", padding: "64px", color: "#7d7269" }}>No scorecards available.</div>
        )}
      </div>
    </div>
  );
}
