import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getZoneScorecards } from "@/lib/operations/scorecards";
import ScorecardsPage, { type ZoneScorecard } from "@/components/host/ScorecardsPage";
import AdminPageShell from "@/components/admin/AdminPageShell";
import KpiTile from "@/components/admin/KpiTile";
import OperationsSubTabs from "@/components/admin/OperationsSubTabs";
import UnlinkedRevenueSection from "@/components/admin/revenue/UnlinkedRevenueSection";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import type { Locale } from "@/types/i18n";

export const dynamic = "force-dynamic";

const LOSS_LABELS: Record<string, string> = {
  WAIT_TOO_LONG: "Wait too long",
  TABLE_NOT_READY: "No table available",
  GROUP_TOO_LARGE: "Large party — no fit",
  NOT_INTERESTED_IN_MENU: "Menu mismatch",
  PRICE_CONCERN: "Price sensitivity",
  PREFERRED_SEATING_UNAVAILABLE: "Preferred seating not available",
  CHANGED_MIND: "Guest changed mind",
  WENT_ELSEWHERE: "Found another venue",
  NO_RESPONSE: "Could not be reached",
  BAD_SERVICE: "Slow/poor host response",
  ELEVATOR_NOT_WORKING: "Venue access issue",
  TERRACE_UNAVAILABLE: "Terrace unavailable",
  OTHER: "Other",
};

const SOURCE_LABEL: Record<string, string> = {
  STREETSIDE_HOST: "Streetside Host",
  WALK_IN: "Walk-in",
  QR_CODE: "QR Code",
  UMBRELLA_SITE: "OKÜ Website",
  OKU_SITE: "OKÜ Site",
  CATCH_SITE: "CATCH Site",
  ADMIN: "Admin",
  TAXI_DRIVER: "Taxi Driver",
  TOUR_GUIDE: "Tour Guide",
  HOTEL_CONCIERGE: "Concierge",
};

async function getData(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const venue = await prisma.venue.findFirst();
  if (!venue) return null;

  const reservations = await prisma.reservation.findMany({
    where: { venueId: venue.id, createdAt: { gte: since } },
    include: {
      statusLogs: { orderBy: { changedAt: "asc" } },
      attributions: { include: { referrer: true } },
    },
  });

  const total = reservations.length;
  const byStatus = {
    PENDING: 0, ACKNOWLEDGED: 0, ARRIVED: 0, SEATED: 0,
    COMPLETED: 0, NO_SHOW: 0, CANCELLED: 0, WAITLISTED: 0,
  } as Record<string, number>;
  for (const r of reservations) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  const converted = (byStatus.SEATED ?? 0) + (byStatus.COMPLETED ?? 0);
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  const bySource: Record<string, { total: number; seated: number }> = {};
  for (const r of reservations) {
    if (!bySource[r.source]) bySource[r.source] = { total: 0, seated: 0 };
    bySource[r.source].total++;
    if (["SEATED", "COMPLETED"].includes(r.status)) bySource[r.source].seated++;
  }

  const lossReasons: Record<string, number> = {};
  for (const r of reservations) {
    const lossLog = r.statusLogs.find(l => l.lossReason);
    if (lossLog?.lossReason) {
      lossReasons[lossLog.lossReason] = (lossReasons[lossLog.lossReason] ?? 0) + 1;
    }
  }

  const avgWaitMin = (() => {
    const waits: number[] = [];
    for (const r of reservations) {
      if (r.arrivalConfirmedAt && r.seatedAt) {
        waits.push((r.seatedAt.getTime() - r.arrivalConfirmedAt.getTime()) / 60000);
      }
    }
    return waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
  })();

  return { total, byStatus, conversionRate, bySource, lossReasons, avgWaitMin, days, venue };
}

type TileCopy = { label: string; definition: string; source: string; narrative: string };

export default async function ConversionAnalyticsPage() {
  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";
  const tr = await getTranslations(locale, ["admin"]);
  const ops = ((tr.admin as Record<string, unknown>)?.ops ?? {}) as Record<string, unknown>;
  const tiles = (ops.tiles ?? {}) as Record<string, TileCopy>;
  const tooltipLabels = {
    definition: (ops.tooltipDefinition as string) ?? "What it measures",
    source:     (ops.tooltipSource as string)     ?? "Data source",
    narrative:  (ops.tooltipNarrative as string)  ?? "Narrative",
  };

  const [data, venue] = await Promise.all([
    getData(30),
    prisma.venue.findFirst({ where: { slug: "gold-house" } }),
  ]);
  const scorecards = venue ? await getZoneScorecards(venue.id, { preset: "last_30_days" }) : [];

  if (!data) {
    return <div style={{ padding: 48, color: "#64748b" }}>No venue data available.</div>;
  }

  const { total, byStatus, conversionRate, bySource, lossReasons, avgWaitMin } = data;

  const funnelSteps = [
    { label: "Submitted", count: total, color: "#3b82f6" },
    { label: "Acknowledged", count: (byStatus.ACKNOWLEDGED ?? 0) + (byStatus.ARRIVED ?? 0) + (byStatus.SEATED ?? 0) + (byStatus.COMPLETED ?? 0), color: "#8b5cf6" },
    { label: "Arrived", count: (byStatus.ARRIVED ?? 0) + (byStatus.SEATED ?? 0) + (byStatus.COMPLETED ?? 0), color: "#06b6d4" },
    { label: "Seated", count: (byStatus.SEATED ?? 0) + (byStatus.COMPLETED ?? 0), color: "#10b981" },
    { label: "Completed", count: byStatus.COMPLETED ?? 0, color: "#475569" },
  ];

  const lossTotal = (byStatus.NO_SHOW ?? 0) + (byStatus.CANCELLED ?? 0);
  const sortedSources = Object.entries(bySource).sort((a, b) => b[1].total - a[1].total);
  const sortedLoss = Object.entries(lossReasons).sort((a, b) => b[1] - a[1]);

  const heroSlab = (
    <div className="admin-hero-card" style={{ background: "#0f172a", color: "#fff" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
        {(ops.conversionEyebrow as string) ?? "Superadmin · Operations"}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{(ops.conversionTitle as string) ?? "Conversion & Loss Analytics"}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
        {((ops.conversionSubtitle as string) ?? "Last 30 days · {venue}").replace("{venue}", data.venue.name)}
      </div>
    </div>
  );

  const kpiSpecs = [
    { key: "totalLeads",      val: total,                                                color: "#3b82f6", href: "#funnel"        },
    { key: "converted",       val: (byStatus.SEATED ?? 0) + (byStatus.COMPLETED ?? 0),   color: "#10b981", href: "#funnel"        },
    { key: "lost",            val: lossTotal,                                            color: "#ef4444", href: "#loss-reasons"  },
    { key: "noShows",         val: byStatus.NO_SHOW ?? 0,                                color: "#f59e0b", href: "#breakdown"     },
    { key: "conversionRate",  val: `${conversionRate}%`,                                 color: conversionRate >= 70 ? "#10b981" : conversionRate >= 40 ? "#f59e0b" : "#ef4444", href: "#funnel" },
    { key: "avgWait",         val: avgWaitMin != null ? `${avgWaitMin}m` : "—",          color: "#8b5cf6", href: undefined        },
  ] as const;

  const kpiRow = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
      {kpiSpecs.map(spec => {
        const copy = tiles[spec.key];
        return (
          <KpiTile
            key={spec.key}
            label={copy?.label ?? spec.key}
            value={spec.val}
            color={spec.color}
            href={spec.href}
            tooltip={copy ? { definition: copy.definition, source: copy.source, narrative: copy.narrative } : undefined}
            tooltipLabels={tooltipLabels}
          />
        );
      })}
    </div>
  );

  return (
    <AdminPageShell hero={heroSlab} kpiRow={kpiRow}>
      <OperationsSubTabs
        tabs={[
          { href: "/admin/operations/conversion", label: (ops.tabConversion as string) ?? "Conversion" },
          { href: "/admin/operations/scorecards", label: (ops.tabScorecards as string) ?? "Scorecards" },
        ]}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {/* Conversion Funnel */}
        <div id="funnel" style={{ background: "#fff", borderRadius: 16, padding: "24px", border: "1px solid #e2e8f0", scrollMarginTop: 96 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 20 }}>Conversion Funnel</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {funnelSteps.map((step, i) => {
              const pct = total > 0 ? Math.round((step.count / total) * 100) : 0;
              return (
                <div key={step.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{step.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: step.color }}>{step.count} <span style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>({pct}%)</span></span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "#f1f5f9", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: step.color, borderRadius: 4, transition: "width 0.6s" }} />
                  </div>
                  {i < funnelSteps.length - 1 && funnelSteps[i + 1].count < step.count && (
                    <div style={{ fontSize: 10, color: "#ef4444", marginTop: 2, textAlign: "right" }}>
                      ↓ {step.count - funnelSteps[i + 1].count} lost ({Math.round(((step.count - funnelSteps[i + 1].count) / step.count) * 100)}% drop-off)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Source Effectiveness */}
          <div id="sources" style={{ background: "#fff", borderRadius: 16, padding: "24px", border: "1px solid #e2e8f0", scrollMarginTop: 96 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 16 }}>Source Effectiveness</div>
            {sortedSources.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 12 }}>No data</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sortedSources.map(([source, d]) => {
                  const rate = d.total > 0 ? Math.round((d.seated / d.total) * 100) : 0;
                  return (
                    <div key={source}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{SOURCE_LABEL[source] ?? source}</span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>{d.seated}/{d.total} · <span style={{ fontWeight: 700, color: rate >= 60 ? "#10b981" : rate >= 35 ? "#f59e0b" : "#ef4444" }}>{rate}%</span></span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "#f1f5f9", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${rate}%`, background: rate >= 60 ? "#10b981" : rate >= 35 ? "#f59e0b" : "#ef4444", borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Loss Reasons */}
          <div id="loss-reasons" style={{ background: "#fff", borderRadius: 16, padding: "24px", border: "1px solid #e2e8f0", scrollMarginTop: 96 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 16 }}>Top Loss Reasons</div>
            {sortedLoss.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 12 }}>No structured loss reasons captured yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sortedLoss.slice(0, 8).map(([reason, count]) => {
                  const pct = lossTotal > 0 ? Math.round((count / lossTotal) * 100) : 0;
                  return (
                    <div key={reason}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>{LOSS_LABELS[reason] ?? reason.replace(/_/g, " ")}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>{count}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: "#fef2f2", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#fca5a5", borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Status breakdown table */}
        <div id="breakdown" style={{ background: "#fff", borderRadius: 16, padding: "24px", border: "1px solid #e2e8f0", scrollMarginTop: 96 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 16 }}>Operational Breakdown — Last 30 Days</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                  {["Status", "Count", "% of Total"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(byStatus).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <tr key={status} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#334155" }}>{status.replace(/_/g, " ")}</td>
                    <td style={{ padding: "10px 14px", fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{count}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{total > 0 ? Math.round((count / total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Zone Scorecards Section */}
        <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: 28 }}>
          <ScorecardsPage scorecards={scorecards as ZoneScorecard[]} embedded />
        </div>

        {/* Unlinked Revenue Audit — surfaces walk-in revenue and broken trust chains */}
        <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: 28 }}>
          <UnlinkedRevenueSection />
        </div>
      </div>
    </AdminPageShell>
  );
}
