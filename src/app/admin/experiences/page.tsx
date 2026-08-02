import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SeriesStatus } from "@prisma/client";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import type { Locale } from "@/types/i18n";
import Link from "next/link";
import ArchiveExperienceButton from "@/components/admin/ArchiveExperienceButton";

function fmt(cents: number) { return `$${(cents / 100).toFixed(0)}`; }
function fmtDate(d: Date | string | null | undefined, locale: string) {
  if (!d) return "—";
  const loc = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";
  return new Date(d).toLocaleDateString(loc, { month: "short", day: "numeric", year: "numeric" });
}

const statusColor: Record<string, { bg: string; text: string }> = {
  DRAFT:     { bg: "#f3f4f6", text: "#6b7280" },
  PUBLISHED: { bg: "#dcfce7", text: "#16a34a" },
  SOLD_OUT:  { bg: "#fef3c7", text: "#d97706" },
  CANCELLED: { bg: "#fee2e2", text: "#dc2626" },
  ARCHIVED:  { bg: "#f3f4f6", text: "#9ca3af" },
};

interface Props { searchParams: Promise<{ showArchived?: string }> }

export default async function AdminExperiencesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const showArchived = sp.showArchived === "1";

  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";
  const tr = await getTranslations(locale, ["admin"]);
  const t = (key: string) => (tr.admin as Record<string, string>)?.[key] ?? key;

  const statusFilter: SeriesStatus[] = showArchived
    ? [SeriesStatus.DRAFT, SeriesStatus.PUBLISHED, SeriesStatus.SOLD_OUT, SeriesStatus.CANCELLED, SeriesStatus.ARCHIVED]
    : [SeriesStatus.DRAFT, SeriesStatus.PUBLISHED, SeriesStatus.SOLD_OUT, SeriesStatus.CANCELLED];

  const series = await prisma.series.findMany({
    where: { status: { in: statusFilter } },
    orderBy: { createdAt: "desc" },
    include: {
      experienceInfluencer: { include: { influencer: { select: { displayName: true } } } },
      _count: { select: { Order: true } },
    },
  });

  const analytics = await prisma.experienceAnalyticsDaily.groupBy({
    by: ["seriesId"],
    _sum: { grossRevenueCents: true, ticketsSold: true },
  });
  const analyticsMap = new Map(analytics.map((a) => [a.seriesId, a._sum]));

  const totalRevenue = analytics.reduce((sum, a) => sum + (a._sum.grossRevenueCents ?? 0), 0);
  const totalTickets = analytics.reduce((sum, a) => sum + (a._sum.ticketsSold ?? 0), 0);
  const published    = series.filter((s) => s.status === "PUBLISHED").length;

  const archivedCount = await prisma.series.count({ where: { status: "ARCHIVED" } });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{t("experiencesTitle")}</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {archivedCount > 0 && (
            <Link
              href={showArchived ? "/admin/experiences" : "/admin/experiences?showArchived=1"}
              style={{ fontSize: 12, color: showArchived ? "#c41e3a" : "#9ca3af", border: "1px solid #e5e0d8", borderRadius: 8, padding: "6px 12px", textDecoration: "none", fontWeight: 500 }}
            >
              {showArchived ? "Hide Archived" : `Show Archived (${archivedCount})`}
            </Link>
          )}
          <Link href="/admin/experiences/new" className="btn btn-primary btn-sm">{t("newExperience")}</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 32 }}>
        {[
          { label: t("totalExperiencesLabel"), value: series.length },
          { label: t("publishedLabel"),        value: published },
          { label: t("ticketsLabel"),           value: totalTickets },
          { label: t("grossRevenue"),           value: fmt(totalRevenue) },
        ].map((kpi) => (
          <div key={kpi.label} className="stat-card">
            <div className="stat-value" style={{ fontSize: 28 }}>{kpi.value}</div>
            <div className="stat-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e0d8", background: "#fafaf9" }}>
                {[
                  t("experience"), "Status", "Venue", t("host"), t("starts"),
                  t("soldCap"), t("revenue"), t("orders"), ""
                ].map((h, i) => (
                  <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => {
                const sc = statusColor[s.status] ?? statusColor.DRAFT;
                const agg = analyticsMap.get(s.id);
                const inf = s.experienceInfluencer?.[0]?.influencer;
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6", opacity: s.status === "ARCHIVED" ? 0.65 : 1 }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 600, color: "#1a1614", marginBottom: 2 }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{s.slug}</div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: sc.text, background: sc.bg, padding: "3px 8px", borderRadius: 6 }}>{s.status}</span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280" }}>{s.venue ?? "—"}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280" }}>
                      {s.hostType === "INFLUENCER" && inf ? inf.displayName : s.hostType}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>{fmtDate(s.startsAt, locale)}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#1a1614" }}>
                      {s.capacitySold} / {s.capacityTotal}
                      <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: "#f3f4f6", overflow: "hidden", width: 80 }}>
                        <div style={{ height: "100%", background: "#c41e3a", width: `${s.capacityTotal > 0 ? Math.min(100, (s.capacitySold / s.capacityTotal) * 100) : 0}%` }} />
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: "#1a1614" }}>{fmt(agg?.grossRevenueCents ?? 0)}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280" }}>{s._count.Order}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 10, whiteSpace: "nowrap", alignItems: "center" }}>
                        <Link href={`/admin/experiences/${s.id}`} style={{ fontSize: 12, color: "#c41e3a", textDecoration: "none", fontWeight: 500 }}>{t("edit")}</Link>
                        <Link href={`/admin/experiences/${s.id}/attendees`} style={{ fontSize: 12, color: "#6b7280", textDecoration: "none" }}>{t("attendeesLink")}</Link>
                        {s.status !== "ARCHIVED" && (
                          <Link href={`/experiences/${s.slug}`} style={{ fontSize: 12, color: "#9ca3af", textDecoration: "none" }} target="_blank">{t("viewLink")} ↗</Link>
                        )}
                        <ArchiveExperienceButton seriesId={s.id} currentStatus={s.status} label="Archive" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {series.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px", color: "#9ca3af" }}>
            {t("noExperiencesYet")} <Link href="/admin/experiences/new" style={{ color: "#c41e3a" }}>{t("createFirst")}</Link>
          </div>
        )}
      </div>
    </>
  );
}
