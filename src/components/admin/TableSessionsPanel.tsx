"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import TrustKpiStrip from "@/components/admin/revenue/TrustKpiStrip";
import SessionDrillDownTabs from "@/components/admin/revenue/SessionDrillDownTabs";

interface TableSession {
  id: string;
  venueId: string;
  reservationId: string | null;
  invuOrderId: string | null;
  tableLabel: string | null;
  openedAt: string | null;
  closedAt: string | null;
  grossCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  refundCents: number;
  netRevenueCents: number;
  commissionableCents: number;
  matchMethod: string;
  matchStatus: string | null;
  trustScore: number;
  status: string;
  venue?: { name: string };
  reservation?: { confirmationCode: string; contactName: string } | null;
}

interface ReviewItem {
  id: string;
  issueType: string;
  status: string;
  summary: string;
}

interface SessionDetail extends TableSession {
  rawRecord: { id: string; invuOrderId: string | null; payloadType: string; pulledAt: string | null } | null;
  normalizedRecord: {
    id: string;
    invuOrderId: string | null;
    publicOrderNumber: string | null;
    tableLabel: string | null;
    customerName: string | null;
    guestCount: number | null;
    statusCanonical: string;
  } | null;
  syncRun: { id: string; scopeType: string; startedAt: string | null; status: string } | null;
  reviewItems: ReviewItem[];
  reservation?: {
    confirmationCode: string;
    contactName: string;
    assignedRestaurantHostId: string | null;
  } | null;
}

interface Venue { id: string; name: string; }
interface Props { venues: Venue[]; }

const MATCH_COLORS: Record<string, string> = {
  AUTO: "#3b82f6",
  MANUAL: "#10b981",
  UNMATCHED: "#ef4444",
};

const STATUS_COLORS: Record<string, string> = {
  MATCHED: "#10b981",
  PENDING_REVIEW: "#f59e0b",
  DISPUTED: "#ef4444",
  CLOSED: "#6b7280",
};

function trustPillColor(score: number): string {
  if (score >= 0.95) return "#10b981";
  if (score >= 0.75) return "#f59e0b";
  return "#ef4444";
}

function cents(n: number): string {
  return `$${(n / 100).toFixed(2)}`;
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TableSessionsPanel({ venues }: Props) {
  const t = useTranslation();
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [venueFilter, setVenueFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [matchFilter, setMatchFilter] = useState("");
  const [drawerSession, setDrawerSession] = useState<SessionDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [recomputeLoading, setRecomputeLoading] = useState<string | null>(null);
  const [cancelBindingLoading, setCancelBindingLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (venueFilter) params.set("venueId", venueFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (matchFilter) params.set("matchMethod", matchFilter);
      const res = await fetch(`/api/v1/admin/integrations/invu/table-sessions?${params}`);
      const json = await res.json();
      if (json.ok) { setSessions(json.data); setTotal(json.total); }
    } finally {
      setLoading(false);
    }
  }, [page, venueFilter, statusFilter, matchFilter]);

  useEffect(() => { load(); }, [load]);

  const openDrawer = async (id: string) => {
    setDrawerLoading(true);
    setDrawerSession(null);
    try {
      const res = await fetch(`/api/v1/admin/integrations/invu/table-sessions/${id}`);
      const json = await res.json();
      if (json.ok) setDrawerSession(json.data as SessionDetail);
    } finally {
      setDrawerLoading(false);
    }
  };

  const recompute = async (id: string) => {
    setRecomputeLoading(id);
    try {
      const res = await fetch(`/api/v1/admin/integrations/invu/table-sessions/${id}/recompute`, { method: "POST" });
      const json = await res.json();
      if (json.ok) { setMsg(t("admin", "invu.tableSessions.recomputeSuccess")); load(); }
      else setMsg(json.error ?? t("admin", "invu.tableSessions.recomputeError"));
    } finally {
      setRecomputeLoading(null);
    }
  };

  const cancelBinding = async (id: string) => {
    if (!window.confirm("Cancel this stuck POS binding? This sets the session to DISPUTED, cancels the attribution, and reverses any pending commission allocations. Use only when the bound INVU order will never be ingested (e.g. it was deleted in INVU).")) {
      return;
    }
    const reason = window.prompt("Reason for cancellation (optional):", "Stuck binding — INVU order deleted before sync") ?? "";
    setCancelBindingLoading(id);
    try {
      const res = await fetch(`/api/v1/admin/integrations/invu/table-sessions/${id}/cancel-binding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg(`Binding cancelled. Reversed ${json.data?.reversedAllocationCount ?? 0} pending allocation(s).`);
        setDrawerSession(null);
        load();
      } else {
        setMsg(json.error ?? "Failed to cancel binding");
      }
    } finally {
      setCancelBindingLoading(null);
    }
  };

  const card: React.CSSProperties = {
    background: "var(--layer-1)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 4 }}>
        {t("admin", "invu.tableSessions.title")}
      </h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 24 }}>
        {t("admin", "invu.tableSessions.subtitle")}
      </p>

      {msg && (
        <div style={{ background: "#10b981", color: "#fff", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13 }}>
          {msg}
          <button onClick={() => setMsg("")} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Trust chain KPI strip — reflects active venue filter */}
      <TrustKpiStrip venueId={venueFilter || undefined} />

      {/* Filters */}
      <div style={{ ...card, padding: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={venueFilter}
          onChange={(e) => { setVenueFilter(e.target.value); setPage(1); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", fontSize: 13 }}
        >
          <option value="">{t("admin", "invu.tableSessions.allVenues")}</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", fontSize: 13 }}
        >
          <option value="">{t("admin", "invu.tableSessions.allStatuses")}</option>
          <option value="MATCHED">{t("admin", "invu.tableSessions.statusMatched")}</option>
          <option value="PENDING_REVIEW">{t("admin", "invu.tableSessions.statusPendingReview")}</option>
          <option value="DISPUTED">{t("admin", "invu.tableSessions.statusDisputed")}</option>
          <option value="CLOSED">{t("admin", "invu.tableSessions.statusClosed")}</option>
        </select>

        <select
          value={matchFilter}
          onChange={(e) => { setMatchFilter(e.target.value); setPage(1); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", fontSize: 13 }}
        >
          <option value="">{t("admin", "invu.tableSessions.allMatchMethods")}</option>
          <option value="AUTO">{t("admin", "invu.tableSessions.matchAuto")}</option>
          <option value="MANUAL">{t("admin", "invu.tableSessions.matchManual")}</option>
          <option value="UNMATCHED">{t("admin", "invu.tableSessions.matchUnmatched")}</option>
        </select>

        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {total !== 1
            ? t("admin", "invu.tableSessions.totalSessionsCountPlural", { count: total })
            : t("admin", "invu.tableSessions.totalSessionsCount", { count: total })}
        </span>
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>{t("admin", "invu.tableSessions.loading")}</div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>{t("admin", "invu.tableSessions.noSessions")}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--layer-2)" }}>
                  {[
                    t("admin", "invu.tableSessions.sessionId"),
                    t("admin", "invu.tableSessions.reservationId"),
                    t("admin", "invu.tableSessions.venue"),
                    t("admin", "invu.tableSessions.tableLabel"),
                    t("admin", "invu.tableSessions.openedAt"),
                    t("admin", "invu.tableSessions.closedAt"),
                    t("admin", "invu.tableSessions.gross"),
                    t("admin", "invu.tableSessions.discounts"),
                    t("admin", "invu.tableSessions.tax"),
                    t("admin", "invu.tableSessions.tips"),
                    t("admin", "invu.tableSessions.refunds"),
                    t("admin", "invu.tableSessions.netRevenue"),
                    t("admin", "invu.tableSessions.commissionable"),
                    t("admin", "invu.tableSessions.matchMethod"),
                    t("admin", "invu.tableSessions.trustScore"),
                    t("admin", "invu.tableSessions.status"),
                    "",
                  ].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => openDrawer(s.id)}
                    style={{ borderBottom: "1px solid rgba(128,128,128,0.1)", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 10 }}>{s.id.slice(-8)}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 10 }}>
                      {s.reservation?.confirmationCode ?? (s.reservationId ? s.reservationId.slice(-8) : "—")}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{s.venue?.name ?? "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{s.tableLabel ?? "—"}</td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{formatDate(s.openedAt)}</td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{formatDate(s.closedAt)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{cents(s.grossCents)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#ef4444" }}>
                      {s.discountCents > 0 ? `-${cents(s.discountCents)}` : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{s.taxCents > 0 ? cents(s.taxCents) : "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{s.tipCents > 0 ? cents(s.tipCents) : "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#f59e0b" }}>
                      {s.refundCents > 0 ? `-${cents(s.refundCents)}` : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{cents(s.netRevenueCents)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#10b981" }}>{cents(s.commissionableCents)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: MATCH_COLORS[s.matchMethod] + "22", color: MATCH_COLORS[s.matchMethod], padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        {s.matchMethod}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: trustPillColor(s.trustScore) + "22", color: trustPillColor(s.trustScore), padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        {(s.trustScore * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: STATUS_COLORS[s.status] + "22", color: STATUS_COLORS[s.status], padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        {s.status.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }} onClick={(e) => e.stopPropagation()}>
                      <button
                        disabled={recomputeLoading === s.id}
                        onClick={() => recompute(s.id)}
                        style={{ background: "var(--layer-2)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}
                      >
                        {recomputeLoading === s.id ? "…" : t("admin", "invu.tableSessions.recompute")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", cursor: "pointer" }}
          >
            {t("admin", "invu.tableSessions.previous")}
          </button>
          <span style={{ padding: "6px 14px", fontSize: 13 }}>{page}</span>
          <button
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--layer-2)", cursor: "pointer" }}
          >
            {t("admin", "invu.tableSessions.next")}
          </button>
        </div>
      )}

      {/* Detail Drawer */}
      {drawerSession !== null && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}
          onClick={() => setDrawerSession(null)}
        >
          <div
            style={{ width: 560, maxWidth: "95vw", background: "var(--layer-1)", height: "100%", overflowY: "auto", padding: 28, boxShadow: "-4px 0 32px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {drawerLoading ? (
              <p style={{ color: "var(--color-text-muted)" }}>{t("admin", "invu.tableSessions.drawerLoading")}</p>
            ) : drawerSession.id ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20 }}>
                    {drawerSession.reservation?.confirmationCode ?? `Session ${drawerSession.id.slice(-8)}`}
                  </h2>
                  <button
                    onClick={() => setDrawerSession(null)}
                    style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--color-text-muted)" }}
                    aria-label="Close"
                  >×</button>
                </div>
                <SessionDrillDownTabs sessionId={drawerSession.id} />
                {/* Legacy sync-engine details (review queue items, recompute) below tabs */}
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
                  <DrawerContent
                    session={drawerSession}
                    onClose={() => setDrawerSession(null)}
                    onCancelBinding={cancelBinding}
                    cancelBindingLoading={cancelBindingLoading === drawerSession.id}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function DrawerContent({
  session: s,
  onClose,
  onCancelBinding,
  cancelBindingLoading,
}: {
  session: SessionDetail;
  onClose: () => void;
  onCancelBinding: (id: string) => void;
  cancelBindingLoading: boolean;
}) {
  const t = useTranslation();
  const sectionStyle: React.CSSProperties = {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottom: "1px solid var(--color-border)",
  };
  const sectionHeader: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-text-muted)",
    marginBottom: 10,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 2 }}>
            {t("admin", "invu.tableSessions.sessionDetail")}
          </h2>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "var(--color-text-muted)" }}>{s.id}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Cancel-binding is for stuck UNMATCHED rows only. Server-side
              defends with an extra AUTO_MATCHED/MANUALLY_OVERRIDDEN refusal,
              so even if this gate is bypassed, healthy matches stay safe. */}
          {s.status === "PENDING_REVIEW" &&
            (s.matchStatus === "UNMATCHED" || s.matchStatus === null) && (
            <button
              onClick={() => onCancelBinding(s.id)}
              disabled={cancelBindingLoading}
              style={{
                background: "transparent",
                color: "#ef4444",
                border: "1px solid #ef4444",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: cancelBindingLoading ? "not-allowed" : "pointer",
                opacity: cancelBindingLoading ? 0.5 : 1,
              }}
              title="Cancel a stuck POS binding (e.g. when the bound INVU order was deleted before sync)"
            >
              {cancelBindingLoading ? "Cancelling..." : "Cancel binding"}
            </button>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-muted)" }}>✕</button>
        </div>
      </div>

      {/* Raw Source */}
      <div style={sectionStyle}>
        <h3 style={sectionHeader}>{t("admin", "invu.tableSessions.rawSource")}</h3>
        <Row label={t("admin", "invu.tableSessions.invuOrderId")} value={s.invuOrderId ?? "—"} />
        {s.rawRecord && (
          <>
            <Row label={t("admin", "invu.tableSessions.payloadType")} value={s.rawRecord.payloadType} />
            <Row
              label={t("admin", "invu.tableSessions.pulledAt")}
              value={s.rawRecord.pulledAt ? new Date(s.rawRecord.pulledAt).toLocaleString() : "—"}
            />
          </>
        )}
      </div>

      {/* Normalized Values */}
      {s.normalizedRecord && (
        <div style={sectionStyle}>
          <h3 style={sectionHeader}>{t("admin", "invu.tableSessions.normalizedValues")}</h3>
          <Row label={t("admin", "invu.tableSessions.orderNumber")} value={s.normalizedRecord.publicOrderNumber ?? "—"} />
          <Row label={t("admin", "invu.tableSessions.tableLabel")} value={s.normalizedRecord.tableLabel ?? "—"} />
          <Row label={t("admin", "invu.tableSessions.customer")} value={s.normalizedRecord.customerName ?? "—"} />
          <Row label={t("admin", "invu.tableSessions.guests")} value={String(s.normalizedRecord.guestCount ?? "—")} />
          <Row label={t("admin", "invu.tableSessions.status")} value={s.normalizedRecord.statusCanonical} />
        </div>
      )}

      {/* Reservation */}
      <div style={sectionStyle}>
        <h3 style={sectionHeader}>{t("admin", "invu.tableSessions.matchedReservation")}</h3>
        {s.reservation ? (
          <>
            <Row label={t("admin", "invu.tableSessions.confirmation")} value={s.reservation.confirmationCode} />
            <Row label={t("admin", "invu.tableSessions.contact")} value={s.reservation.contactName} />
            <Row label={t("admin", "invu.tableSessions.hostId")} value={s.reservation.assignedRestaurantHostId ?? "—"} />
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {t("admin", "invu.tableSessions.noReservationLinked")}
          </p>
        )}
      </div>

      {/* Aggregation */}
      <div style={sectionStyle}>
        <h3 style={sectionHeader}>{t("admin", "invu.tableSessions.aggregationBreakdown")}</h3>
        <Row label={t("admin", "invu.tableSessions.gross")} value={`$${(s.grossCents / 100).toFixed(2)}`} />
        <Row label={t("admin", "invu.tableSessions.discounts")} value={`-$${(s.discountCents / 100).toFixed(2)}`} />
        <Row label={t("admin", "invu.tableSessions.refunds")} value={`-$${(s.refundCents / 100).toFixed(2)}`} />
        <Row label={t("admin", "invu.tableSessions.netRevenue")} value={`$${(s.netRevenueCents / 100).toFixed(2)}`} bold />
        <Row label={t("admin", "invu.tableSessions.commissionable")} value={`$${(s.commissionableCents / 100).toFixed(2)}`} bold />
        <Row label={t("admin", "invu.tableSessions.tax")} value={`$${(s.taxCents / 100).toFixed(2)}`} />
        <Row label={t("admin", "invu.tableSessions.tips")} value={`$${(s.tipCents / 100).toFixed(2)}`} />
        <Row label={t("admin", "invu.tableSessions.matchMethod")} value={s.matchMethod} />
        <Row label={t("admin", "invu.tableSessions.trustScore")} value={`${(s.trustScore * 100).toFixed(1)}%`} />
        <Row label={t("admin", "invu.tableSessions.status")} value={s.status} />
      </div>

      {/* Review History */}
      {s.reviewItems?.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={sectionHeader}>{t("admin", "invu.tableSessions.reviewHistory")}</h3>
          {s.reviewItems.map((r: ReviewItem) => (
            <div key={r.id} style={{ background: "var(--layer-2)", borderRadius: 8, padding: "10px 12px", marginBottom: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 600 }}>{r.issueType.replace(/_/g, " ")} — {r.status}</div>
              <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>{r.summary}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sync Run */}
      {s.syncRun && (
        <div>
          <h3 style={sectionHeader}>{t("admin", "invu.tableSessions.syncRunSource")}</h3>
          <Row label={t("admin", "invu.tableSessions.runId")} value={s.syncRun.id.slice(-8)} />
          <Row label={t("admin", "invu.tableSessions.scope")} value={s.syncRun.scopeType} />
          <Row label={t("admin", "invu.tableSessions.status")} value={s.syncRun.status} />
          <Row
            label={t("admin", "invu.tableSessions.openedAt")}
            value={s.syncRun.startedAt ? new Date(s.syncRun.startedAt).toLocaleString() : "—"}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid rgba(128,128,128,0.07)" }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  );
}
