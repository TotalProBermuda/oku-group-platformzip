import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getZoneScorecards } from "@/lib/operations/scorecards";
import ScorecardsPage, { type ZoneScorecard } from "@/components/host/ScorecardsPage";
import AdminPageShell from "@/components/admin/AdminPageShell";
import KpiTile from "@/components/admin/KpiTile";
import OperationsSubTabs from "@/components/admin/OperationsSubTabs";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import type { Locale } from "@/types/i18n";

export const dynamic = "force-dynamic";

type TileCopy = { label: string; definition: string; source: string; narrative: string };

export default async function AdminScorecardsPage() {
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

  const venue = await prisma.venue.findFirst({ where: { slug: "gold-house" } });
  const scorecards = venue ? await getZoneScorecards(venue.id, { preset: "last_30_days" }) : [];

  const totalInitiated  = scorecards.reduce((s, c) => s + c.metrics.initiated, 0);
  const totalPatronized = scorecards.reduce((s, c) => s + c.metrics.patronized, 0);
  const globalConv      = totalInitiated > 0 ? Math.round((totalPatronized / totalInitiated) * 100) : 0;
  const totalOpLosses   = scorecards.reduce((s, c) => s + c.metrics.operationalLosses, 0);

  const heroSlab = (
    <div className="admin-hero-card" style={{ background: "#1a1614", color: "#fff" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
        {(ops.scorecardsEyebrow as string) ?? "Superadmin · Operations"}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{(ops.scorecardsTitle as string) ?? "Zone Scorecards"}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
        {(ops.scorecardsSubtitle as string) ?? "Per-concept conversion across the venue"}
      </div>
    </div>
  );

  const kpiSpecs = [
    { key: "totalInteractions", val: totalInitiated,        color: "#3b82f6" },
    { key: "totalPatronized",   val: totalPatronized,       color: "#10b981" },
    { key: "globalConversion",  val: `${globalConv}%`,      color: globalConv >= 50 ? "#10b981" : globalConv >= 25 ? "#f59e0b" : "#ef4444" },
    { key: "operationalLosses", val: totalOpLosses,         color: "#ef4444", href: "/admin/operations/conversion#loss-reasons" },
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
            href={"href" in spec ? spec.href : undefined}
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
          { href: "/admin/operations/conversion",     label: (ops.tabConversion   as string) ?? "Conversion" },
          { href: "/admin/operations/scorecards",     label: (ops.tabScorecards   as string) ?? "Scorecards" },
          { href: "/admin/operations/ledger-outbox",  label: (ops.tabLedgerOutbox as string) ?? "Ledger Outbox" },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        <ScorecardsPage scorecards={scorecards as ZoneScorecard[]} embedded hideHeader />
      </div>
    </AdminPageShell>
  );
}
