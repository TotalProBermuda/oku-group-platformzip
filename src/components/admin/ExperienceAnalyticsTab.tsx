"use client";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

interface FunnelStep {
  stage: string;
  label: string;
  count: number;
  rateFromPrevious: number;
  rateFromTop: number;
}

interface CommissionPerformer {
  influencerId: string;
  handle: string;
  name: string | null;
  ordersCount: number;
  ticketsSold: number;
  revenueUsd: number;
  checkedInCount: number;
  completedCount: number;
  checkInRate: number;
  completionRate: number;
  avgDurationMinutes: number | null;
  commissionOwedCents: number;
}

interface DropoffData {
  reasonBreakdown: { reason: string; count: number; outcomeTypes: Record<string, number> }[];
  avgDurationMinutes: number | null;
  durationDistribution: { label: string; count: number }[];
  tierDropoff: Record<string, number>;
}

interface GiftBagSession {
  sessionId: string;
  title: string | null;
  startsAt: string;
  giftBagEnabled: boolean;
  givenCount: number;
  ticketGiven: number;
  blockGiven: number;
  eligibleTickets: number;
  coverageRate: number | null;
  distributors: { name: string; count: number }[];
}

interface GiftBagData {
  sessions: GiftBagSession[];
  totals: { givenCount: number; ticketGiven: number; blockGiven: number; eligibleTickets: number };
}

export default function ExperienceAnalyticsTab({ seriesId }: { seriesId: string }) {
  const t = useTranslation();
  const locale = useLocale();
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [noShows, setNoShows] = useState(0);
  const [performers, setPerformers] = useState<CommissionPerformer[]>([]);
  const [dropoff, setDropoff] = useState<DropoffData | null>(null);
  const [giftBags, setGiftBags] = useState<GiftBagData | null>(null);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subtab, setSubtab] = useState<"funnel" | "dropoff" | "commission" | "giftbags">("funnel");

  const numFmt = new Intl.NumberFormat(
    locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US",
    { style: "currency", currency: "USD", maximumFractionDigits: 0 }
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [fRes, dRes, cRes, gRes] = await Promise.all([
      fetch(`/api/v1/events/${seriesId}/funnel`),
      fetch(`/api/v1/events/${seriesId}/dropoff`),
      fetch(`/api/v1/events/${seriesId}/commission-performance`),
      fetch(`/api/v1/events/${seriesId}/gift-bags`),
    ]);
    const [fd, dd, cd, gd] = await Promise.all([fRes.json(), dRes.json(), cRes.json(), gRes.json()]);
    if (fd.ok) { setFunnel(fd.funnel ?? []); setNoShows(fd.noShows ?? 0); }
    if (dd.ok) setDropoff(dd);
    if (cd.ok) { setPerformers(cd.performers ?? []); setTotals(cd.totals); }
    if (gd.ok) setGiftBags({ sessions: gd.sessions ?? [], totals: gd.totals });
    setLoading(false);
  }, [seriesId]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 180_000);

  const statBox = (value: string | number, label: string, sub?: string) => (
    <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "20px 24px", minWidth: 140 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1614", fontFamily: "var(--font-heading)" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const TABS = [
    { id: "funnel",     label: t("analytics", "funnel") ?? "Event Funnel" },
    { id: "dropoff",    label: t("analytics", "dropoff") ?? "Drop-off Analysis" },
    { id: "commission", label: t("analytics", "commission") ?? "Commission Performance" },
    { id: "giftbags",   label: t("analytics", "giftbags") ?? "Gift Bags" },
  ] as const;

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "#1a1614", margin: 0 }}>{t("analytics", "title") ?? "Event Analytics"}</h2>
          <p style={{ color: "#7c7168", fontSize: 14, marginTop: 4 }}>{t("analytics", "subtitle") ?? "Funnel, attendance, and commission insights"}</p>
        </div>
        <div style={{ display: "flex", gap: 8, background: "#f3f1ee", borderRadius: 10, padding: 4 }}>
          {TABS.map((tb) => (
            <button key={tb.id} onClick={() => setSubtab(tb.id)}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: subtab === tb.id ? 600 : 400, background: subtab === tb.id ? "white" : "transparent", color: subtab === tb.id ? "#1a1614" : "#6b7280", boxShadow: subtab === tb.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div className="loading-spinner" style={{ margin: "0 auto" }} />
        </div>
      )}

      {!loading && subtab === "funnel" && (
        <div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
            {statBox(noShows, t("analytics", "no_shows") ?? "No-Shows")}
            {funnel[0] && statBox(funnel[0].count, t("analytics", "registrations") ?? "Registrations")}
            {funnel[1] && statBox(funnel[1].count, t("analytics", "tickets_sold") ?? "Tickets Sold")}
            {funnel[2] && statBox(`${Math.round(funnel[2].rateFromTop * 100)}%`, t("analytics", "check_in_rate") ?? "Check-In Rate", `${funnel[2].count} ${t("analytics", "checked_in") ?? "checked in"}`)}
          </div>

          <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e0d8", fontWeight: 600, fontSize: 14 }}>{t("analytics", "conversion_funnel") ?? "Conversion Funnel"}</div>
            {funnel.map((step, i) => {
              const barWidth = step.rateFromTop * 100;
              const colors = ["#c41e3a", "#e05a72", "#ea8899", "#f2b3bd"];
              return (
                <div key={step.stage} style={{ padding: "16px 24px", borderBottom: i < funnel.length - 1 ? "1px solid #f5f3f0" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1614" }}>{step.label}</span>
                      {i > 0 && (
                        <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 10 }}>
                          {Math.round(step.rateFromPrevious * 100)}% {t("analytics", "from_prev") ?? "from previous"}
                        </span>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 18, color: "#1a1614" }}>{step.count.toLocaleString()}</span>
                  </div>
                  <div style={{ background: "#f5f3f0", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${barWidth}%`, background: colors[i] ?? "#e5e0d8", borderRadius: 4, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && subtab === "dropoff" && dropoff && (
        <div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
            {statBox(
              dropoff.avgDurationMinutes ? `${Math.round(dropoff.avgDurationMinutes)}m` : "—",
              t("analytics", "avg_duration") ?? "Avg Stay Duration"
            )}
            {statBox(
              dropoff.reasonBreakdown.reduce((s, r) => s + r.count, 0),
              t("analytics", "total_outcomes") ?? "Recorded Outcomes"
            )}
          </div>

          {dropoff.durationDistribution.length > 0 && (
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e0d8", fontWeight: 600, fontSize: 14 }}>{t("analytics", "duration_distribution") ?? "Duration Distribution"}</div>
              {dropoff.durationDistribution.map((bucket) => {
                const max = Math.max(...dropoff.durationDistribution.map((b) => b.count), 1);
                return (
                  <div key={bucket.label} style={{ padding: "12px 24px", borderBottom: "1px solid #f5f3f0", display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ width: 90, fontSize: 13, color: "#374151", flexShrink: 0 }}>{bucket.label}</span>
                    <div style={{ flex: 1, background: "#f5f3f0", borderRadius: 4, height: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(bucket.count / max) * 100}%`, background: "#c41e3a", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1614", minWidth: 30, textAlign: "right" }}>{bucket.count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {dropoff.reasonBreakdown.length > 0 && (
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e0d8", fontWeight: 600, fontSize: 14 }}>{t("analytics", "dropoff_reasons") ?? "Drop-off Reasons"}</div>
              {dropoff.reasonBreakdown.map((r) => (
                <div key={r.reason} style={{ padding: "14px 24px", borderBottom: "1px solid #f5f3f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, color: "#374151" }}>{r.reason.replace(/_/g, " ")}</span>
                  <span style={{ fontWeight: 600, color: "#1a1614" }}>{r.count}</span>
                </div>
              ))}
            </div>
          )}

          {dropoff.reasonBreakdown.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <div>{t("analytics", "no_outcome_data") ?? "No outcome data recorded yet."}</div>
            </div>
          )}
        </div>
      )}

      {!loading && subtab === "commission" && (
        <div>
          {totals && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
              {statBox(numFmt.format(totals.revenueUsd), t("analytics", "total_revenue") ?? "Total Revenue")}
              {statBox(numFmt.format(totals.commissionOwedCents / 100), t("analytics", "commission_owed") ?? "Commission Owed")}
              {statBox(totals.ticketsSold, t("analytics", "attributed_tickets") ?? "Attributed Tickets")}
            </div>
          )}

          {performers.length > 0 ? (
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fafaf9" }}>
                    {[
                      t("analytics", "influencer") ?? "Influencer",
                      t("analytics", "orders") ?? "Orders",
                      t("analytics", "tickets") ?? "Tickets",
                      t("analytics", "revenue") ?? "Revenue",
                      t("analytics", "check_in_rate") ?? "Check-in %",
                      t("analytics", "completion_rate") ?? "Completion %",
                      t("analytics", "avg_stay") ?? "Avg Stay",
                      t("analytics", "commission") ?? "Commission",
                    ].map((h) => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e0d8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {performers.map((p) => (
                    <tr key={p.influencerId} style={{ borderBottom: "1px solid #f5f3f0" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#1a1614", fontSize: 14 }}>@{p.handle}</div>
                        {p.name && <div style={{ fontSize: 12, color: "#9ca3af" }}>{p.name}</div>}
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "#374151" }}>{p.ordersCount}</td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "#374151" }}>{p.ticketsSold}</td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "#374151" }}>{numFmt.format(p.revenueUsd)}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: p.checkInRate >= 70 ? "#16a34a" : p.checkInRate >= 40 ? "#d97706" : "#dc2626" }}>
                          {p.checkInRate}%
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: p.completionRate >= 80 ? "#16a34a" : p.completionRate >= 50 ? "#d97706" : "#dc2626" }}>
                          {p.completionRate}%
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "#374151" }}>
                        {p.avgDurationMinutes != null ? `${p.avgDurationMinutes}m` : "—"}
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 600, color: "#1a1614" }}>
                        {numFmt.format(p.commissionOwedCents / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
              <div>{t("analytics", "no_commission_data") ?? "No attributed sales recorded yet."}</div>
            </div>
          )}
        </div>
      )}

      {!loading && subtab === "giftbags" && giftBags && (
        <div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            {statBox(giftBags.totals.givenCount, t("analytics", "gift_bags_given") ?? "Gift Bags Given")}
            {statBox(giftBags.totals.ticketGiven, t("analytics", "gift_bags_via_ticket") ?? "Via Ticket")}
            {statBox(giftBags.totals.blockGiven, t("analytics", "gift_bags_via_block") ?? "Via Block")}
            {statBox(
              giftBags.totals.eligibleTickets > 0
                ? `${Math.round((giftBags.totals.ticketGiven / giftBags.totals.eligibleTickets) * 100)}%`
                : "—",
              t("analytics", "gift_bag_coverage") ?? "Ticket Coverage",
              `${giftBags.totals.ticketGiven}/${giftBags.totals.eligibleTickets}`,
            )}
          </div>

          {giftBags.sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎁</div>
              <div>{t("analytics", "no_gift_bag_data") ?? "No sessions found for this experience."}</div>
            </div>
          ) : (
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e0d8", fontWeight: 600, fontSize: 14 }}>
                {t("analytics", "gift_bags_per_session") ?? "Distribution Per Session"}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fafaf9" }}>
                    {[
                      t("analytics", "session") ?? "Session",
                      t("analytics", "gift_bags_total") ?? "Total",
                      t("analytics", "via_ticket_short") ?? "Ticket",
                      t("analytics", "via_block_short") ?? "Block",
                      t("analytics", "coverage") ?? "Coverage",
                      t("analytics", "top_distributors") ?? "Top Distributors",
                    ].map((h) => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e0d8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {giftBags.sessions.map((s) => (
                    <tr key={s.sessionId} style={{ borderBottom: "1px solid #f5f3f0" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#1a1614", fontSize: 14 }}>
                          {s.title ?? new Date(s.startsAt).toLocaleDateString(locale)}
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>
                          {new Date(s.startsAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                          {!s.giftBagEnabled && (
                            <span style={{ marginLeft: 8, padding: "2px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                              {t("analytics", "gift_bag_session_off") ?? "Disabled"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: 16, fontWeight: 700, color: "#1a1614" }}>{s.givenCount}</td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "#374151" }}>{s.ticketGiven}</td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "#374151" }}>{s.blockGiven}</td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "#374151" }}>
                        {s.coverageRate != null ? (
                          <span style={{ fontWeight: 600, color: s.coverageRate >= 80 ? "#16a34a" : s.coverageRate >= 50 ? "#d97706" : "#dc2626" }}>
                            {s.coverageRate}%
                          </span>
                        ) : "—"}
                        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
                          {s.ticketGiven}/{s.eligibleTickets}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: 12, color: "#374151" }}>
                        {s.distributors.length === 0
                          ? <span style={{ color: "#9ca3af" }}>—</span>
                          : s.distributors.slice(0, 3).map((d, i) => (
                              <div key={i}>{d.name} <span style={{ color: "#9ca3af" }}>· {d.count}</span></div>
                            ))}
                        {s.distributors.length > 3 && (
                          <div style={{ color: "#9ca3af", fontSize: 11 }}>
                            +{s.distributors.length - 3} {t("analytics", "more") ?? "more"}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
