import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import type { Locale } from "@/types/i18n";
import Link from "next/link";

function fmt(cents: number) { return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`; }

export default async function ExperienceAnalyticsPage() {
  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";
  const tr = await getTranslations(locale, ["admin"]);
  const t = (key: string) => (tr.admin as Record<string, string>)?.[key] ?? key;

  const analytics = await prisma.experienceAnalyticsDaily.findMany({
    orderBy: { grossRevenueCents: "desc" },
    include: { series: { select: { title: true, slug: true, venue: true, status: true } } },
  });

  const totals = analytics.reduce((acc, row) => ({
    pageViews:         acc.pageViews         + row.pageViews,
    checkoutStarts:    acc.checkoutStarts    + row.checkoutStarts,
    ordersPaid:        acc.ordersPaid        + row.ordersPaid,
    ticketsSold:       acc.ticketsSold       + row.ticketsSold,
    grossRevenueCents: acc.grossRevenueCents + row.grossRevenueCents,
    waitlistSignups:   acc.waitlistSignups   + row.waitlistSignups,
    newsletterSignups: acc.newsletterSignups + row.newsletterSignups,
    memberPurchases:   acc.memberPurchases   + row.memberPurchases,
  }), { pageViews: 0, checkoutStarts: 0, ordersPaid: 0, ticketsSold: 0, grossRevenueCents: 0, waitlistSignups: 0, newsletterSignups: 0, memberPurchases: 0 });

  const conversionRate = totals.checkoutStarts > 0 ? Math.round((totals.ordersPaid / totals.checkoutStarts) * 100) : 0;
  const avgOrderCents  = totals.ordersPaid > 0 ? Math.round(totals.grossRevenueCents / totals.ordersPaid) : 0;
  const memberRate     = totals.ordersPaid > 0 ? Math.round((totals.memberPurchases / totals.ordersPaid) * 100) : 0;

  const convPct = t("conversionPct").replace("{rate}", String(conversionRate));

  const kpis = [
    { label: t("pageViews"),       value: totals.pageViews.toLocaleString(),         sub: t("acrossAllExperiences") },
    { label: t("checkoutStarts"),  value: totals.checkoutStarts.toLocaleString(),    sub: convPct },
    { label: t("ordersPaid"),      value: totals.ordersPaid.toLocaleString(),        sub: t("confirmedPurchases") },
    { label: t("ticketsLabel"),    value: totals.ticketsSold.toLocaleString(),       sub: t("acrossAllEvents") },
    { label: t("grossRevenue"),    value: fmt(totals.grossRevenueCents),             sub: t("beforeFeesAndTax") },
    { label: t("avgOrderValue"),   value: fmt(avgOrderCents),                        sub: t("perTransaction") },
    { label: t("waitlistSignups"), value: totals.waitlistSignups.toLocaleString(),   sub: t("intentCaptured") },
    { label: t("memberPurchases"), value: `${memberRate}%`,                          sub: t("ofOrdersFromMembers") },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{t("experienceAnalyticsTitle")}</h2>
        <Link href="/admin/experiences" className="btn btn-ghost btn-sm">{t("allExperiences")}</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 40 }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="stat-card">
            <div className="stat-value" style={{ fontSize: 28 }}>{kpi.value}</div>
            <div className="stat-label">{kpi.label}</div>
            <div style={{ fontSize: 11, color: "#b0a9a4", marginTop: 2 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>{t("byExperience")}</h2>
      <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e0d8", background: "#fafaf9" }}>
                {[
                  t("experience"), t("pageViews"), t("conversion"), t("ticketsLabel"),
                  t("revenue"), t("waitlistSignups"), t("newsletter"), t("members"), ""
                ].map((h, i) => (
                  <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analytics.map((row) => {
                const conv = row.checkoutStarts > 0 ? Math.round((row.ordersPaid / row.checkoutStarts) * 100) : 0;
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 600, color: "#1a1614" }}>{row.series?.title ?? "—"}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.series?.venue} · {row.series?.status}</div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280" }}>{row.pageViews.toLocaleString()}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: 13, color: "#1a1614" }}>{conv}%</div>
                      <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: "#f3f4f6", width: 60 }}>
                        <div style={{ height: "100%", background: "#c41e3a", width: `${Math.min(100, conv)}%`, borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280" }}>{row.ticketsSold}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: "#1a1614" }}>{fmt(row.grossRevenueCents)}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280" }}>{row.waitlistSignups}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280" }}>{row.newsletterSignups}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280" }}>{row.memberPurchases}</td>
                    <td style={{ padding: "14px 16px" }}>
                      {row.series?.slug && (
                        <div style={{ display: "flex", gap: 10 }}>
                          <Link href="/admin/experiences" style={{ fontSize: 12, color: "#c41e3a", textDecoration: "none" }}>{t("manage")}</Link>
                          <Link href={`/experiences/${row.series.slug}`} style={{ fontSize: 12, color: "#9ca3af", textDecoration: "none" }} target="_blank">{t("viewLink")} ↗</Link>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {analytics.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px", color: "#9ca3af" }}>{t("noAnalyticsData")}</div>
        )}
      </div>
    </>
  );
}
