"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { EmptyStateCard, KPIStatCard } from "@/components/ui/dashboard";

interface SeriesDetail {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: string;
  venue: string | null;
  city: string | null;
  country: string | null;
  venueAddress: string | null;
  heroImageUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacityTotal: number;
  capacityReserved: number;
  capacitySold: number;
  partnerShareBps: number | null;
  partner: { id: string; name: string } | null;
}

interface SessionRow {
  id: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  soldCount: number;
  status: string;
  ordersCount: number;
  grossCents: number;
}

type TabKey = "sessions" | "earnings" | "details";

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "badge badge-success",
  DRAFT: "badge badge-warning",
  ARCHIVED: "badge badge-neutral",
  SCHEDULED: "badge badge-info",
  COMPLETED: "badge badge-success",
  CANCELLED: "badge badge-neutral",
};

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US");
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function PartnerSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Default to Sessions tab — partners pick a session to send invites / capture sales.
  const [tab, setTab] = useState<TabKey>("sessions");

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/partner/series/${id}`).then((r) => r.json()),
      fetch(`/api/v1/partner/series/${id}/sessions`).then((r) => r.json()),
    ])
      .then(([d, s]) => {
        if (d.error) { setError(d.error); return; }
        setDetail(d.series);
        setSessions(s.sessions ?? []);
      })
      .catch(() => setError("Failed to load"));
  }, [id]);

  // Honor ?tab=earnings deep-link from partner dashboard CTAs
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q === "earnings" || q === "details" || q === "sessions") setTab(q);
  }, []);

  if (error) {
    return (
      <div className="dashboard-canvas">
        <div className="dashboard-body">
          <EmptyStateCard icon="!" title={error} />
        </div>
      </div>
    );
  }

  if (!detail || !sessions) {
    return (
      <div className="dashboard-canvas">
        <div className="dashboard-body">
          <div className="skeleton" style={{ height: 120, marginBottom: 24 }} />
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  const totalSold = sessions.reduce((a, s) => a + s.soldCount, 0);
  const totalGross = sessions.reduce((a, s) => a + s.grossCents, 0);
  const sharePct = detail.partnerShareBps != null ? (detail.partnerShareBps / 100).toFixed(2) + "%" : "—";
  const estimatedShareCents = detail.partnerShareBps != null ? Math.round((totalGross * detail.partnerShareBps) / 10000) : 0;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "sessions", label: "Sessions & Invites" },
    { key: "earnings", label: "Earnings" },
    { key: "details", label: "Details" },
  ];

  return (
    <div className="dashboard-canvas">
      {/* Header band */}
      <div style={{ background: "var(--layer-2)", borderBottom: "1px solid var(--color-border)", padding: "36px 0 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <div className="dash-eyebrow">
            <Link href="/partner/dashboard" style={{ color: "inherit", textDecoration: "none" }}>‹ Partner Dashboard</Link>
          </div>
          <h1 className="page-header" style={{ marginBottom: 6 }}>{detail.title}</h1>
          {detail.subtitle && (
            <p style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>{detail.subtitle}</p>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className={STATUS_BADGE[detail.status] || "badge badge-neutral"}>{detail.status}</span>
            {detail.venue && <span className="badge badge-neutral">{detail.venue}</span>}
            {(detail.city || detail.country) && (
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                {[detail.city, detail.country].filter(Boolean).join(", ")}
              </span>
            )}
          </div>

          {/* Tab strip — sticks to header band */}
          <div style={{ display: "flex", gap: 4, marginTop: 28, borderBottom: "1px solid var(--color-border)", marginBottom: -1 }}>
            {tabs.map((tt) => (
              <button
                key={tt.key}
                onClick={() => setTab(tt.key)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: tab === tt.key ? "2px solid var(--color-primary)" : "2px solid transparent",
                  color: tab === tt.key ? "var(--color-text)" : "var(--color-text-secondary)",
                  padding: "12px 18px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: -1,
                }}
              >
                {tt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-body">
        {/* ── TAB: Sessions & Invites (DEFAULT) ─────────────────────── */}
        {tab === "sessions" && (
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Sessions</div>
                <div className="panel-subtitle">Open a session to send invites, manage attendees, and view co-host earnings</div>
              </div>
            </div>
            {sessions.length === 0 ? (
              <EmptyStateCard icon="◇" title="No sessions yet" compact />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sessions.map((s) => {
                  const base = `/partner/series/${id}/sessions/${s.id}`;
                  return (
                    <div key={s.id} className="data-row" style={{ alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="data-row-primary">{s.title || "Untitled session"}</div>
                        <div className="data-row-meta">
                          {fmtDate(s.startsAt)} · {s.soldCount}/{s.capacity} sold · {fmt(s.grossCents)} gross
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Link
                          href={base}
                          className="btn btn-primary"
                          style={{ textDecoration: "none", fontSize: 12, padding: "7px 12px" }}
                        >
                          Open invite tools →
                        </Link>
                        <Link
                          href={`${base}?tab=attendees`}
                          className="btn btn-secondary"
                          style={{ textDecoration: "none", fontSize: 12, padding: "7px 12px" }}
                        >
                          Manage attendees
                        </Link>
                        <Link
                          href={`${base}?tab=earnings`}
                          className="btn btn-secondary"
                          style={{ textDecoration: "none", fontSize: 12, padding: "7px 12px" }}
                        >
                          View earnings
                        </Link>
                        <span className={STATUS_BADGE[s.status] || "badge badge-neutral"}>{s.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Earnings (KPIs live here, not above) ─────────────── */}
        {tab === "earnings" && (
          <>
            <div className="kpi-grid" style={{ marginBottom: 24 }}>
              <KPIStatCard label="Sessions" value={sessions.length} icon="◇" accent="var(--color-info)" />
              <KPIStatCard label="Tickets Sold" value={totalSold} icon="⬟" accent="var(--color-warning)" />
              <KPIStatCard label="Gross Revenue" value={fmt(totalGross)} icon="⬡" accent="var(--color-success)" />
              <KPIStatCard label="Your Share" value={sharePct} icon="◈" accent="var(--color-primary)" />
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Earnings by Session</div>
                  <div className="panel-subtitle">
                    {detail.partnerShareBps != null
                      ? `Estimated partner share: ${fmt(estimatedShareCents)} (${sharePct} of gross)`
                      : "Partner share not configured — contact your account manager"}
                  </div>
                </div>
              </div>

              {sessions.length === 0 ? (
                <EmptyStateCard icon="⬡" title="No earnings data yet" compact />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sessions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/partner/series/${id}/sessions/${s.id}?tab=earnings`}
                      className="data-row"
                      style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="data-row-primary">{s.title || "Untitled session"}</div>
                        <div className="data-row-meta">{fmtDate(s.startsAt)} · {s.ordersCount} orders</div>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 100 }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, color: "var(--color-text)" }}>
                          {fmt(s.grossCents)}
                        </div>
                        <div className="kpi-label" style={{ marginBottom: 0 }}>gross</div>
                      </div>
                      <span style={{ color: "var(--color-text-secondary)", fontSize: 18, marginLeft: 10 }}>›</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAB: Details (read-only metadata) ─────────────────────── */}
        {tab === "details" && (
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Event Details</div>
                <div className="panel-subtitle">Read-only — contact your account manager to make changes</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              <Field label="Slug" value={detail.slug} />
              <Field label="Starts" value={fmtDate(detail.startsAt)} />
              <Field label="Ends" value={fmtDate(detail.endsAt)} />
              <Field label="Capacity" value={`${detail.capacitySold} / ${detail.capacityTotal} sold`} />
              <Field label="Address" value={detail.venueAddress || "—"} />
              <Field label="Partner share" value={detail.partnerShareBps != null ? sharePct : "Not configured"} />
            </div>
            {detail.description && (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
                <div className="kpi-label" style={{ marginBottom: 8 }}>Description</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-text)" }}>{detail.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="kpi-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: "var(--color-text)" }}>{value}</div>
    </div>
  );
}
