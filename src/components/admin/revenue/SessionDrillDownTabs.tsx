"use client";
import { useEffect, useState } from "react";

interface Allocation {
  id: string;
  earnerType: string;
  earnerRefId: string;
  amountCents: number;
  status: string;
  commissionRuleSnapshot: unknown;
  createdAt: string;
}

interface CommissionEntry {
  id: string;
  amountCents: number;
  status: string;
  referrer?: { fullName: string; referrerType: string } | null;
  createdAt: string;
}

interface SessionDetails {
  session: {
    id: string;
    venueId: string;
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
    trustScore: number;
    matchMethod: string;
    status: string;
    invuOrderId: string | null;
    invuOrderJson: unknown;
    venue?: { name: string };
    reservation?: {
      confirmationCode: string;
      contactName: string;
      partySize: number;
      reservationDate: string;
      attributions: Array<{
        sourceType: string;
        sourceLabel: string | null;
        referrer?: { fullName: string; referrerType: string; organizationName: string | null } | null;
      }>;
      assignedHost?: {
        id: string;
        user?: { name: string | null; email: string | null } | null;
      } | null;
    } | null;
    attributionSession?: {
      id: string;
      kind: string;
      bookingCode: string;
      openedAt: string;
      closedAt: string | null;
    } | null;
    allocations: Allocation[];
  };
  commissionEntries: CommissionEntry[];
  earnerNames: Record<string, string>;
  auditTrail: Array<{
    id: string;
    actorId: string;
    action: string;
    metadata: unknown;
    createdAt: string;
  }>;
}

const TABS = [
  { key: "attribution", label: "Attribution" },
  { key: "revenue", label: "Table Revenue" },
  { key: "commission", label: "Commission Logic" },
  { key: "adjustments", label: "Adjustments" },
  { key: "audit", label: "Audit Trail" },
] as const;

type TabKey = typeof TABS[number]["key"];

function cents(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${(Math.abs(n) / 100).toFixed(2)}`;
}

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SessionDrillDownTabs({ sessionId }: { sessionId: string }) {
  const [tab, setTab] = useState<TabKey>("attribution");
  const [data, setData] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/admin/revenue/sessions/${sessionId}/details`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setData(j.data);
        else setError(j.error ?? "Error");
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) return <div style={{ padding: 24, color: "var(--color-text-muted)" }}>Loading session details…</div>;
  if (error) return <div style={{ padding: 24, color: "#ef4444" }}>Error: {error}</div>;
  if (!data) return null;

  const s = data.session;

  return (
    <div>
      {/* Tab strip */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--color-border)",
        marginBottom: 16,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "none",
              border: "none",
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: tab === t.key ? "var(--color-text)" : "var(--color-text-muted)",
              borderBottom: tab === t.key ? "2px solid var(--brand-primary, #c41e3a)" : "2px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "attribution" && (
        <div>
          <Section title="Reservation">
            <Row k="Confirmation code" v={s.reservation?.confirmationCode ?? "—"} mono />
            <Row k="Date" v={s.reservation?.reservationDate ? fmtDateTime(s.reservation.reservationDate) : "—"} />
            <Row k="Venue" v={s.venue?.name ?? "—"} />
            <Row k="Party size" v={String(s.reservation?.partySize ?? "—")} />
            <Row k="Guest" v={s.reservation?.contactName ?? "—"} />
            <Row k="Table" v={s.tableLabel ?? "—"} />
          </Section>

          <Section title="Source & Referrer">
            {s.reservation?.attributions?.length ? s.reservation.attributions.map((a, i) => (
              <div key={i} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(128,128,128,0.07)" }}>
                <Row k="Source" v={a.sourceType} />
                {a.sourceLabel && <Row k="Source label" v={a.sourceLabel} />}
                {a.referrer && (
                  <>
                    <Row k="Referrer" v={a.referrer.fullName} />
                    <Row k="Referrer type" v={a.referrer.referrerType} />
                    {a.referrer.organizationName && <Row k="Organization" v={a.referrer.organizationName} />}
                  </>
                )}
              </div>
            )) : <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No attribution data</div>}
          </Section>

          <Section title="Host & Match">
            <Row k="Assigned host" v={s.reservation?.assignedHost?.user?.name ?? s.reservation?.assignedHost?.user?.email ?? "—"} />
            <Row k="Match method" v={s.matchMethod} />
            <Row k="Trust score" v={`${(s.trustScore * 100).toFixed(1)}%`} />
            <Row k="Status" v={s.status} />
            {s.attributionSession && (
              <>
                <Row k="Booking code (chain)" v={s.attributionSession.bookingCode} mono />
                <Row k="Attribution kind" v={s.attributionSession.kind} />
              </>
            )}
          </Section>
        </div>
      )}

      {tab === "revenue" && (
        <div>
          <Section title="Revenue waterfall">
            <Row k="Gross" v={cents(s.grossCents)} />
            <Row k="Discounts" v={s.discountCents > 0 ? `-${cents(s.discountCents)}` : "—"} />
            <Row k="Tax" v={cents(s.taxCents)} />
            <Row k="Tips" v={cents(s.tipCents)} />
            <Row k="Refunds" v={s.refundCents > 0 ? `-${cents(s.refundCents)}` : "—"} />
            <Row k="Net revenue" v={cents(s.netRevenueCents)} bold />
            <Row k="Commissionable base" v={cents(s.commissionableCents)} bold />
          </Section>
          <Section title="INVU reference">
            <Row k="Order ID" v={s.invuOrderId ?? "—"} mono />
            <Row k="Opened" v={fmtDateTime(s.openedAt)} />
            <Row k="Closed" v={fmtDateTime(s.closedAt)} />
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setShowRawJson((v) => !v)}
                style={{ background: "var(--layer-2)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}
              >
                {showRawJson ? "Hide raw JSON" : "Show raw JSON"}
              </button>
              {showRawJson && (
                <pre style={{ marginTop: 8, padding: 12, background: "var(--layer-2)", borderRadius: 8, fontSize: 10, overflow: "auto", maxHeight: 300 }}>
                  {s.invuOrderJson ? JSON.stringify(s.invuOrderJson, null, 2) : "(empty)"}
                </pre>
              )}
            </div>
          </Section>
        </div>
      )}

      {tab === "commission" && (
        <div>
          <Section title="INVU-Verified Allocations">
            {s.allocations.filter((a) => a.status !== "REVERSED").length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No allocations on this session.</div>
            ) : s.allocations.filter((a) => a.status !== "REVERSED").map((a) => (
              <div key={a.id} style={{ padding: 10, marginBottom: 8, background: "var(--layer-2)", borderRadius: 8, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>
                    {data.earnerNames[a.earnerRefId] ?? a.earnerRefId.slice(-6)}
                    <span style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px", background: "var(--layer-1)", borderRadius: 4 }}>{a.earnerType}</span>
                  </span>
                  <span style={{ fontWeight: 700 }}>{cents(a.amountCents)} <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{a.status}</span></span>
                </div>
                <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                  Source: <span style={{ color: "#10b981", fontWeight: 700 }}>INVU-Verified</span>
                </div>
              </div>
            ))}
          </Section>
          {data.commissionEntries.length > 0 && (
            <Section title="Manual Entries (legacy)">
              {data.commissionEntries.map((e) => (
                <div key={e.id} style={{ padding: 10, marginBottom: 8, background: "var(--layer-2)", borderRadius: 8, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600 }}>{e.referrer?.fullName ?? "—"} <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{e.referrer?.referrerType ?? ""}</span></span>
                    <span style={{ fontWeight: 700 }}>{cents(e.amountCents)} <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{e.status}</span></span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                    Source: <span style={{ color: "#f59e0b", fontWeight: 700 }}>Manual Entry</span>
                  </div>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}

      {tab === "adjustments" && (
        <div>
          <Section title="Reversals & adjustments">
            {s.allocations.filter((a) => a.status === "REVERSED").length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No adjustments recorded.</div>
            ) : s.allocations.filter((a) => a.status === "REVERSED").map((a) => (
              <div key={a.id} style={{ padding: 10, marginBottom: 8, background: "var(--layer-2)", borderRadius: 8, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{data.earnerNames[a.earnerRefId] ?? a.earnerRefId.slice(-6)} <span style={{ fontSize: 10 }}>({a.earnerType})</span></span>
                  <span style={{ fontWeight: 700, color: a.amountCents < 0 ? "#ef4444" : undefined }}>{cents(a.amountCents)}</span>
                </div>
                <pre style={{ marginTop: 6, fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(a.commissionRuleSnapshot, null, 2)}
                </pre>
              </div>
            ))}
          </Section>
          <Section title="Rule snapshots (current allocations)">
            {s.allocations.filter((a) => a.status !== "REVERSED").map((a) => (
              <details key={a.id} style={{ marginBottom: 6 }}>
                <summary style={{ fontSize: 11, cursor: "pointer", color: "var(--color-text-muted)" }}>
                  {data.earnerNames[a.earnerRefId] ?? a.earnerRefId.slice(-6)} — {cents(a.amountCents)} ({a.status})
                </summary>
                <pre style={{ marginTop: 4, fontSize: 10, padding: 8, background: "var(--layer-2)", borderRadius: 6, overflow: "auto" }}>
                  {JSON.stringify(a.commissionRuleSnapshot, null, 2)}
                </pre>
              </details>
            ))}
          </Section>
        </div>
      )}

      {tab === "audit" && (
        <div>
          <Section title="Immutable audit trail">
            {data.auditTrail.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No revenue audit entries for this session yet.</div>
            ) : data.auditTrail.map((e) => {
              const meta = (e.metadata ?? {}) as { before?: unknown; after?: unknown; note?: string | null; allocationId?: string | null };
              return (
                <div key={e.id} style={{ padding: 10, marginBottom: 8, background: "var(--layer-2)", borderRadius: 8, fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{e.action.replace(/^REVENUE_/, "")}</span>
                    <span style={{ color: "var(--color-text-muted)" }}>{fmtDateTime(e.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                    Actor: <span style={{ fontFamily: "monospace" }}>{e.actorId.slice(-8)}</span>
                    {meta.allocationId && <> · Allocation: <span style={{ fontFamily: "monospace" }}>{meta.allocationId.slice(-8)}</span></>}
                  </div>
                  {meta.note && <div style={{ marginTop: 4, fontStyle: "italic" }}>{`"${meta.note}"`}</div>}
                  {(meta.before !== undefined || meta.after !== undefined) && (
                    <pre style={{ marginTop: 4, fontSize: 9, color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>
                      {JSON.stringify({ before: meta.before, after: meta.after }, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h4 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: 8, fontWeight: 700 }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

function Row({ k, v, bold, mono }: { k: string; v: string; bold?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: "1px solid rgba(128,128,128,0.07)" }}>
      <span style={{ color: "var(--color-text-muted)" }}>{k}</span>
      <span style={{ fontWeight: bold ? 700 : 400, fontFamily: mono ? "monospace" : undefined, fontSize: mono ? 11 : 12 }}>{v}</span>
    </div>
  );
}
