"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import OperationsSubTabs from "@/components/admin/OperationsSubTabs";

// ─── Translation shape ────────────────────────────────────────────────────────
export interface LedgerOutboxTranslations {
  eyebrow: string;
  title: string;
  subtitle: string;
  healthEmitted24h: string;
  healthOldestPending: string;
  healthOldestPendingUnit: string;
  healthNone: string;
  tabFailed: string;
  tabPending: string;
  tabProcessing: string;
  tabEmitted: string;
  retryAll: string;
  retrying: string;
  retry: string;
  loading: string;
  emptyFailed: string;
  emptyPending: string;
  emptyProcessing: string;
  emptyEmitted: string;
  colEventType: string;
  colBizObject: string;
  colSource: string;
  colStatus: string;
  colAttempts: string;
  colLastError: string;
  colCreated: string;
  copyKey: string;
  copyPayload: string;
  copied: string;
  openObject: string;
  // nav tabs
  tabConversion: string;
  tabScorecards: string;
  tabLedgerOutbox: string;
}

// ─── API row shape ────────────────────────────────────────────────────────────
interface ReservationContext {
  confirmationCode: string;
  contactName: string | null;
  reservationDate: string;
  partySize: number;
}
interface CapacityHoldContext {
  partySize: number;
  space: { name: string } | null;
}
interface CommissionContext {
  amountCents: number;
  earnerType: string;
  earnerRefId: string;
}
interface AttributionContext {
  referralActor: { displayName: string } | null;
}

interface OutboxRow {
  id: string;
  eventType: string;
  sourceSystem: string;
  sourceConnector: string | null;
  idempotencyKey: string;
  confidenceClass: string;
  status: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  reservationId: string | null;
  attributionSessionId: string | null;
  capacityHoldId: string | null;
  commissionAllocationId: string | null;
  payload: Record<string, unknown> | null;
  emittedLedgerEventId: string | null;
  // business context — may be null if FK is null or record deleted
  reservation: ReservationContext | null;
  capacityHold: CapacityHoldContext | null;
  commissionAllocation: CommissionContext | null;
  attributionSession: AttributionContext | null;
}

interface StatusCounts {
  PENDING?: number;
  PROCESSING?: number;
  EMITTED?: number;
  FAILED_REVIEW?: number;
}

// ─── Colour map ───────────────────────────────────────────────────────────────
const SC: Record<string, { bg: string; text: string; border: string }> = {
  PENDING:       { bg: "#fff8e1", text: "#b45309", border: "#fcd34d" },
  PROCESSING:    { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  EMITTED:       { bg: "#f0fdf4", text: "#15803d", border: "#86efac" },
  FAILED_REVIEW: { bg: "#fff1f2", text: "#be123c", border: "#fda4af" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = SC[status] ?? { bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 9px",
      borderRadius: 99, background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap",
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function bizLabel(row: OutboxRow): string {
  if (row.reservation) {
    const d = row.reservation.contactName
      ? `${row.reservation.confirmationCode} · ${row.reservation.contactName}`
      : row.reservation.confirmationCode;
    return `${d} · ${fmtDate(row.reservation.reservationDate)} · ${row.reservation.partySize}p`;
  }
  if (row.capacityHold) {
    const spaceName = row.capacityHold.space?.name ?? "Space";
    return `${spaceName} · ${row.capacityHold.partySize}p`;
  }
  if (row.commissionAllocation) {
    const cents = row.commissionAllocation.amountCents;
    const dollars = (cents / 100).toFixed(2);
    return `$${dollars} · ${row.commissionAllocation.earnerType}`;
  }
  if (row.attributionSession?.referralActor) {
    return row.attributionSession.referralActor.displayName;
  }
  return "—";
}

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={handleCopy} style={{
      padding: "3px 10px", borderRadius: 5, border: "1px solid #cbd5e1",
      background: copied ? "#f0fdf4" : "#f8fafc", color: copied ? "#15803d" : "#475569",
      fontSize: 11, fontWeight: 600, cursor: "pointer",
    }}>
      {copied ? copiedLabel : label}
    </button>
  );
}

// ─── Component props ──────────────────────────────────────────────────────────
interface Props {
  t: LedgerOutboxTranslations;
  canRetry: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LedgerOutboxClient({ t, canRetry }: Props) {
  const [rows, setRows]         = useState<OutboxRow[]>([]);
  const [counts, setCounts]     = useState<StatusCounts>({});
  const [health, setHealth]     = useState<{ emittedLast24h: number; oldestPendingAgeMin: number | null }>({
    emittedLast24h: 0, oldestPendingAgeMin: null,
  });
  const [activeStatus, setActiveStatus] = useState<string>("FAILED_REVIEW");
  const [loading, setLoading]   = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isWide, setIsWide]     = useState(true); // true = desktop table, false = mobile cards

  // Track whether we've applied the smart default tab yet
  const smartTabApplied = useRef(false);

  // Responsive layout detection
  useEffect(() => {
    function check() { setIsWide(window.innerWidth >= 640); }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const load = useCallback((status: string) => {
    setLoading(true);
    fetch(`/api/v1/admin/ledger-outbox?status=${status}&take=100`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setRows(d.data);
          const sc: StatusCounts = d.statusCounts ?? {};
          setCounts(sc);
          setHealth({ emittedLast24h: d.emittedLast24h ?? 0, oldestPendingAgeMin: d.oldestPendingAgeMin ?? null });
          // Smart default tab: apply once on first successful load
          if (!smartTabApplied.current) {
            smartTabApplied.current = true;
            const best =
              (sc.FAILED_REVIEW ?? 0) > 0 ? "FAILED_REVIEW" :
              (sc.PENDING      ?? 0) > 0 ? "PENDING"       :
              "EMITTED";
            if (best !== status) {
              setActiveStatus(best);
            }
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(activeStatus); }, [activeStatus, load]);

  async function retryOne(id: string) {
    setRetrying(id);
    try {
      const r = await fetch("/api/v1/admin/ledger-outbox", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", id }),
      });
      const d = await r.json();
      if (d.ok) load(activeStatus);
      else alert(d.error ?? "Retry failed");
    } finally { setRetrying(null); }
  }

  async function retryAll() {
    if (!confirm("Reset all FAILED_REVIEW rows to PENDING?")) return;
    setRetrying("all");
    try {
      const r = await fetch("/api/v1/admin/ledger-outbox", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry-all" }),
      });
      const d = await r.json();
      if (d.ok) { alert(`Reset ${d.updated} row(s) to PENDING`); load(activeStatus); }
      else alert(d.error ?? "Retry-all failed");
    } finally { setRetrying(null); }
  }

  const TABS = [
    { key: "FAILED_REVIEW", label: t.tabFailed },
    { key: "PENDING",       label: t.tabPending },
    { key: "PROCESSING",    label: t.tabProcessing },
    { key: "EMITTED",       label: t.tabEmitted },
  ];

  const EMPTY: Record<string, string> = {
    FAILED_REVIEW: t.emptyFailed,
    PENDING:       t.emptyPending,
    PROCESSING:    t.emptyProcessing,
    EMITTED:       t.emptyEmitted,
  };

  const navTabs = [
    { href: "/admin/operations/conversion",    label: t.tabConversion },
    { href: "/admin/operations/scorecards",    label: t.tabScorecards },
    { href: "/admin/operations/ledger-outbox", label: t.tabLedgerOutbox },
  ];

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "32px 16px", fontFamily: "system-ui, sans-serif", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 4 }}>{t.eyebrow}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{t.title}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{t.subtitle}</div>
      </div>

      {/* Health tiles */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: t.healthEmitted24h,    val: String(health.emittedLast24h), c: { bg: "#f0fdf4", text: "#15803d", border: "#86efac" } },
          { label: t.healthOldestPending, val: health.oldestPendingAgeMin != null ? `${health.oldestPendingAgeMin} ${t.healthOldestPendingUnit}` : t.healthNone, c: { bg: "#fff8e1", text: "#b45309", border: "#fcd34d" } },
          { label: "FAILED_REVIEW",        val: String(counts.FAILED_REVIEW ?? 0), c: SC.FAILED_REVIEW },
        ].map(({ label, val, c }) => (
          <div key={label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 16px", minWidth: 140 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: c.text, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.text }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Section nav */}
      <OperationsSubTabs tabs={navTabs} />

      {/* Status filter + bulk retry */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map((tab) => {
          const count = counts[tab.key as keyof StatusCounts] ?? 0;
          const c = SC[tab.key] ?? { bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1" };
          const isActive = activeStatus === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveStatus(tab.key)} style={{
              padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: isActive ? c.bg : "#f8fafc", color: isActive ? c.text : "#475569",
              border: `1.5px solid ${isActive ? c.border : "#e2e8f0"}`, transition: "all 0.15s",
            }}>
              {tab.label} <span style={{ marginLeft: 4, opacity: 0.8 }}>({count})</span>
            </button>
          );
        })}
        {canRetry && activeStatus === "FAILED_REVIEW" && (counts.FAILED_REVIEW ?? 0) > 0 && (
          <button onClick={() => void retryAll()} disabled={retrying === "all"} style={{
            marginLeft: "auto", padding: "6px 16px", borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontWeight: 700, background: "#be123c", color: "#fff",
            border: "none", opacity: retrying === "all" ? 0.6 : 1,
          }}>
            {retrying === "all" ? t.retrying : `${t.retryAll} (${counts.FAILED_REVIEW})`}
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: 48 }}>{t.loading}</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: "48px 24px", fontSize: 14, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          {EMPTY[activeStatus] ?? `No ${activeStatus.replace(/_/g, " ").toLowerCase()} rows.`}
        </div>
      ) : isWide ? (
        /* ── Desktop table ───────────────────────────────────────────────── */
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #e2e8f0" }}>
                  {[t.colEventType, t.colBizObject, t.colStatus, t.colAttempts, t.colLastError, t.colCreated, ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                      <td style={{ padding: "10px 14px", maxWidth: 200 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{row.eventType}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", marginTop: 2 }}>{row.sourceSystem}</div>
                      </td>
                      <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                        <div style={{ fontSize: 12, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bizLabel(row)}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}><StatusBadge status={row.status} /></td>
                      <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: row.attemptCount >= 3 ? "#be123c" : "#475569", textAlign: "center" }}>
                        {row.attemptCount}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 11, color: "#be123c", maxWidth: 220 }}>
                        {row.lastError ? (
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.lastError}>
                            {row.lastError}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{fmt(row.createdAt)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        {canRetry && row.status === "FAILED_REVIEW" && (
                          <button onClick={(e) => { e.stopPropagation(); void retryOne(row.id); }} disabled={retrying === row.id}
                            style={{ padding: "4px 12px", borderRadius: 6, border: "1.5px solid #be123c", background: "transparent", color: "#be123c", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: retrying === row.id ? 0.6 : 1 }}>
                            {retrying === row.id ? "…" : t.retry}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #e2e8f0" }}>
                        <td colSpan={7} style={{ padding: "12px 20px" }}>
                          <RowDetail row={row} canRetry={canRetry} retrying={retrying} onRetry={retryOne} t={t} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Mobile cards (≤ 639px) ─────────────────────────────────────── */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((row) => (
            <div key={row.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", cursor: "pointer" }} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>{row.eventType}</div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bizLabel(row)}</div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: row.attemptCount >= 3 ? "#be123c" : "#64748b", fontWeight: 600 }}>
                    {t.colAttempts}: {row.attemptCount}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(row.createdAt)}</span>
                </div>
                {row.lastError && (
                  <div style={{ fontSize: 11, color: "#be123c", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.lastError}>
                    {row.lastError}
                  </div>
                )}
              </div>
              {canRetry && row.status === "FAILED_REVIEW" && (
                <div style={{ borderTop: "1px solid #f1f5f9", padding: "8px 14px" }}>
                  <button onClick={() => void retryOne(row.id)} disabled={retrying === row.id}
                    style={{ padding: "5px 14px", borderRadius: 6, border: "1.5px solid #be123c", background: "transparent", color: "#be123c", fontSize: 12, fontWeight: 700, cursor: "pointer", width: "100%", opacity: retrying === row.id ? 0.6 : 1 }}>
                    {retrying === row.id ? "…" : t.retry}
                  </button>
                </div>
              )}
              {expanded === row.id && (
                <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 14px", background: "#f8fafc" }}>
                  <RowDetail row={row} canRetry={canRetry} retrying={retrying} onRetry={retryOne} t={t} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Expanded row detail ──────────────────────────────────────────────────────
function RowDetail({ row, canRetry, retrying, onRetry, t }: {
  row: OutboxRow;
  canRetry: boolean;
  retrying: string | null;
  onRetry: (id: string) => Promise<void>;
  t: LedgerOutboxTranslations;
}) {
  const fkLinks = [
    row.reservationId          && { label: "Reservation",         val: row.reservationId,          href: `/admin/reservations?id=${row.reservationId}` },
    row.attributionSessionId   && { label: "Attribution Session", val: row.attributionSessionId,   href: null },
    row.commissionAllocationId && { label: "Commission Alloc.",   val: row.commissionAllocationId, href: null },
    row.capacityHoldId         && { label: "Capacity Hold",       val: row.capacityHoldId,         href: null },
  ].filter(Boolean) as { label: string; val: string; href: string | null }[];

  return (
    <div style={{ fontSize: 12 }}>
      {/* Technical fields grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 20px", marginBottom: 12 }}>
        {[
          { label: "Outbox ID",        val: row.id },
          { label: "Idempotency Key",  val: row.idempotencyKey },
          { label: "Confidence Class", val: row.confidenceClass },
          { label: "Last Attempt",     val: row.lastAttemptAt ? fmt(row.lastAttemptAt) : "—" },
          { label: "Emitted Event ID", val: row.emittedLedgerEventId ?? "—" },
        ].map(({ label, val }) => (
          <div key={label}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>{label}</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#0f172a", wordBreak: "break-all" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* FK links */}
      {fkLinks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 16px", marginBottom: 10 }}>
          {fkLinks.map(({ label, val, href }) => (
            <div key={label}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8" }}>{label}: </span>
              {href ? (
                <a href={href} onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, fontFamily: "monospace", color: "#1d4ed8" }}>{val}</a>
              ) : (
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "#475569" }}>{val}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Operator actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <CopyButton value={row.idempotencyKey} label={t.copyKey} copiedLabel={t.copied} />
        {row.payload && (
          <CopyButton value={JSON.stringify(row.payload, null, 2)} label={t.copyPayload} copiedLabel={t.copied} />
        )}
        {row.reservationId && (
          <a href={`/admin/reservations?id=${row.reservationId}`} onClick={(e) => e.stopPropagation()}
            style={{ padding: "3px 10px", borderRadius: 5, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
            {t.openObject}
          </a>
        )}
        {canRetry && row.status === "FAILED_REVIEW" && (
          <button onClick={(e) => { e.stopPropagation(); void onRetry(row.id); }} disabled={retrying === row.id}
            style={{ padding: "3px 12px", borderRadius: 5, border: "1.5px solid #be123c", background: "transparent", color: "#be123c", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: retrying === row.id ? 0.6 : 1 }}>
            {retrying === row.id ? "…" : t.retry}
          </button>
        )}
      </div>

      {/* Last error */}
      {row.lastError && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 4 }}>Last Error</div>
          <pre style={{ fontSize: 11, background: "#fff1f2", border: "1px solid #fda4af", borderRadius: 6, padding: "8px 12px", overflow: "auto", maxHeight: 120, color: "#be123c", margin: 0, whiteSpace: "pre-wrap" }}>
            {row.lastError}
          </pre>
        </div>
      )}

      {/* Payload */}
      {row.payload && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 4 }}>Payload</div>
          <pre style={{ fontSize: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px", overflow: "auto", maxHeight: 200, color: "#334155", margin: 0 }}>
            {JSON.stringify(row.payload as Record<string, unknown>, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
