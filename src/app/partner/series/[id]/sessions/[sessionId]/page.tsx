"use client";

import Link from "next/link";
import { use, useEffect, useState, useCallback } from "react";
import { EmptyStateCard, KPIStatCard } from "@/components/ui/dashboard";

type TabKey = "details" | "attendees" | "invite" | "hosts" | "earnings";

interface SeriesAccess {
  isSeriesPartner: boolean;
  isSeriesDelegate?: boolean;
  coHostSessionIds: string[];
  delegateSessionIds?: string[];
}

interface SeriesDetail {
  id: string;
  title: string;
  status: string;
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

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US");
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function PartnerSessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = use(params);
  // Default to invite-first per commission-earner action priority.
  const [tab, setTab] = useState<TabKey>("invite");

  // Honor ?tab= deep links from the partner series page CTAs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q === "invite" || q === "attendees" || q === "hosts" || q === "earnings" || q === "details") {
      setTab(q as TabKey);
    }
  }, []);
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [access, setAccess] = useState<SeriesAccess | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/partner/series/${id}`).then((r) => r.json()),
      fetch(`/api/v1/partner/series/${id}/sessions`).then((r) => r.json()),
    ])
      .then(([d, s]) => {
        if (d.error) { setError(d.error); return; }
        const access: SeriesAccess = d.access;
        const allowed = new Set([
          ...access.coHostSessionIds,
          ...(access.delegateSessionIds ?? []),
        ]);
        const fullAccess = access.isSeriesPartner || access.isSeriesDelegate;
        if (!fullAccess && !allowed.has(sessionId)) {
          setError("You do not have access to this session.");
          return;
        }
        setSeries(d.series);
        setAccess(access);
        const found = (s.sessions ?? []).find((x: SessionRow) => x.id === sessionId);
        setSession(found ?? null);
      })
      .catch(() => setError("Failed to load"));
  }, [id, sessionId]);

  if (error) {
    return (
      <div className="dashboard-canvas">
        <div className="dashboard-body"><EmptyStateCard icon="!" title={error} /></div>
      </div>
    );
  }

  if (!series || !access) {
    return (
      <div className="dashboard-canvas">
        <div className="dashboard-body">
          <div className="skeleton" style={{ height: 80, marginBottom: 24 }} />
          <div className="skeleton" style={{ height: 280 }} />
        </div>
      </div>
    );
  }

  // Tabs ordered for action-first workflow: invite/sell first, details last.
  const tabs: { key: TabKey; label: string }[] = [
    { key: "invite", label: "Invites" },
    { key: "attendees", label: "Attendees" },
    { key: "earnings", label: "Sales & Earnings" },
    { key: "details", label: "Details" },
  ];
  if (access.isSeriesPartner) tabs.splice(2, 0, { key: "hosts", label: "Team / Seller Seats" });

  return (
    <div className="dashboard-canvas">
      <div style={{ background: "var(--layer-2)", borderBottom: "1px solid var(--color-border)", padding: "32px 0 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <div className="dash-eyebrow">
            <Link href={`/partner/series/${id}`} style={{ color: "inherit", textDecoration: "none" }}>
              ‹ {series.title}
            </Link>
          </div>
          <h1 className="page-header" style={{ marginBottom: 6 }}>
            {session?.title || "Session"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
            {session ? fmtDate(session.startsAt) + " · " + session.soldCount + "/" + session.capacity + " sold" : ""}
          </p>
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--color-border)" }}>
            {tabs.map((tt) => (
              <button
                key={tt.key}
                onClick={() => setTab(tt.key)}
                style={{
                  padding: "12px 18px",
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === tt.key ? "2px solid var(--color-primary)" : "2px solid transparent",
                  color: tab === tt.key ? "var(--color-text)" : "var(--color-text-secondary)",
                  fontWeight: tab === tt.key ? 500 : 400,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {tt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-body">
        {tab === "details" && session && <DetailsTab session={session} series={series} />}
        {tab === "attendees" && <AttendeesTab seriesId={id} sessionId={sessionId} />}
        {tab === "invite" && <InviteTab seriesId={id} />}
        {tab === "hosts" && access.isSeriesPartner && <DelegatesTab seriesId={id} sessionId={sessionId} />}
        {tab === "earnings" && <EarningsTab seriesId={id} sessionId={sessionId} />}
      </div>
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

function DetailsTab({ session, series }: { session: SessionRow; series: SeriesDetail }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Session Details</div>
          <div className="panel-subtitle">Read-only — managed by series admin</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Field label="Title" value={session.title || "—"} />
        <Field label="Status" value={session.status} />
        <Field label="Starts" value={fmtDate(session.startsAt)} />
        <Field label="Ends" value={fmtDate(session.endsAt)} />
        <Field label="Capacity" value={`${session.soldCount} / ${session.capacity}`} />
        <Field label="Orders" value={String(session.ordersCount)} />
        <Field label="Gross" value={fmt(session.grossCents)} />
        <Field label="Partner share" value={series.partnerShareBps != null ? (series.partnerShareBps / 100).toFixed(2) + "%" : "Not configured"} />
      </div>
    </div>
  );
}

function AttendeesTab({ seriesId, sessionId }: { seriesId: string; sessionId: string }) {
  const [tickets, setTickets] = useState<any[] | null>(null);
  useEffect(() => {
    fetch(`/api/v1/partner/series/${seriesId}/attendees?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets ?? []));
  }, [seriesId, sessionId]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Attendees</div>
          <div className="panel-subtitle">All paid tickets for this session</div>
        </div>
        <a
          href={`/api/v1/partner/series/${seriesId}/attendees/export?sessionId=${sessionId}`}
          className="btn btn-secondary"
          style={{ textDecoration: "none" }}
        >
          Export CSV
        </a>
      </div>
      {!tickets ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : tickets.length === 0 ? (
        <EmptyStateCard icon="◐" title="No attendees yet" compact />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left", color: "var(--color-text-secondary)" }}>
                <th style={{ padding: "10px 8px" }}>Code</th>
                <th style={{ padding: "10px 8px" }}>Attendee</th>
                <th style={{ padding: "10px 8px" }}>Email</th>
                <th style={{ padding: "10px 8px" }}>Type</th>
                <th style={{ padding: "10px 8px" }}>Status</th>
                <th style={{ padding: "10px 8px" }}>Checked In</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "10px 8px", fontFamily: "monospace", fontSize: 12 }}>{t.code}</td>
                  <td style={{ padding: "10px 8px" }}>{t.attendeeName ?? t.user?.name ?? "—"}</td>
                  <td style={{ padding: "10px 8px" }}>{t.attendeeEmail ?? t.user?.email ?? "—"}</td>
                  <td style={{ padding: "10px 8px" }}>{t.ticketType?.name ?? "—"}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span className={t.ticketStatus === "CHECKED_IN" ? "badge badge-success" : "badge badge-neutral"}>
                      {t.ticketStatus}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{t.checkedInAt ? fmtDate(t.checkedInAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InviteTab({ seriesId }: { seriesId: string }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [comp, setComp] = useState(false);
  const [ticketTypeId, setTicketTypeId] = useState<string>("");
  const [ticketTypes, setTicketTypes] = useState<{ id: string; name: string }[] | null>(null);
  const [invitations, setInvitations] = useState<any[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(() => {
    fetch(`/api/v1/partner/series/${seriesId}/invite`)
      .then((r) => r.json())
      .then((d) => setInvitations(d.invitations ?? []));
  }, [seriesId]);

  useEffect(() => {
    refresh();
    fetch(`/api/v1/partner/series/${seriesId}/ticket-types`)
      .then((r) => (r.ok ? r.json() : { ticketTypes: [] }))
      .then((d) => setTicketTypes(d.ticketTypes ?? []))
      .catch(() => setTicketTypes([]));
  }, [seriesId, refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const fn = firstName.trim();
      const ln = lastName.trim();
      if (!fn || !ln) {
        setMsg({ kind: "err", text: "First and last name are required." });
        setSubmitting(false);
        return;
      }
      const res = await fetch(`/api/v1/partner/series/${seriesId}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientEmail: email,
          recipientName: `${fn} ${ln}`,
          isCompInvite: comp,
          intendedTicketTypeId: ticketTypeId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error ?? "Failed to send" });
      } else {
        setMsg({ kind: "ok", text: "Invitation sent." });
        setEmail(""); setFirstName(""); setLastName(""); setComp(false); setTicketTypeId("");
        refresh();
      }
    } catch {
      setMsg({ kind: "err", text: "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Invite a Guest</div>
            <div className="panel-subtitle">Send a single-guest invitation by email</div>
          </div>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gap: 14, maxWidth: 540 }}>
          <label style={{ display: "block" }}>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Email *</div>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="form-input" style={{ width: "100%" }}
              placeholder="guest@example.com"
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <div className="kpi-label" style={{ marginBottom: 6 }}>First name *</div>
              <input
                type="text" required value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="form-input" style={{ width: "100%" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <div className="kpi-label" style={{ marginBottom: 6 }}>Last name *</div>
              <input
                type="text" required value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="form-input" style={{ width: "100%" }}
              />
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} />
            <span style={{ fontSize: 14 }}>Comp ticket (no payment required on RSVP)</span>
          </label>
          {ticketTypes && ticketTypes.length > 0 && (
            <label style={{ display: "block" }}>
              <div className="kpi-label" style={{ marginBottom: 6 }}>Intended ticket type (optional)</div>
              <select
                value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)}
                className="form-input" style={{ width: "100%" }}
              >
                <option value="">— Any —</option>
                {ticketTypes.map((tt) => (
                  <option key={tt.id} value={tt.id}>{tt.name}</option>
                ))}
              </select>
            </label>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "Sending…" : "Send Invitation"}
            </button>
            {msg && (
              <span style={{ fontSize: 13, color: msg.kind === "ok" ? "var(--color-success)" : "var(--color-danger)" }}>
                {msg.text}
              </span>
            )}
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Recent Invitations</div>
            <div className="panel-subtitle">Single-guest invitations sent for this series</div>
          </div>
        </div>
        {!invitations ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : invitations.length === 0 ? (
          <EmptyStateCard icon="◇" title="No invitations sent yet" compact />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left", color: "var(--color-text-secondary)" }}>
                  <th style={{ padding: "10px 8px" }}>Email</th>
                  <th style={{ padding: "10px 8px" }}>Name</th>
                  <th style={{ padding: "10px 8px" }}>Type</th>
                  <th style={{ padding: "10px 8px" }}>Status</th>
                  <th style={{ padding: "10px 8px" }}>Sent</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((iv) => (
                  <tr key={iv.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "10px 8px" }}>{iv.recipientEmail}</td>
                    <td style={{ padding: "10px 8px" }}>{iv.recipientName ?? "—"}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {iv.isCompInvite ? <span className="badge badge-info">Comp</span> : <span className="badge badge-neutral">Purchase</span>}
                      {iv.intendedTicketType && <span style={{ marginLeft: 6, fontSize: 12 }}>· {iv.intendedTicketType.name}</span>}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span className="badge badge-neutral">{iv.status}</span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>{fmtDate(iv.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

type SalesMode =
  | "PARTNER_FLAT_PER_ORDER"
  | "PARTNER_PER_SEAT"
  | "PARTNER_PERCENT_OF_TICKET"
  | "PARTNER_FLAT_PLUS_PER_SEAT"
  | "PARTNER_FLAT_PLUS_PERCENT";

function DelegatesTab({ seriesId, sessionId }: { seriesId: string; sessionId: string }) {
  const [seats, setSeats] = useState<any[] | null>(null);
  const [teamSummary, setTeamSummary] = useState<any | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleCode, setRoleCode] = useState<"SERIES_CO_LEAD" | "SESSION_CO_LEAD" | "GUEST_LIST_LEAD">("SESSION_CO_LEAD");
  const [scopeKind, setScopeKind] = useState<"series" | "session">("session");

  // Sales capability block
  const [salesEnabled, setSalesEnabled] = useState(false);
  const [salesMode, setSalesMode] = useState<SalesMode>("PARTNER_PERCENT_OF_TICKET");
  const [flatDollars, setFlatDollars] = useState("");
  const [perSeatDollars, setPerSeatDollars] = useState("");
  const [percentValue, setPercentValue] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(() => {
    fetch(`/api/v1/partner/series/${seriesId}/delegate-seats`)
      .then((r) => r.json())
      .then((d) => setSeats(d.seats ?? []));
    fetch(`/api/v1/partner/series/${seriesId}/team/summary`)
      .then((r) => r.json())
      .then((d) => setTeamSummary(d ?? null))
      .catch(() => {});
  }, [seriesId]);
  useEffect(() => { refresh(); }, [refresh]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      // Sales-enabled requires series scope
      if (salesEnabled && scopeKind !== "series") {
        setMsg({ kind: "err", text: "Sales-enabled seats must be scoped to the entire series." });
        setSubmitting(false);
        return;
      }
      const fn = firstName.trim();
      const ln = lastName.trim();
      if (!fn || !ln) {
        setMsg({ kind: "err", text: "First and last name are required." });
        setSubmitting(false);
        return;
      }
      const sales = salesEnabled
        ? {
            isReferrerEnabled: true,
            commissionMode: salesMode,
            flatAmountCents: ["PARTNER_FLAT_PER_ORDER", "PARTNER_FLAT_PLUS_PER_SEAT", "PARTNER_FLAT_PLUS_PERCENT"].includes(salesMode)
              ? Math.round(parseFloat(flatDollars || "0") * 100) || 0
              : null,
            perSeatAmountCents: ["PARTNER_PER_SEAT", "PARTNER_FLAT_PLUS_PER_SEAT"].includes(salesMode)
              ? Math.round(parseFloat(perSeatDollars || "0") * 100) || 0
              : null,
            percentageBps: ["PARTNER_PERCENT_OF_TICKET", "PARTNER_FLAT_PLUS_PERCENT"].includes(salesMode)
              ? Math.round(parseFloat(percentValue || "0") * 100) || 0
              : null,
          }
        : { isReferrerEnabled: false, commissionMode: "NONE" as const };
      const body = {
        invitedEmail: email,
        invitedName: `${fn} ${ln}`,
        roleCode,
        scope: scopeKind === "series" ? { kind: "series" } : { kind: "session", sessionId },
        sales,
      };
      const res = await fetch(`/api/v1/partner/series/${seriesId}/delegate-seats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error ?? "Failed" });
      } else {
        setMsg({
          kind: "ok",
          text: data.emailSent
            ? "Invitation sent."
            : `Invitation created. Email failed (${data.emailError ?? "unknown"}). Share link manually: ${data.previewLink}`,
        });
        setEmail(""); setFirstName(""); setLastName("");
        setSalesEnabled(false);
        setFlatDollars(""); setPerSeatDollars(""); setPercentValue("");
        refresh();
      }
    } catch {
      setMsg({ kind: "err", text: "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function resendSeat(seatId: string) {
    const res = await fetch(`/api/v1/partner/series/${seriesId}/delegate-seats/${seatId}/resend`, { method: "POST" });
    if (res.ok) {
      setMsg({ kind: "ok", text: "Invitation resent." });
      refresh();
    }
  }
  async function revokeSeatAction(seatId: string) {
    if (!confirm("Revoke this invitation? The collaborator will lose access if they had accepted.")) return;
    const res = await fetch(`/api/v1/partner/series/${seriesId}/delegate-seats/${seatId}/revoke`, { method: "POST" });
    if (res.ok) refresh();
  }
  async function removeSeatAction(seatId: string) {
    if (!confirm("Remove this co-lead's access?")) return;
    const res = await fetch(`/api/v1/partner/series/${seriesId}/delegate-seats/${seatId}`, { method: "DELETE" });
    if (res.ok) refresh();
  }

  const pending = (seats ?? []).filter((s) => s.status === "INVITED");
  const active = (seats ?? []).filter((s) => s.status === "ACTIVE");
  const closed = (seats ?? []).filter((s) => s.status === "EXPIRED" || s.status === "REVOKED" || s.status === "REMOVED");

  const ROLES: { code: typeof roleCode; label: string; desc: string }[] = [
    { code: "SERIES_CO_LEAD", label: "Series Co-Lead", desc: "Full operational lead across every session in the series." },
    { code: "SESSION_CO_LEAD", label: "Session Co-Lead", desc: "Operational lead for a single session." },
    { code: "GUEST_LIST_LEAD", label: "Guest List Lead", desc: "Manages invites and check-in only." },
  ];

  return (
    <>
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Invite a Co-Lead</div>
            <div className="panel-subtitle">
              Send a secure email invitation. The collaborator does not need an existing account — they can sign up when they accept.
            </div>
          </div>
        </div>
        <form onSubmit={add} style={{ display: "grid", gap: 14, maxWidth: 600 }}>
          <label>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Email *</div>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="form-input" style={{ width: "100%" }} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <div className="kpi-label" style={{ marginBottom: 6 }}>First name *</div>
              <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="form-input" style={{ width: "100%" }} />
            </label>
            <label>
              <div className="kpi-label" style={{ marginBottom: 6 }}>Last name *</div>
              <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="form-input" style={{ width: "100%" }} />
            </label>
          </div>
          <label>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Scope</div>
            <select value={scopeKind} onChange={(e) => setScopeKind(e.target.value as "series" | "session")} className="form-input" style={{ width: "100%" }}>
              <option value="session">This session only</option>
              <option value="series">Entire series</option>
            </select>
          </label>
          <label>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Role</div>
            <select value={roleCode} onChange={(e) => setRoleCode(e.target.value as typeof roleCode)} className="form-input" style={{ width: "100%" }}>
              {ROLES.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6 }}>
              {ROLES.find((r) => r.code === roleCode)?.desc}
            </div>
          </label>
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 14 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={salesEnabled}
                onChange={(e) => {
                  setSalesEnabled(e.target.checked);
                  if (e.target.checked) setScopeKind("series");
                }}
                style={{ marginTop: 4 }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Sells &amp; earns commission</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                  This person gets a personal QR &amp; referral link. You set the model — you pay them directly. Platform tracks; it does not pay.
                </div>
              </div>
            </label>
            {salesEnabled && (
              <div style={{ display: "grid", gap: 10, marginTop: 12, paddingLeft: 26 }}>
                <label>
                  <div className="kpi-label" style={{ marginBottom: 6 }}>Commission model</div>
                  <select value={salesMode} onChange={(e) => setSalesMode(e.target.value as SalesMode)} className="form-input" style={{ width: "100%" }}>
                    <option value="PARTNER_PERCENT_OF_TICKET">% of ticket subtotal</option>
                    <option value="PARTNER_FLAT_PER_ORDER">Flat $ per attributed order</option>
                    <option value="PARTNER_PER_SEAT">Flat $ per seat sold</option>
                    <option value="PARTNER_FLAT_PLUS_PER_SEAT">Flat per order + $ per seat</option>
                    <option value="PARTNER_FLAT_PLUS_PERCENT">Flat per order + % of ticket</option>
                  </select>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {["PARTNER_FLAT_PER_ORDER", "PARTNER_FLAT_PLUS_PER_SEAT", "PARTNER_FLAT_PLUS_PERCENT"].includes(salesMode) && (
                    <label>
                      <div className="kpi-label" style={{ marginBottom: 6 }}>Flat $ / order</div>
                      <input type="number" min="0" step="0.01" value={flatDollars} onChange={(e) => setFlatDollars(e.target.value)} className="form-input" style={{ width: "100%" }} placeholder="25.00" />
                    </label>
                  )}
                  {["PARTNER_PER_SEAT", "PARTNER_FLAT_PLUS_PER_SEAT"].includes(salesMode) && (
                    <label>
                      <div className="kpi-label" style={{ marginBottom: 6 }}>$ / seat</div>
                      <input type="number" min="0" step="0.01" value={perSeatDollars} onChange={(e) => setPerSeatDollars(e.target.value)} className="form-input" style={{ width: "100%" }} placeholder="10.00" />
                    </label>
                  )}
                  {["PARTNER_PERCENT_OF_TICKET", "PARTNER_FLAT_PLUS_PERCENT"].includes(salesMode) && (
                    <label>
                      <div className="kpi-label" style={{ marginBottom: 6 }}>% of ticket</div>
                      <input type="number" min="0" max="100" step="0.1" value={percentValue} onChange={(e) => setPercentValue(e.target.value)} className="form-input" style={{ width: "100%" }} placeholder="10" />
                    </label>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                  Sales-enabled seats are scoped to the entire series.
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "Sending…" : "Send invitation"}
            </button>
            {msg && (
              <span style={{ fontSize: 13, color: msg.kind === "ok" ? "var(--color-success)" : "var(--color-danger)" }}>
                {msg.text}
              </span>
            )}
          </div>
        </form>
      </div>

      {teamSummary?.perSeat && teamSummary.perSeat.length > 0 && (
        <div className="panel" style={{ marginBottom: 16, background: "var(--color-warning-bg)", borderColor: "var(--color-warning)" }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">Sales Team Performance</div>
              <div className="panel-subtitle">
                Commissions are paid directly by the partner. The platform tracks for reporting only.
              </div>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left", color: "var(--color-text-secondary)" }}>
                  <th style={{ padding: "8px 6px" }}>Seller</th>
                  <th style={{ padding: "8px 6px" }}>Model</th>
                  <th style={{ padding: "8px 6px" }}>Ref Code</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Tickets</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Gross sales</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Owed</th>
                </tr>
              </thead>
              <tbody>
                {teamSummary.perSeat.map((s: any) => (
                  <tr key={s.seatId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px 6px" }}>{s.name}</td>
                    <td style={{ padding: "8px 6px", fontSize: 11 }}>{s.commissionMode.replace("PARTNER_", "").replace(/_/g, " ").toLowerCase()}</td>
                    <td style={{ padding: "8px 6px", fontFamily: "monospace", fontSize: 11 }}>{s.referralCode ?? "—"}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right" }}>{s.ticketsSold}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmt(s.grossSalesCents)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>{fmt(s.owedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SeatList title="Pending Invitations" seats={pending} actions={(s) => (
        <>
          <button onClick={() => resendSeat(s.id)} className="btn btn-ghost btn-sm">Resend</button>
          <button onClick={() => revokeSeatAction(s.id)} className="btn btn-ghost btn-sm">Revoke</button>
        </>
      )} emptyText="No pending invitations" />

      <SeatList title="Active Co-Leads" seats={active} actions={(s) => (
        <button onClick={() => removeSeatAction(s.id)} className="btn btn-ghost btn-sm">Remove access</button>
      )} emptyText="No active co-leads yet" extra={(s) => (
        s.isReferrerEnabled ? (
          <SeatCommissionEditor seriesId={seriesId} seat={s} onSaved={refresh} />
        ) : null
      )} />

      {closed.length > 0 && (
        <SeatList title="Past / Revoked" seats={closed} actions={() => null} emptyText="" />
      )}
    </>
  );
}

function SeatCommissionEditor({
  seriesId,
  seat,
  onSaved,
}: {
  seriesId: string;
  seat: any;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SalesMode>(seat.commissionMode as SalesMode);
  const [flatDollars, setFlatDollars] = useState(
    seat.flatAmountCents != null ? (seat.flatAmountCents / 100).toString() : ""
  );
  const [perSeatDollars, setPerSeatDollars] = useState(
    seat.perSeatAmountCents != null ? (seat.perSeatAmountCents / 100).toString() : ""
  );
  const [percentValue, setPercentValue] = useState(
    seat.percentageBps != null ? (seat.percentageBps / 100).toString() : ""
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const body = {
        commissionMode: mode,
        flatAmountCents: ["PARTNER_FLAT_PER_ORDER", "PARTNER_FLAT_PLUS_PER_SEAT", "PARTNER_FLAT_PLUS_PERCENT"].includes(mode)
          ? Math.round(parseFloat(flatDollars || "0") * 100) || 0
          : null,
        perSeatAmountCents: ["PARTNER_PER_SEAT", "PARTNER_FLAT_PLUS_PER_SEAT"].includes(mode)
          ? Math.round(parseFloat(perSeatDollars || "0") * 100) || 0
          : null,
        percentageBps: ["PARTNER_PERCENT_OF_TICKET", "PARTNER_FLAT_PLUS_PERCENT"].includes(mode)
          ? Math.round(parseFloat(percentValue || "0") * 100) || 0
          : null,
      };
      const res = await fetch(
        `/api/v1/partner/series/${seriesId}/delegate-seats/${seat.id}/commission`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed");
      } else {
        setOpen(false);
        onSaved();
      }
    } catch {
      setErr("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-ghost btn-sm">
        Edit rate
      </button>
    );
  }

  return (
    <form
      onSubmit={save}
      style={{
        marginTop: 10,
        padding: 12,
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        display: "grid",
        gap: 10,
        background: "var(--color-bg)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
        Editing rate for <strong>{seat.invitedName || seat.acceptedBy?.name || seat.invitedEmail}</strong>. Past commissions keep their original rate.
      </div>
      <label>
        <div className="kpi-label" style={{ marginBottom: 6 }}>Commission model</div>
        <select value={mode} onChange={(e) => setMode(e.target.value as SalesMode)} className="form-input" style={{ width: "100%" }}>
          <option value="PARTNER_PERCENT_OF_TICKET">% of ticket subtotal</option>
          <option value="PARTNER_FLAT_PER_ORDER">Flat $ per attributed order</option>
          <option value="PARTNER_PER_SEAT">Flat $ per seat sold</option>
          <option value="PARTNER_FLAT_PLUS_PER_SEAT">Flat per order + $ per seat</option>
          <option value="PARTNER_FLAT_PLUS_PERCENT">Flat per order + % of ticket</option>
        </select>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {["PARTNER_FLAT_PER_ORDER", "PARTNER_FLAT_PLUS_PER_SEAT", "PARTNER_FLAT_PLUS_PERCENT"].includes(mode) && (
          <label>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Flat $ / order</div>
            <input type="number" min="0" step="0.01" value={flatDollars} onChange={(e) => setFlatDollars(e.target.value)} className="form-input" style={{ width: "100%" }} />
          </label>
        )}
        {["PARTNER_PER_SEAT", "PARTNER_FLAT_PLUS_PER_SEAT"].includes(mode) && (
          <label>
            <div className="kpi-label" style={{ marginBottom: 6 }}>$ / seat</div>
            <input type="number" min="0" step="0.01" value={perSeatDollars} onChange={(e) => setPerSeatDollars(e.target.value)} className="form-input" style={{ width: "100%" }} />
          </label>
        )}
        {["PARTNER_PERCENT_OF_TICKET", "PARTNER_FLAT_PLUS_PERCENT"].includes(mode) && (
          <label>
            <div className="kpi-label" style={{ marginBottom: 6 }}>% of ticket</div>
            <input type="number" min="0" max="100" step="0.1" value={percentValue} onChange={(e) => setPercentValue(e.target.value)} className="form-input" style={{ width: "100%" }} />
          </label>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
          Cancel
        </button>
        {err && <span style={{ fontSize: 12, color: "var(--color-danger)" }}>{err}</span>}
      </div>
    </form>
  );
}

function SeatList({
  title,
  seats,
  actions,
  emptyText,
  extra,
}: {
  title: string;
  seats: any[];
  actions: (s: any) => React.ReactNode;
  emptyText: string;
  extra?: (s: any) => React.ReactNode;
}) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-header">
        <div><div className="panel-title">{title}</div></div>
      </div>
      {seats.length === 0 ? (
        emptyText ? <EmptyStateCard icon="◈" title={emptyText} compact /> : null
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {seats.map((s) => (
            <div key={s.id} className="data-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="data-row-primary">
                  {s.invitedName || s.acceptedBy?.name || s.invitedEmail}
                  <span className="badge badge-neutral" style={{ marginLeft: 8 }}>{s.roleCode.replace(/_/g, " ")}</span>
                  <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{s.sessionId ? "session" : "series"}</span>
                  {s.isReferrerEnabled && (
                    <span className="badge" style={{ marginLeft: 6, background: "#c41e3a", color: "#fff" }}>sells</span>
                  )}
                </div>
                <div className="data-row-meta">
                  {s.invitedEmail}
                  {s.session?.title ? ` · ${s.session.title}` : ""}
                  {s.lastInvitedAt ? ` · last sent ${fmtDate(s.lastInvitedAt)}` : ""}
                  {s.acceptedAt ? ` · accepted ${fmtDate(s.acceptedAt)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {actions(s)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EarningsTab({ seriesId, sessionId }: { seriesId: string; sessionId: string }) {
  const [data, setData] = useState<any | null>(null);
  const [scope, setScope] = useState<"session" | "series">("session");

  useEffect(() => {
    const url = scope === "session"
      ? `/api/v1/partner/series/${seriesId}/earnings?sessionId=${sessionId}`
      : `/api/v1/partner/series/${seriesId}/earnings`;
    fetch(url).then((r) => r.json()).then(setData);
  }, [seriesId, sessionId, scope]);

  if (!data) return <div className="skeleton" style={{ height: 200 }} />;

  const sharePct = data.commissionLabel
    ?? (data.partnerShareBps != null ? (data.partnerShareBps / 100).toFixed(2) + "%" : "Not configured");
  const commissionConfigured = data.commissionLabel != null || data.partnerShareBps != null;

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setScope("session")}
          className={scope === "session" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
        >This session</button>
        <button
          onClick={() => setScope("series")}
          className={scope === "series" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
        >Whole series</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPIStatCard label="Tickets sold" value={data.totals.ticketsSold} icon="⬟" accent="var(--color-warning)" />
        <KPIStatCard label="Gross revenue" value={fmt(data.totals.grossCents)} icon="⬡" accent="var(--color-success)" />
        <KPIStatCard label="Your share rate" value={sharePct} icon="◈" accent="var(--color-primary)" />
        <KPIStatCard
          label="Estimated earned"
          value={data.totals.partnerShareCents != null ? fmt(data.totals.partnerShareCents) : "—"}
          icon="◆" accent="var(--color-info)"
        />
      </div>

      {!commissionConfigured && (
        <div className="panel" style={{ marginBottom: 24, background: "var(--color-warning-bg)", borderColor: "var(--color-warning)" }}>
          <p style={{ fontSize: 13, color: "var(--color-text)" }}>
            Your revenue share is not yet configured for this series. Contact your account manager to set it up.
          </p>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">By Session</div>
            <div className="panel-subtitle">Aggregated from paid orders</div>
          </div>
        </div>
        {data.bySession.length === 0 ? (
          <EmptyStateCard icon="◇" title="No paid sales yet" compact />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left", color: "var(--color-text-secondary)" }}>
                  <th style={{ padding: "10px 8px" }}>Session</th>
                  <th style={{ padding: "10px 8px" }}>Starts</th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}>Tickets</th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}>Gross</th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}>Your share</th>
                </tr>
              </thead>
              <tbody>
                {data.bySession.map((row: any) => (
                  <tr key={row.sessionId ?? "_"} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "10px 8px" }}>{row.sessionTitle ?? "—"}</td>
                    <td style={{ padding: "10px 8px" }}>{fmtDate(row.sessionStartsAt)}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right" }}>{row.ticketsSold}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right" }}>{fmt(row.grossCents)}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right" }}>
                      {row.partnerShareCents != null ? fmt(row.partnerShareCents) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
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
