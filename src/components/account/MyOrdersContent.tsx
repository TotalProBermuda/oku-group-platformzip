"use client";

import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";
import Link from "next/link";

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

const STATUS_BADGE: Record<string, string> = {
  PAID:     "badge badge-success",
  PENDING:  "badge badge-warning",
  REFUNDED: "badge badge-neutral",
  CANCELLED:"badge badge-danger",
  FAILED:   "badge badge-danger",
};

interface LineItem { id: string; nameSnapshot: string; qty: number; totalCents: number; }
interface Order {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string | Date;
  series: { title: string; slug: string; venue: string } | null;
  session: { title: string | null; startsAt: string | Date } | null;
  lineItems: LineItem[];
  tickets: { id: string }[];
}

export function MyOrdersContent({ orders }: { orders: Order[] }) {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  function fmtDate(d: Date | string) {
    return new Date(d).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="dashboard-canvas">
      {/* Header band */}
      <div style={{ background: "var(--layer-2)", borderBottom: "1px solid var(--color-border)", padding: "36px 0 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <div className="dash-eyebrow" style={{ color: "var(--color-primary)" }}>{t("common", "myAccount")}</div>
          <h1 className="page-header" style={{ marginBottom: 0 }}>{t("common", "orderHistory")}</h1>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginTop: 24 }}>
            <Link href="/my/tickets" className="tab">{t("common", "ticketsTab")}</Link>
            <span className="tab active">{t("common", "ordersTab")}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-body">
        {orders.length === 0 ? (
          <div className="empty-panel" style={{ padding: "72px 32px" }}>
            <div className="empty-panel-icon" style={{ fontSize: 26 }}>◇</div>
            <div className="empty-panel-title">{t("common", "noOrdersYet")}</div>
            <div className="empty-panel-desc">{t("common", "orderHistoryWillAppear")}</div>
            <Link href="/experiences" className="btn btn-primary">{t("common", "browseExperiences")}</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {orders.map((ord) => (
              <div key={ord.id} className="module-card" style={{ padding: 0, cursor: "default", overflow: "hidden" }}>
                {/* Order header */}
                <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--color-border-light)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, background: "var(--layer-3)" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 400, color: "var(--color-text)", letterSpacing: "-0.01em", marginBottom: 2 }}>
                      {ord.series?.title ?? "Experience"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {ord.session?.title ?? ""}{ord.session?.startsAt ? ` · ${fmtDate(ord.session.startsAt)}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span className={STATUS_BADGE[ord.status] || "badge badge-neutral"}>{ord.status}</span>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 400, color: "var(--color-text)" }}>
                      {fmt(ord.totalCents)}
                    </div>
                  </div>
                </div>

                {/* Line items */}
                <div style={{ padding: "16px 22px" }}>
                  {ord.lineItems.map((li) => (
                    <div key={li.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 7 }}>
                      <span>{li.nameSnapshot} × {li.qty}</span>
                      <span style={{ fontWeight: 600 }}>{fmt(li.totalCents)}</span>
                    </div>
                  ))}

                  <div style={{ borderTop: "1px solid var(--color-border-light)", marginTop: 14, paddingTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
                    <div>
                      <div className="kpi-label">{t("common", "orderDate")}</div>
                      <div style={{ fontSize: 13, color: "var(--color-text)", fontWeight: 500 }}>{fmtDate(ord.createdAt)}</div>
                    </div>
                    <div>
                      <div className="kpi-label">{t("common", "ticketsTab")}</div>
                      <div style={{ fontSize: 13, color: "var(--color-text)", fontWeight: 500 }}>{ord.tickets.length}</div>
                    </div>
                    <div>
                      <div className="kpi-label">{t("common", "venue")}</div>
                      <div style={{ fontSize: 13, color: "var(--color-text)", fontWeight: 500 }}>{ord.series?.venue ?? "—"}</div>
                    </div>
                    <div>
                      <div className="kpi-label">{t("common", "orderId")}</div>
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-text-muted)" }}>{ord.id.slice(0, 14)}…</div>
                    </div>
                  </div>
                </div>

                {/* Footer actions */}
                <div style={{ padding: "12px 22px", borderTop: "1px solid var(--color-border-light)", display: "flex", gap: 16, justifyContent: "flex-end" }}>
                  {ord.status === "PAID" && ord.tickets.length > 0 && (
                    <Link href="/my/tickets" style={{ fontSize: 13, color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>
                      {t("common", "viewTicketsLink")} ›
                    </Link>
                  )}
                  {ord.series?.slug && (
                    <Link href={`/experiences/${ord.series.slug}`} style={{ fontSize: 13, color: "var(--color-text-muted)", textDecoration: "none" }}>
                      {t("common", "viewExperienceLink")}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
