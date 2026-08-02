"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import SlideOverPanel from "@/components/ui/SlideOverPanel";
import StatusChip from "@/components/ui/StatusChip";

interface TableSession {
  id: string;
  venueId: string;
  tableLabel: string | null;
  grossCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  refundCents: number;
  netRevenueCents: number;
  commissionableCents: number;
  trustScore: number;
  matchMethod: string;
  status: string;
  invuOrderId: string | null;
  invuOrderJson: unknown;
  closedAt: string | null;
  venue: { id: string; name: string };
  reservation: {
    id: string;
    confirmationCode: string;
    contactName: string;
    partySize: number;
    reservationDate: string;
    assignedHost: { id: string; displayName: string } | null;
    attributions: Array<{
      referrer: { id: string; fullName: string; referrerType: string };
    }>;
  } | null;
  allocations: Array<{ id: string; earnerType: string; earnerRefId: string; amountCents: number; status: string }>;
}

interface Detail {
  session: TableSession & {
    reservation: (TableSession["reservation"] & {
      commissions: Array<{ id: string; amountCents: number; status: string; referrer: { id: string; fullName: string } }>;
    }) | null;
    allocations: Array<{
      id: string; earnerType: string; earnerRefId: string; amountCents: number; status: string; commissionRuleSnapshot: unknown;
    }>;
  };
  auditLogs: Array<{ id: string; actorId: string; action: string; metadata: unknown; createdAt: string }>;
}

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function trustBadge(score: number) {
  if (score >= 0.95) return { bg: "#e8f5e9", color: "#1b5e20", label: (score * 100).toFixed(0) + "%" };
  if (score >= 0.75) return { bg: "#fef9ec", color: "#92700a", label: (score * 100).toFixed(0) + "%" };
  return { bg: "#fef2f2", color: "#991b1b", label: (score * 100).toFixed(0) + "%" };
}

const TABS = ["attribution", "tableRevenue", "commissionLogic", "adjustments", "auditTrail"] as const;
type Tab = typeof TABS[number];

export default function SessionsLedgerPage() {
  const t = useTranslation();
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("30d");
  const [selected, setSelected] = useState<TableSession | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("attribution");
  const [showRawJson, setShowRawJson] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/admin/revenue/sessions?preset=${preset}&limit=50`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) { setSessions(d.data.sessions); setTotal(d.data.total); }
      })
      .finally(() => setLoading(false));
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  const openDetail = (session: TableSession) => {
    setSelected(session);
    setActiveTab("attribution");
    setShowRawJson(false);
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/v1/admin/revenue/sessions/${session.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setDetail(d.data); })
      .finally(() => setDetailLoading(false));
  };

  const isEmpty = !loading && sessions.length === 0;

  const tabLabel: Record<Tab, string> = {
    attribution: t("admin", "revenue.sessions.tabAttribution") || "Attribution",
    tableRevenue: t("admin", "revenue.sessions.tabRevenue") || "Table Revenue",
    commissionLogic: t("admin", "revenue.sessions.tabCommission") || "Commission Logic",
    adjustments: t("admin", "revenue.sessions.tabAdjustments") || "Adjustments",
    auditTrail: t("admin", "revenue.sessions.tabAudit") || "Audit Trail",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 500, margin: 0 }}>
            {t("admin", "revenue.sessions.title") || "Table Session Ledger"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
            {total} {t("admin", "revenue.sessions.totalRows") || "sessions"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["today", "7d", "30d"].map((p) => (
            <button key={p} onClick={() => setPreset(p)} className={preset === p ? "btn btn-primary" : "btn btn-ghost"} style={{ fontSize: 13, padding: "6px 14px" }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>{t("admin", "loading") || "Loading…"}</div>
      )}

      {isEmpty && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {t("admin", "revenue.emptyState.noSessionsYet") || "No table sessions yet."}
          </div>
          <p style={{ color: "var(--color-text-muted)", marginBottom: 20 }}>
            {t("admin", "revenue.emptyState.triggerSync") || "Trigger a sync from INVU Integration."}
          </p>
          <Link href="/admin/integrations/invu" className="btn btn-primary">
            {t("admin", "revenue.emptyState.invuButton") || "Go to INVU Integration"}
          </Link>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="card" style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Reservation", "Venue", "Table", "Party", "Gross", "Net Comm.", "Trust", "Method", "Status", "Source"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const tb = trustBadge(s.trustScore);
                const isInvu = s.matchMethod !== "UNMATCHED";
                return (
                  <tr
                    key={s.id}
                    onClick={() => openDetail(s)}
                    style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer", transition: "background 0.12s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-layer-2, #f9f9f9)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {s.reservation?.confirmationCode || <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>{s.venue.name}</td>
                    <td style={{ padding: "10px 14px" }}>{s.tableLabel || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{s.reservation?.partySize ?? "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{fmt(s.grossCents)}</td>
                    <td style={{ padding: "10px 14px" }}>{fmt(s.commissionableCents)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 20, background: tb.bg, color: tb.color, fontSize: 11, fontWeight: 700 }}>
                        {tb.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <StatusChip status={s.matchMethod.toLowerCase()} label={s.matchMethod} size="xs" />
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <StatusChip status={s.status.toLowerCase()} label={s.status} size="xs" />
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: isInvu ? "#e3f2fd" : "#f3f4f6", color: isInvu ? "#0d47a1" : "#6b7280", fontWeight: 600 }}>
                        {isInvu ? (t("admin", "revenue.sourceLabel.invuVerified") || "INVU-Verified") : (t("admin", "revenue.sourceLabel.manual") || "Manual Entry")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SlideOverPanel open={!!selected} onClose={() => setSelected(null)} title={selected?.reservation?.confirmationCode ? `Session — ${selected.reservation.confirmationCode}` : "Session Detail"} width={620}>
        {detailLoading && <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>Loading…</div>}

        {!detailLoading && detail && (
          <>
            <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", marginBottom: 20, gap: 0, overflowX: "auto" }}>
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: activeTab === tab ? 700 : 400,
                    color: activeTab === tab ? "var(--color-primary)" : "var(--color-text-muted)",
                    background: "transparent",
                    border: "none",
                    borderBottom: activeTab === tab ? "2px solid var(--color-primary)" : "2px solid transparent",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: "color 0.15s",
                  }}
                >
                  {tabLabel[tab]}
                </button>
              ))}
            </div>

            {activeTab === "attribution" && (
              <AttributionTab detail={detail} t={t} />
            )}
            {activeTab === "tableRevenue" && (
              <TableRevenueTab detail={detail} t={t} showRaw={showRawJson} onToggleRaw={() => setShowRawJson((v) => !v)} />
            )}
            {activeTab === "commissionLogic" && (
              <CommissionLogicTab detail={detail} t={t} />
            )}
            {activeTab === "adjustments" && (
              <AdjustmentsTab detail={detail} t={t} />
            )}
            {activeTab === "auditTrail" && (
              <AuditTrailTab detail={detail} t={t} />
            )}
          </>
        )}
      </SlideOverPanel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border)", gap: 12 }}>
      <span style={{ fontSize: 12, color: "var(--color-text-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, textAlign: "right" }}>{value ?? "—"}</span>
    </div>
  );
}

function AttributionTab({ detail, t }: { detail: Detail; t: Function }) {
  const s = detail.session;
  const res = s.reservation;
  const attr = res?.attributions?.[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Row label={t("admin", "revenue.sessions.confirmationCode") || "Confirmation Code"} value={<span style={{ fontFamily: "monospace" }}>{res?.confirmationCode || "—"}</span>} />
      <Row label={t("admin", "revenue.sessions.venue") || "Venue"} value={s.venue.name} />
      <Row label={t("admin", "revenue.sessions.partySize") || "Party Size"} value={res?.partySize} />
      <Row label={t("admin", "revenue.sessions.referrer") || "Referrer"} value={attr ? `${attr.referrer.fullName} (${attr.referrer.referrerType})` : "—"} />
      <Row label={t("admin", "revenue.sessions.host") || "Host"} value={res?.assignedHost?.displayName || "—"} />
      <Row label={t("admin", "revenue.sessions.matchMethod") || "Match Method"} value={<StatusChip status={s.matchMethod.toLowerCase()} label={s.matchMethod} size="xs" />} />
      <Row label={t("admin", "revenue.sessions.trustScore") || "Trust Score"} value={(() => { const tb = trustBadge(s.trustScore); return <span style={{ padding: "2px 8px", borderRadius: 12, background: tb.bg, color: tb.color, fontSize: 11, fontWeight: 700 }}>{tb.label}</span>; })()} />
      <Row label={t("admin", "revenue.sourceLabel.label") || "Source"} value={s.matchMethod !== "UNMATCHED" ? (t("admin", "revenue.sourceLabel.invuVerified") || "INVU-Verified") : (t("admin", "revenue.sourceLabel.manual") || "Manual Entry")} />
    </div>
  );
}

function TableRevenueTab({ detail, t, showRaw, onToggleRaw }: { detail: Detail; t: Function; showRaw: boolean; onToggleRaw: () => void }) {
  const s = detail.session;
  const fmt2 = (cents: number) => "$" + (cents / 100).toFixed(2);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Row label={t("admin", "revenue.sessions.gross") || "Gross"} value={fmt2(s.grossCents)} />
      <Row label={t("admin", "revenue.sessions.discounts") || "Discounts"} value={`-${fmt2(s.discountCents)}`} />
      <Row label={t("admin", "revenue.sessions.tax") || "Tax"} value={fmt2(s.taxCents)} />
      <Row label={t("admin", "revenue.sessions.tips") || "Tips"} value={fmt2(s.tipCents)} />
      <Row label={t("admin", "revenue.sessions.refunds") || "Refunds"} value={`-${fmt2(s.refundCents)}`} />
      <Row label={t("admin", "revenue.sessions.netRevenue") || "Net Revenue"} value={<strong>{fmt2(s.netRevenueCents)}</strong>} />
      <Row label={t("admin", "revenue.sessions.commissionableBase") || "Commissionable Base"} value={<strong>{fmt2(s.commissionableCents)}</strong>} />
      {s.invuOrderId && <Row label={t("admin", "revenue.sessions.invuOrderId") || "INVU Order ID"} value={<span style={{ fontFamily: "monospace", fontSize: 12 }}>{s.invuOrderId}</span>} />}
      {!!s.invuOrderJson && (
        <div style={{ marginTop: 12 }}>
          <button onClick={onToggleRaw} className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}>
            {showRaw ? "Hide raw" : "Show raw INVU JSON"}
          </button>
          {showRaw && (
            <pre style={{ marginTop: 8, padding: 12, background: "#f5f5f5", borderRadius: 8, fontSize: 11, overflow: "auto", maxHeight: 300 }}>
              {JSON.stringify(s.invuOrderJson, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function CommissionLogicTab({ detail, t }: { detail: Detail; t: Function }) {
  const s = detail.session;
  const allocs = s.allocations;
  const entries = s.reservation?.commissions ?? [];
  const totalCents = allocs.reduce((sum, a) => sum + a.amountCents, 0) + entries.reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {allocs.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.07em", marginBottom: 8 }}>
            {t("admin", "revenue.sourceLabel.invuVerified") || "INVU-Verified Allocations"}
          </div>
          {allocs.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{a.earnerType}</span>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 6 }}>{a.earnerRefId.slice(0, 12)}…</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>${(a.amountCents / 100).toFixed(2)}</span>
                <StatusChip status={a.status.toLowerCase()} label={a.status} size="xs" />
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.07em", marginBottom: 8 }}>
            {t("admin", "revenue.sourceLabel.manual") || "Manual Entry"} — {t("admin", "revenue.sessions.invuPending") || "INVU verification pending"}
          </div>
          {entries.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: 13 }}>{e.referrer.fullName}</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>${(e.amountCents / 100).toFixed(2)}</span>
                <StatusChip status={e.status.toLowerCase()} label={e.status} size="xs" />
              </div>
            </div>
          ))}
        </div>
      )}

      {allocs.length === 0 && entries.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{t("admin", "revenue.sessions.noAllocations") || "No commission allocations recorded."}</p>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700 }}>
        <span>{t("admin", "revenue.sessions.totalObligations") || "Total Obligations"}</span>
        <span>${(totalCents / 100).toFixed(2)}</span>
      </div>
    </div>
  );
}

function AdjustmentsTab({ detail, t }: { detail: Detail; t: Function }) {
  const allocs = (detail.session.allocations as Array<{
    id: string;
    earnerType: string;
    earnerRefId: string;
    amountCents: number;
    status: string;
    commissionRuleSnapshot?: unknown;
  }>).filter((a) => ["DISPUTED", "REVERSED"].includes(a.status));

  if (allocs.length === 0) {
    return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{t("admin", "revenue.sessions.noAdjustments") || "No adjustments, overrides, or reversals on this session."}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {allocs.map((a) => (
        <div key={a.id} className="card" style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>{a.earnerType} — ${(a.amountCents / 100).toFixed(2)}</span>
            <StatusChip status={a.status.toLowerCase()} label={a.status} size="xs" />
          </div>
          {!!a.commissionRuleSnapshot && (
            <details>
              <summary style={{ fontSize: 12, color: "var(--color-text-muted)", cursor: "pointer" }}>
                {t("admin", "revenue.sessions.ruleSnapshot") || "Rule snapshot"}
              </summary>
              <pre style={{ marginTop: 8, padding: 10, background: "#f5f5f5", borderRadius: 6, fontSize: 11, overflow: "auto", maxHeight: 200 }}>
                {JSON.stringify(a.commissionRuleSnapshot, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function AuditTrailTab({ detail, t }: { detail: Detail; t: Function }) {
  const logs = detail.auditLogs;

  if (logs.length === 0) {
    return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{t("admin", "revenue.sessions.noAuditLogs") || "No audit events for this session."}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {logs.map((log) => (
        <div key={log.id} style={{ padding: "12px 14px", background: "var(--color-layer-2, #f9f9f9)", borderRadius: 8, borderLeft: "3px solid var(--color-primary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{log.action}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {new Date(log.createdAt).toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Actor: {log.actorId.slice(0, 12)}…</div>
          {!!log.metadata && (
            <pre style={{ marginTop: 6, fontSize: 11, overflow: "auto", maxHeight: 120, color: "var(--color-text-muted)" }}>
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
