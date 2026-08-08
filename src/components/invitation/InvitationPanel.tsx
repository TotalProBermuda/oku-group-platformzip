"use client";

import { useState, useEffect } from "react";
import InvitationComposer from "./InvitationComposer";

interface Metrics {
  sent: number;
  opened: number;
  declined: number;
  rsvpStarted: number;
  rsvpConfirmed: number;
  registered: number;
  ticketed: number;
  checkedIn: number;
}

interface Registrant {
  id: string;
  registrationStatus: string;
  sourceType: string;
  user: { id: string; name: string | null; email: string; membership?: { tier: string; status: string } | null };
  invitation?: { status: string; audienceSegment: string; sentAt: string } | null;
  ticket?: { code: string; ticketStatus: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  SENT: "#6b7280",
  OPENED: "#f59e0b",
  DECLINED: "#ef4444",
  RSVP_STARTED: "#3b82f6",
  RSVP_CONFIRMED: "#10b981",
  REGISTERED: "#10b981",
  TICKETED: "#8b5cf6",
  CHECKED_IN: "#1a1614",
};

export default function InvitationPanel({ seriesId }: { seriesId: string }) {
  const [tab, setTab] = useState<"send" | "metrics" | "registrants">("send");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [registrantsLoading, setRegistrantsLoading] = useState(false);

  useEffect(() => {
    if (tab === "metrics") loadMetrics();
    if (tab === "registrants") loadRegistrants();
  }, [tab]);

  async function loadMetrics() {
    setMetricsLoading(true);
    const data = await fetch(`/api/v1/events/${seriesId}/invitations/metrics`).then((r) => r.json());
    setMetrics(data);
    setMetricsLoading(false);
  }

  async function loadRegistrants() {
    setRegistrantsLoading(true);
    const data = await fetch(`/api/v1/events/${seriesId}/registrants`).then((r) => r.json());
    setRegistrants(Array.isArray(data) ? data : []);
    setRegistrantsLoading(false);
  }

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    background: tab === t ? "#1a1614" : "transparent",
    color: tab === t ? "#fff" : "#7c7168",
    border: "1px solid " + (tab === t ? "#1a1614" : "#e8e3db"),
    borderRadius: 6,
    cursor: "pointer",
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #e8e3db", borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1614" }}>Invitation Engine</h3>
          <p style={{ margin: "2px 0 0", color: "#7c7168", fontSize: 13 }}>Premium email composer · Segmented sends · RSVP tracking</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={tabStyle("send")} onClick={() => setTab("send")}>Compose &amp; Send</button>
          <button style={tabStyle("metrics")} onClick={() => setTab("metrics")}>Analytics</button>
          <button style={tabStyle("registrants")} onClick={() => setTab("registrants")}>Registrants</button>
        </div>
      </div>

      {/* Compose & Send Tab — full builder */}
      {tab === "send" && (
        <InvitationComposer
          seriesId={seriesId}
          onSent={() => { /* metrics refresh handled on tab switch */ }}
        />
      )}

      {/* Metrics Tab */}
      {tab === "metrics" && (
        <div style={{ padding: 24 }}>
          {metricsLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Loading…</div>
          ) : metrics ? (
            <>
              {/* Funnel bar */}
              <div style={{ marginBottom: 24 }}>
                <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#7c7168", textTransform: "uppercase", letterSpacing: "0.1em" }}>Invitation Funnel</p>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
                  {[
                    { label: "Sent", v: metrics.sent },
                    { label: "Opened", v: metrics.opened },
                    { label: "RSVP", v: metrics.rsvpConfirmed },
                    { label: "Registered", v: metrics.registered },
                    { label: "Ticketed", v: metrics.ticketed },
                    { label: "Checked In", v: metrics.checkedIn },
                  ].map((bar, i) => {
                    const pct = metrics.sent > 0 ? Math.max(4, (bar.v / metrics.sent) * 100) : 4;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>{bar.v}</span>
                        <div style={{ width: "100%", height: `${pct}%`, background: "#c41e3a", borderRadius: "4px 4px 0 0", minHeight: 4, opacity: 0.3 + (i === 0 ? 0.7 : (bar.v / Math.max(metrics.sent, 1)) * 0.7) }} />
                        <span style={{ fontSize: 9, color: "#9ca3af", textAlign: "center" }}>{bar.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { label: "Sent", value: metrics.sent, color: "#6b7280" },
                  { label: "Opened", value: metrics.opened, color: "#f59e0b" },
                  { label: "Declined", value: metrics.declined, color: "#ef4444" },
                  { label: "RSVP Started", value: metrics.rsvpStarted, color: "#3b82f6" },
                  { label: "RSVP Confirmed", value: metrics.rsvpConfirmed, color: "#10b981" },
                  { label: "Registered", value: metrics.registered, color: "#10b981" },
                  { label: "Ticketed", value: metrics.ticketed, color: "#8b5cf6" },
                  { label: "Checked In", value: metrics.checkedIn, color: "#1a1614" },
                ].map((stat) => (
                  <div key={stat.label} style={{ background: "#f9f7f4", borderRadius: 8, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 11, color: "#7c7168", marginTop: 4 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: "#9ca3af", textAlign: "center" }}>No invitation data yet.</p>
          )}
        </div>
      )}

      {/* Registrants Tab */}
      {tab === "registrants" && (
        <div style={{ padding: 24 }}>
          {registrantsLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Loading…</div>
          ) : registrants.length === 0 ? (
            <p style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>No registrants yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e8e3db" }}>
                    {["Name", "Email", "Source", "Membership", "RSVP Status", "Reg. Status", "Ticket"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#7c7168", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registrants.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", color: "#1a1614", fontWeight: 500 }}>{r.user.name ?? "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#4b4540" }}>{r.user.email}</td>
                      <td style={{ padding: "10px 12px", color: "#7c7168" }}>{r.sourceType}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {r.user.membership ? (
                          <span style={{ background: "#f5f0ea", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: "#1a1614" }}>
                            {r.user.membership.tier}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {r.invitation ? (
                          <span style={{ color: STATUS_COLORS[r.invitation.status] ?? "#6b7280", fontWeight: 600, fontSize: 12 }}>
                            {r.invitation.status.replace(/_/g, " ")}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ color: STATUS_COLORS[r.registrationStatus] ?? "#6b7280", fontWeight: 600, fontSize: 12 }}>
                          {r.registrationStatus.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#7c7168", fontFamily: "monospace", fontSize: 12 }}>
                        {r.ticket?.code ?? "—"}
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
