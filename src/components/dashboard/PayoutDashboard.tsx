"use client";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  roleContext: "INFLUENCER" | "REFERRAL_ACTOR";
  actorName: string;
  payerNotice: { payerType: string; message: string };
  totals: {
    grossAttributedRevenueCents: number;
    earnedCents: number;
    paidCents: number;
    outstandingCents: number;
    pendingValidationCents: number;
    nextPayoutDate: string | null;
  };
  influencerExtra: {
    downstreamObligationsCents: number;
    retainedNetCents: number;
    payoutCycle: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
    minPayoutThresholdCents: number;
  } | null;
}

interface LedgerRow {
  id: string;
  date: string;
  sourceLabel: string;
  sourceType: string;
  reference: string | null;
  customerName: string | null;
  grossBaseCents: number;
  commissionCents: number;
  earningStatus: string;
  payoutStatus: string;
  payerType: string;
  payerDisplayName: string;
  currency: string;
  notes: string | null;
}

interface PayoutRow {
  id: string;
  batchId: string;
  payoutDate: string;
  amountCents: number;
  payerType: string;
  payerDisplayName: string;
  coveredItemCount: number;
  method: string;
  status: string;
  currency: string;
  notes: string | null;
}

interface ActivityRow {
  id: string;
  date: string;
  customerName: string;
  sourceLabel: string;
  orderTotalCents: number;
  attributionType: string;
  conversionStatus: string;
  commissionOutcome: string;
  currency: string;
  managerNote?: string | null;
  managerNoteAuthor?: string | null;
}

interface TrendPoint { period: string; amountCents: number }
interface Trends {
  earningsTrend: TrendPoint[];
  payoutTrend: TrendPoint[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number, currency = "USD") {
  const sym = currency === "USD" ? "$" : currency === "PAB" ? "B/." : "$";
  return sym + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateStr(d: string | Date, dateLocale: string) {
  return new Date(d).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" });
}

function fmtPeriod(p: string, dateLocale: string) {
  const [y, m] = p.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString(dateLocale, { month: "short", year: "2-digit" });
}

// ─── Status Badge System ─────────────────────────────────────────────────────

type TFn = (ns: string, key: string) => string;

function EarningBadge({ status, t }: { status: string; t: TFn }) {
  const cfg: Record<string, { key: string; bg: string; color: string }> = {
    PENDING_VALIDATION: { key: "pendingValidation", bg: "#e0e7ef", color: "#374151" },
    EARNED:            { key: "earned",             bg: "#d1fae5", color: "#065f46" },
    VOIDED:            { key: "voided",             bg: "#fee2e2", color: "#991b1b" },
    DISPUTED:          { key: "disputed",           bg: "#fef3c7", color: "#92400e" },
  };
  const c = cfg[status];
  const label = c ? t("admin", c.key) : status;
  const bg    = c?.bg    ?? "#f3f4f6";
  const color = c?.color ?? "#374151";
  return (
    <span className="badge" style={{ background: bg, color, border: "none" }}>{label}</span>
  );
}

function PayoutBadge({ status, t }: { status: string; t: TFn }) {
  const cfg: Record<string, { key: string; bg: string; color: string }> = {
    NOT_PAYABLE:    { key: "notPayable",    bg: "#f3f4f6", color: "#6b7280" },
    PENDING_PAYOUT: { key: "pendingPayout", bg: "#fef3c7", color: "#92400e" },
    SCHEDULED:      { key: "scheduled",     bg: "#dbeafe", color: "#1e40af" },
    PAID:           { key: "paidOut",       bg: "#d1fae5", color: "#065f46" },
    FAILED:         { key: "failed",        bg: "#fee2e2", color: "#991b1b" },
    WAIVED:         { key: "waived",        bg: "#f3f4f6", color: "#9ca3af" },
  };
  const c = cfg[status];
  const label = c ? t("admin", c.key) : status;
  const bg    = c?.bg    ?? "#f3f4f6";
  const color = c?.color ?? "#374151";
  return (
    <span className="badge" style={{ background: bg, color, border: "none" }}>{label}</span>
  );
}

function ConversionBadge({ status, t }: { status: string; t: TFn }) {
  const cfg: Record<string, { key: string; color: string }> = {
    COMPLETED:   { key: "completedStatus", color: "#065f46" },
    IN_PROGRESS: { key: "inProgress",      color: "#1e40af" },
    LOST:        { key: "lost",            color: "#991b1b" },
    PENDING:     { key: "pendingStatus",   color: "#6b7280" },
    CANCELLED:   { key: "cancelledStatus", color: "#9ca3af" },
  };
  const c = cfg[status];
  const label = c ? t("admin", c.key) : status;
  const color = c?.color ?? "#374151";
  return <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>;
}

// ─── Mini Trend Bar Chart ─────────────────────────────────────────────────────

function MiniBarChart({ data, color, dateLocale, noDataLabel }: {
  data: TrendPoint[]; color: string; dateLocale: string; noDataLabel: string;
}) {
  if (!data.length) return (
    <div className="empty-panel" style={{ padding: "20px 0", fontSize: 13 }}>{noDataLabel}</div>
  );
  const max = Math.max(...data.map(d => d.amountCents), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
      {data.slice(-12).map(d => (
        <div key={d.period} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div
            title={`${fmtPeriod(d.period, dateLocale)}: ${fmt(d.amountCents)}`}
            style={{
              width: "100%", background: color, borderRadius: "2px 2px 0 0",
              height: `${Math.max(4, (d.amountCents / max) * 64)}px`,
              transition: "height 0.3s ease",
            }}
          />
          <div style={{ fontSize: 9, color: "var(--color-text-muted)", writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1 }}>
            {fmtPeriod(d.period, dateLocale)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ row, type, onClose, t, dateLocale }: {
  row: LedgerRow | PayoutRow | null;
  type: "ledger" | "payout";
  onClose: () => void;
  t: TFn;
  dateLocale: string;
}) {
  if (!row) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end", background: "rgba(0,0,0,0.24)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        style={{
          width: 440, background: "var(--layer-1)", height: "100%", overflowY: "auto",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.14)", padding: "36px 32px",
          borderLeft: "1px solid var(--color-border)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
            {type === "ledger" ? t("admin", "commissionDetailTitle") : t("admin", "payoutDetailTitle")}
          </h3>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, border: "1px solid var(--color-border)", background: "var(--layer-0)",
              borderRadius: 8, cursor: "pointer", fontSize: 18, color: "var(--color-text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
            }}
          >×</button>
        </div>

        {type === "ledger" && (() => {
          const r = row as LedgerRow;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <DrawerField label={t("admin", "sourceCol")} value={r.sourceLabel} />
              <DrawerField label={t("admin", "sourceTypeField")} value={r.sourceType.replace(/_/g, " ")} />
              <DrawerField label={t("admin", "orderBookingRef")} value={r.reference ? r.reference.slice(0, 16) + "…" : "—"} mono />
              <DrawerField label={t("admin", "customerField")} value={r.customerName ?? "—"} />
              <DrawerField label={t("admin", "grossBaseField")} value={fmt(r.grossBaseCents, r.currency)} />
              <DrawerField label={t("admin", "commissionField")} value={fmt(r.commissionCents, r.currency)} bold accent="#059669" />
              <DrawerField label={t("admin", "payerField")} value={r.payerDisplayName} />
              <div>
                <div className="dash-eyebrow" style={{ marginBottom: 6 }}>{t("admin", "earningStatusField")}</div>
                <EarningBadge status={r.earningStatus} t={t} />
              </div>
              <div>
                <div className="dash-eyebrow" style={{ marginBottom: 6 }}>{t("admin", "payoutStatusField")}</div>
                <PayoutBadge status={r.payoutStatus} t={t} />
              </div>
              {r.notes && <DrawerField label={t("admin", "notesField")} value={r.notes} />}
              <DrawerField label={t("admin", "dateField")} value={fmtDateStr(r.date, dateLocale)} />
            </div>
          );
        })()}

        {type === "payout" && (() => {
          const r = row as PayoutRow;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <DrawerField label={t("admin", "batchIdField")} value={r.batchId} mono />
              <DrawerField label={t("admin", "payoutDateField")} value={fmtDateStr(r.payoutDate, dateLocale)} />
              <DrawerField label={t("admin", "amountField")} value={fmt(r.amountCents, r.currency)} bold accent="#059669" />
              <DrawerField label={t("admin", "payerField")} value={r.payerDisplayName} />
              <DrawerField label={t("admin", "methodCol")} value={r.method.replace(/_/g, " ")} />
              <DrawerField label={t("admin", "itemsCoveredField")} value={String(r.coveredItemCount)} />
              <div>
                <div className="dash-eyebrow" style={{ marginBottom: 6 }}>{t("admin", "statusField")}</div>
                <PayoutBadge status={r.status} t={t} />
              </div>
              {r.notes && <DrawerField label={t("admin", "notesField")} value={r.notes} />}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function DrawerField({ label, value, bold, mono, accent }: {
  label: string; value: string; bold?: boolean; mono?: boolean; accent?: string;
}) {
  return (
    <div>
      <div className="dash-eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 15,
        fontWeight: bold ? 700 : 400,
        color: accent ?? "var(--color-text)",
        fontFamily: mono ? "var(--font-mono, monospace)" : undefined,
      }}>{value}</div>
    </div>
  );
}

// ─── KPI Card for dark earnings strip ─────────────────────────────────────────

function EarningsKPI({ label, value, sub, accentColor, dimmed }: {
  label: string; value: string; sub?: string; accentColor?: string; dimmed?: boolean;
}) {
  return (
    <div
      className="earnings-kpi"
      style={{
        opacity: dimmed ? 0.45 : 1,
        borderTop: accentColor ? `3px solid ${accentColor}` : undefined,
      }}
    >
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontFamily: "var(--font-heading)",
        fontSize: 24,
        fontWeight: 700,
        color: accentColor ?? "#fff",
        letterSpacing: "-0.02em",
        lineHeight: 1,
        marginBottom: sub ? 6 : 0,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Balance Line Row ─────────────────────────────────────────────────────────

function BalanceLine({ label, cents, color, bold }: { label: string; cents: number; color: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: bold ? 700 : 600, color }}>{fmt(cents)}</span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeJson = (r: Response) => r.text().then(t => { try { return t ? JSON.parse(t) : null; } catch { return null; } });

// ─── Main Component ───────────────────────────────────────────────────────────

type DashTab = "overview" | "ledger" | "payouts" | "activity";

export function PayoutDashboard() {
  const t = useTranslation();
  const locale = useLocale();
  const dateLocale = locale === "es" ? "es-PA" : locale === "pt" ? "pt-BR" : "en-US";

  const [tab, setTab] = useState<DashTab>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [earningFilter, setEarningFilter] = useState("");
  const [payoutFilter, setPayoutFilter] = useState("");
  const [drawer, setDrawer] = useState<{ row: LedgerRow | PayoutRow; type: "ledger" | "payout" } | null>(null);
  const [sessionError, setSessionError] = useState(false);

  const loadSummary = useCallback(() => {
    Promise.all([
      fetch("/api/v1/payout-dashboard/summary").then(r => {
        if (r.status === 401) { setSessionError(true); return null; }
        return safeJson(r);
      }),
      fetch("/api/v1/payout-dashboard/payout-history").then(safeJson),
      fetch("/api/v1/payout-dashboard/attributed-activity").then(safeJson),
      fetch("/api/v1/payout-dashboard/trends").then(safeJson),
    ]).then(([sum, pay, act, trn]) => {
      if (sum?.totals) setSummary(sum);
      if (pay?.rows) setPayouts(pay.rows);
      if (act?.rows) setActivity(act.rows);
      if (trn?.earningsTrend) setTrends(trn);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useAutoRefresh(loadSummary, 180_000);

  const loadLedger = useCallback(() => {
    setLedgerLoading(true);
    const params = new URLSearchParams();
    if (earningFilter) params.set("earningStatus", earningFilter);
    if (payoutFilter) params.set("payoutStatus", payoutFilter);
    fetch(`/api/v1/payout-dashboard/commission-ledger?${params}`)
      .then(safeJson)
      .then(d => { if (d?.rows) setLedger(d.rows); })
      .finally(() => setLedgerLoading(false));
  }, [earningFilter, payoutFilter]);

  useEffect(() => {
    if (tab === "ledger") loadLedger();
  }, [tab, loadLedger]);

  // ── Session error ──────────────────────────────────────────────────────────
  if (sessionError) return (
    <div className="dashboard-canvas">
      <div className="dashboard-body" style={{ maxWidth: 520, paddingTop: 64 }}>
        <div className="panel" style={{ textAlign: "center", padding: "48px 40px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.01em" }}>
            {t("admin", "sessionExpiredTitle")}
          </h2>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: 28, fontSize: 14 }}>
            {t("admin", "sessionExpiredDesc")}
          </p>
          <a href="/api/auth/signout?callbackUrl=/login" className="btn btn-primary">{t("admin", "signOutRelogin")}</a>
        </div>
      </div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="dashboard-canvas" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div className="loading-dots"><span /><span /><span /></div>
    </div>
  );

  // ── No access ──────────────────────────────────────────────────────────────
  if (!summary) return (
    <div className="dashboard-canvas">
      <div className="dashboard-body" style={{ maxWidth: 540, paddingTop: 64 }}>
        <div className="panel" style={{ textAlign: "center", padding: "48px 40px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.01em" }}>
            {t("admin", "noPayoutDashboardTitle")}
          </h2>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: 28, fontSize: 14 }}>
            {t("admin", "noPayoutDashboardDesc")}
          </p>
          <div className="panel-muted" style={{ padding: "16px 20px", marginBottom: 28, textAlign: "left" }}>
            <div className="dash-eyebrow" style={{ marginBottom: 4 }}>{t("admin", "influencerAccountsLabel")}</div>
            <div style={{ fontSize: 13 }}>influencer@oku.local · sarah@oku.local · marco@oku.local</div>
            <div className="dash-eyebrow" style={{ marginBottom: 4, marginTop: 12 }}>{t("admin", "referrerAccountsLabel")}</div>
            <div style={{ fontSize: 13 }}>ana@oku.local · sophie@oku.local · carlos@oku.local</div>
          </div>
          <a href="/api/auth/signout?callbackUrl=/login" className="btn btn-primary">{t("admin", "signOutRelogin")}</a>
        </div>
      </div>
    </div>
  );

  const { totals, influencerExtra, payerNotice, roleContext, actorName } = summary;
  const roleLabel = roleContext === "INFLUENCER" ? t("admin", "influencerRole") : t("admin", "referralActorRole");

  const tabs: [DashTab, string][] = [
    ["overview",  t("admin", "overview")],
    ["ledger",    t("admin", "commissionLedger")],
    ["payouts",   t("admin", "payoutHistory")],
    ["activity",  t("admin", "attributedActivity")],
  ];

  return (
    <div className="dashboard-canvas">

      {/* ─── Earnings Strip Header ─────────────────────────────────────────── */}
      <div className="earnings-strip">
        <div className="dashboard-body">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="dash-eyebrow" style={{ color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>
                OKÜ {t("common", "hospitalityGroup") || "Hospitality Group"}
              </div>
              <h1 style={{
                fontFamily: "var(--font-heading)", fontSize: 30, fontWeight: 700,
                color: "#fff", margin: 0, letterSpacing: "-0.02em",
              }}>
                {t("admin", "payoutDashboard")}
              </h1>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <span className="badge" style={{
                  background: roleContext === "INFLUENCER" ? "var(--color-primary)" : "#374151",
                  color: "#fff",
                  border: "none",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                }}>
                  {roleLabel}
                </span>
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 500 }}>{actorName}</span>
              </div>
            </div>
            <a
              href="/login"
              style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "none", marginTop: 6 }}
            >
              ← {t("common", "back") || "Back"}
            </a>
          </div>

          {/* KPI strip inside header */}
          <div className="kpi-grid" style={{
            marginTop: 28,
            gridTemplateColumns: `repeat(${influencerExtra ? 5 : 4}, 1fr)`,
          }}>
            <EarningsKPI
              label={t("admin", "totalEarned") || "Total Earned"}
              value={fmt(totals.earnedCents)}
              sub={t("admin", "validatedCommissions")}
              accentColor="#34d399"
            />
            <EarningsKPI
              label={t("admin", "paidOut")}
              value={fmt(totals.paidCents)}
              sub={t("admin", "cashAlreadyReceived")}
              accentColor="#6ee7b7"
            />
            <EarningsKPI
              label={t("admin", "outstanding") || "Outstanding"}
              value={fmt(totals.outstandingCents)}
              sub={t("admin", "earnedButNotPaid")}
              accentColor={totals.outstandingCents > 0 ? "#fbbf24" : undefined}
            />
            <EarningsKPI
              label={t("admin", "pendingValidation")}
              value={fmt(totals.pendingValidationCents)}
              sub={t("admin", "awaitingApproval")}
              dimmed
            />
            {influencerExtra && (
              <EarningsKPI
                label={t("admin", "retainedNet")}
                value={fmt(influencerExtra.retainedNetCents)}
                sub={`${t("common", "afterLabel") || "After"} ${fmt(influencerExtra.downstreamObligationsCents)} referrer share`}
                accentColor="#a78bfa"
              />
            )}
          </div>
        </div>
      </div>

      {/* ─── Tab Switcher ──────────────────────────────────────────────────── */}
      <div style={{ background: "var(--layer-1)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="dashboard-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="chip-bar" style={{ gap: 0, borderBottom: "none" }}>
            {tabs.map(([tabId, label]) => (
              <button
                key={tabId}
                onClick={() => setTab(tabId)}
                style={{
                  padding: "14px 22px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: tab === tabId ? 700 : 400,
                  color: tab === tabId ? "var(--color-primary)" : "var(--color-text-secondary)",
                  borderBottom: tab === tabId ? "2px solid var(--color-primary)" : "2px solid transparent",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Tab Content ───────────────────────────────────────────────────── */}
      <div className="dashboard-body">

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Payer Notice */}
            <div className="alert-strip alert-strip-success" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>🏦</span>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {t("admin", "payerCol")}: {payerNotice.payerType === "OKU" ? "OKU Hospitality Group" : payerNotice.payerType}
                </span>
                <p style={{ fontSize: 13, margin: "2px 0 0", opacity: 0.85 }}>{payerNotice.message}</p>
              </div>
            </div>

            {/* Pay cycle strip */}
            {influencerExtra && (
              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "14px 20px", borderRadius: 12,
                background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <span style={{ fontSize: 22 }}>📅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>
                    Pay Cycle
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>
                    {{
                      DAILY: "Daily",
                      WEEKLY: "Weekly",
                      BIWEEKLY: "Bi-weekly",
                      MONTHLY: "Monthly",
                    }[influencerExtra.payoutCycle] ?? influencerExtra.payoutCycle}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>
                    Min. Payout
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#fbbf24" }}>
                    {fmt(influencerExtra.minPayoutThresholdCents)}
                  </div>
                </div>
              </div>
            )}

            {/* Downstream obligations */}
            {influencerExtra && influencerExtra.downstreamObligationsCents > 0 && (
              <div className="alert-strip" style={{
                background: "#faf5ff", borderColor: "#c4b5fd", color: "#5b21b6",
                display: "flex", alignItems: "flex-start", gap: 12,
              }}>
                <span style={{ fontSize: 20 }}>↓</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c3aed", marginBottom: 4 }}>
                    {t("admin", "downstreamObligationsTitle")}
                  </div>
                  <p style={{ fontSize: 13, margin: 0 }}>
                    {t("admin", "downstreamObligationsBody")
                      .replace("{amount}", fmt(influencerExtra.downstreamObligationsCents))
                      .replace("{retainedNet}", fmt(influencerExtra.retainedNetCents))}
                  </p>
                </div>
              </div>
            )}

            {/* Conversion Outcome Breakdown */}
            {activity.length > 0 && (() => {
              const completed = activity.filter(r => r.conversionStatus === "COMPLETED").length;
              const cancelled  = activity.filter(r => r.conversionStatus === "CANCELLED").length;
              const pending    = activity.filter(r => !["COMPLETED","CANCELLED"].includes(r.conversionStatus)).length;
              const total      = activity.length;
              const winPct     = Math.round((completed / total) * 100);
              const lossPct    = Math.round((cancelled / total) * 100);
              return (
                <div className="panel">
                  <div className="dash-section-title" style={{ marginBottom: 16 }}>Your Referral Conversion</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                    {[
                      { label: "Won", count: completed, pct: winPct,  color: "#16a34a", bg: "rgba(22,163,74,0.08)" },
                      { label: "Lost",   count: cancelled, pct: lossPct,  color: "#dc2626", bg: "rgba(220,38,38,0.07)" },
                      { label: "Pending", count: pending,   pct: 100 - winPct - lossPct, color: "#d97706", bg: "rgba(217,119,6,0.07)" },
                    ].map(s => (
                      <div key={s.label} style={{ padding: "14px 16px", background: s.bg, borderRadius: 10, border: `1px solid ${s.color}22` }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.pct}%</div>
                        <div style={{ fontWeight: 700, fontSize: 12, color: s.color, marginTop: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{s.count} of {total}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    Based on your {total} most recent attributed {total === 1 ? "order" : "orders"}. Host and floor manager notes appear in the Attributed Activity tab.
                  </div>
                </div>
              );
            })()}

            {/* Trend Charts */}
            {trends && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div className="panel">
                  <div className="dash-section-title" style={{ marginBottom: 16 }}>{t("admin", "earningsTrendTitle")}</div>
                  <MiniBarChart data={trends.earningsTrend} color="#059669" dateLocale={dateLocale} noDataLabel={t("admin", "noDataYet")} />
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>{t("admin", "monthlyCommissionEarned")}</div>
                </div>
                <div className="panel">
                  <div className="dash-section-title" style={{ marginBottom: 16 }}>{t("admin", "payoutTrendTitle")}</div>
                  <MiniBarChart data={trends.payoutTrend} color="#065f46" dateLocale={dateLocale} noDataLabel={t("admin", "noDataYet")} />
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>{t("admin", "monthlyCashReceived")}</div>
                </div>
              </div>
            )}

            {/* Outstanding Breakdown */}
            <div className="panel">
              <div className="dash-section-title" style={{ marginBottom: 20 }}>{t("admin", "outstandingBalance")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
                <div>
                  <div className="dash-eyebrow" style={{ marginBottom: 12 }}>{t("admin", "balanceBreakdown")}</div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <BalanceLine label={t("admin", "pendingValidation")} cents={totals.pendingValidationCents} color="var(--color-text-muted)" />
                    <BalanceLine label={t("admin", "approvedOutstanding")} cents={totals.outstandingCents} color="#d97706" />
                    <BalanceLine label={t("admin", "paidOut")} cents={totals.paidCents} color="#059669" />
                    <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 4, paddingTop: 4 }}>
                      <BalanceLine label={t("admin", "totalEarned") || "Total Earned"} cents={totals.earnedCents} color="var(--color-text)" bold />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="dash-eyebrow" style={{ marginBottom: 12 }}>{t("admin", "payoutSchedule")}</div>
                  {totals.nextPayoutDate ? (
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#1d4ed8" }}>
                      {t("admin", "nextPayoutDate").replace("{date}", fmtDateStr(totals.nextPayoutDate, dateLocale))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("admin", "noScheduledPayout")}</div>
                  )}
                  {payouts.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div className="dash-eyebrow" style={{ marginBottom: 10 }}>{t("admin", "recentPayouts")}</div>
                      {payouts.slice(0, 3).map(p => (
                        <div key={p.id} className="data-row" style={{ minHeight: 44 }}>
                          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{fmtDateStr(p.payoutDate, dateLocale)}</span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{fmt(p.amountCents, p.currency)}</span>
                          <PayoutBadge status={p.status} t={t} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── COMMISSION LEDGER TAB ─────────────────────────────────────────── */}
        {tab === "ledger" && (
          <div className="panel">
            {/* Filters header */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              <div className="dash-section-title" style={{ marginBottom: 0 }}>{t("admin", "commissionLedger")}</div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <select
                  className="form-input"
                  style={{ width: "auto", fontSize: 13 }}
                  value={earningFilter}
                  onChange={e => setEarningFilter(e.target.value)}
                >
                  <option value="">{t("admin", "allEarningStatuses")}</option>
                  <option value="EARNED">{t("admin", "earned")}</option>
                  <option value="PENDING_VALIDATION">{t("admin", "pendingValidation")}</option>
                  <option value="VOIDED">{t("admin", "voided")}</option>
                </select>
                <select
                  className="form-input"
                  style={{ width: "auto", fontSize: 13 }}
                  value={payoutFilter}
                  onChange={e => setPayoutFilter(e.target.value)}
                >
                  <option value="">{t("admin", "allPayoutStatuses")}</option>
                  <option value="PENDING_PAYOUT">{t("admin", "pendingPayout")}</option>
                  <option value="PAID">{t("admin", "paidOut")}</option>
                  <option value="NOT_PAYABLE">{t("admin", "notPayable")}</option>
                </select>
                <button className="btn btn-primary btn-sm" onClick={loadLedger}>{t("admin", "apply")}</button>
              </div>
            </div>

            {ledgerLoading ? (
              <div style={{ padding: "32px 0" }} className="loading-dots"><span /><span /><span /></div>
            ) : ledger.length === 0 ? (
              <div className="empty-panel">
                <div style={{ fontSize: 36, marginBottom: 12 }}>📒</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: "var(--color-text)" }}>{t("admin", "noEarningsRecorded")}</div>
                <div style={{ fontSize: 13 }}>{t("admin", "earningsWillAppear")}</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("admin", "dateCol")}</th>
                      <th>{t("admin", "sourceCol")}</th>
                      <th>{t("admin", "typeCol")}</th>
                      <th>{t("admin", "orderRefCol")}</th>
                      <th style={{ textAlign: "right" }}>{t("admin", "grossBaseCol")}</th>
                      <th style={{ textAlign: "right" }}>{t("admin", "commissionCol")}</th>
                      <th>{t("admin", "earningStatusCol")}</th>
                      <th>{t("admin", "payoutStatusCol")}</th>
                      <th>{t("admin", "payerCol")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map(row => (
                      <tr key={row.id} style={{ cursor: "pointer" }} onClick={() => setDrawer({ row, type: "ledger" })}>
                        <td className="text-sm text-secondary">{fmtDateStr(row.date, dateLocale)}</td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{row.sourceLabel}</div>
                          {row.customerName && <div className="text-sm text-muted">{row.customerName}</div>}
                        </td>
                        <td className="text-sm text-secondary">{row.sourceType.replace(/_/g, " ")}</td>
                        <td className="font-mono text-xs text-muted">{row.reference ? row.reference.slice(0, 12) + "…" : "—"}</td>
                        <td className="text-right text-sm">{row.grossBaseCents > 0 ? fmt(row.grossBaseCents, row.currency) : "—"}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: row.commissionCents < 0 ? "#991b1b" : "#065f46" }}>
                          {fmt(row.commissionCents, row.currency)}
                        </td>
                        <td><EarningBadge status={row.earningStatus} t={t} /></td>
                        <td><PayoutBadge status={row.payoutStatus} t={t} /></td>
                        <td className="text-sm">{row.payerDisplayName}</td>
                        <td>
                          <button className="btn btn-xs btn-ghost" onClick={e => { e.stopPropagation(); setDrawer({ row, type: "ledger" }); }}>
                            {t("admin", "viewBtn")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PAYOUT HISTORY TAB ───────────────────────────────────────────── */}
        {tab === "payouts" && (
          <div className="panel">
            <div className="dash-section-title" style={{ marginBottom: 20 }}>{t("admin", "payoutHistory")}</div>
            {payouts.length === 0 ? (
              <div className="empty-panel">
                <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: "var(--color-text)" }}>{t("admin", "noPayoutsYet")}</div>
                <div style={{ fontSize: 13 }}>{t("admin", "validatedEarningsWillAppear")}</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("admin", "payoutDateCol")}</th>
                      <th>{t("admin", "batchRefCol")}</th>
                      <th style={{ textAlign: "right" }}>{t("admin", "amountCol")}</th>
                      <th>{t("admin", "payerCol")}</th>
                      <th>{t("admin", "itemsCol")}</th>
                      <th>{t("admin", "methodCol")}</th>
                      <th>{t("admin", "statusField")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map(row => (
                      <tr key={row.id} style={{ cursor: "pointer" }} onClick={() => setDrawer({ row, type: "payout" })}>
                        <td className="text-sm text-secondary">{fmtDateStr(row.payoutDate, dateLocale)}</td>
                        <td className="font-mono text-xs">{row.batchId}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{fmt(row.amountCents, row.currency)}</td>
                        <td className="text-sm">{row.payerDisplayName}</td>
                        <td className="text-sm text-secondary">
                          {row.coveredItemCount} {row.coveredItemCount !== 1 ? t("admin", "itemsCol").toLowerCase() : t("admin", "itemsCol").replace(/s$/i, "").toLowerCase()}
                        </td>
                        <td className="text-sm text-secondary">{row.method.replace(/_/g, " ")}</td>
                        <td><PayoutBadge status={row.status} t={t} /></td>
                        <td>
                          <button className="btn btn-xs btn-ghost" onClick={e => { e.stopPropagation(); setDrawer({ row, type: "payout" }); }}>
                            {t("admin", "viewBtn")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ATTRIBUTED ACTIVITY TAB ──────────────────────────────────────── */}
        {tab === "activity" && (
          <div className="panel">
            <div style={{ marginBottom: 20 }}>
              <div className="dash-section-title">{t("admin", "attributedActivity")}</div>
              <p style={{ color: "var(--color-text-secondary)", marginTop: 6, fontSize: 13 }}>
                {t("admin", "attributedActivityDesc")}
              </p>
            </div>
            {activity.length === 0 ? (
              <div className="empty-panel">
                <div style={{ fontSize: 36, marginBottom: 12 }}>🎟</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: "var(--color-text)" }}>{t("admin", "noAttributedActivity")}</div>
                <div style={{ fontSize: 13 }}>{t("admin", "attributedActivityWillAppear")}</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("admin", "dateCol")}</th>
                      <th>{t("admin", "customerCol")}</th>
                      <th>{t("admin", "sourceCol")}</th>
                      <th style={{ textAlign: "right" }}>{t("admin", "orderValueCol")}</th>
                      <th>{t("admin", "attributionTypeCol")}</th>
                      <th>{t("admin", "conversionCol")}</th>
                      <th>{t("admin", "commissionOutcomeCol")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map(row => (
                      <tr key={row.id}>
                        <td className="text-sm text-secondary">{fmtDateStr(row.date, dateLocale)}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{row.customerName}</div>
                          {row.managerNote && (
                            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2, fontStyle: "italic", maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={row.managerNote}>
                              💬 {row.managerNote}
                            </div>
                          )}
                        </td>
                        <td className="text-sm">{row.sourceLabel}</td>
                        <td className="text-right" style={{ fontWeight: 600 }}>
                          {row.orderTotalCents > 0 ? fmt(row.orderTotalCents, row.currency) : "—"}
                        </td>
                        <td className="text-sm text-secondary">{row.attributionType.replace(/_/g, " ")}</td>
                        <td><ConversionBadge status={row.conversionStatus} t={t} /></td>
                        <td>
                          <EarningBadge
                            status={row.commissionOutcome === "EARNED" ? "EARNED" : "PENDING_VALIDATION"}
                            t={t}
                          />
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

      {/* ─── Detail Drawer ──────────────────────────────────────────────────── */}
      {drawer && (
        <DetailDrawer
          row={drawer.row}
          type={drawer.type}
          onClose={() => setDrawer(null)}
          t={t}
          dateLocale={dateLocale}
        />
      )}
    </div>
  );
}
