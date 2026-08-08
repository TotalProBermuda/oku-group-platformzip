"use client";

import { useEffect, useState } from "react";

interface Detail {
  id: string;
  code: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  ticketStatus: string;
  checkedInAt: string | null;
  createdAt: string;
  blockedReason: string | null;
  ticketType: { name: string; tierCode: string | null; priceCents: number } | null;
  user: { id: string; name: string | null; email: string | null };
  session: {
    id: string;
    title: string | null;
    startsAt: string;
    endsAt: string;
    series: { id: string; title: string; venue: string | null } | null;
  } | null;
  order: {
    id: string;
    orderNumber: string | null;
    status: string;
    orderType: string;
    channel: string;
    totalCents: number;
    currency: string;
    createdAt: string;
    paidAt: string | null;
    payment: {
      provider: string;
      status: string;
      authNetTransIdMasked: string | null;
    } | null;
  } | null;
  checkins: Array<{
    id: string;
    method: string;
    createdAt: string;
    checkedInBy: { name: string | null; email: string | null } | null;
  }>;
  attendanceEvent: { id: string; status: string; arrivalTime: string } | null;
  checkInLogs: Array<{
    id: string;
    result: string;
    valid: boolean;
    scannedCode: string;
    deviceInfo: string | null;
    createdAt: string;
    scannedBy: { name: string | null; email: string | null } | null;
  }>;
}

export default function TicketDetailDrawer({
  ticketId,
  onClose,
}: {
  ticketId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/admin/tickets/${ticketId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to load ticket");
        setDetail(data.data);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticketId]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.5)",
        display: "flex", justifyContent: "flex-end",
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ticket detail"
        style={{
          width: "min(560px, 100%)", height: "100%",
          background: "var(--color-surface)", color: "var(--color-text)",
          overflowY: "auto", boxShadow: "-8px 0 32px rgba(0,0,0,0.25)",
        }}
      >
        <header style={{
          padding: "16px 20px", borderBottom: "1px solid var(--color-border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
              Ticket
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700 }}>
              {detail?.code ?? "…"}
            </div>
          </div>
          <button
            type="button" onClick={onClose}
            aria-label="Close ticket detail"
            style={{
              minWidth: 36, minHeight: 36, border: "1px solid var(--color-border)",
              background: "var(--color-surface)", color: "var(--color-text)",
              borderRadius: 8, cursor: "pointer", fontSize: 18,
            }}
          >×</button>
        </header>

        {loading && <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>Loading…</div>}
        {error && <div style={{ padding: 20, color: "#991b1b", background: "#fee2e2", margin: 16, borderRadius: 8 }}>{error}</div>}

        {detail && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

            {detail.blockedReason && (
              <div style={{
                padding: 12, borderRadius: 8,
                background: detail.ticketStatus === "CHECKED_IN" ? "#fef3c7" : "#fee2e2",
                color: detail.ticketStatus === "CHECKED_IN" ? "#92400e" : "#991b1b",
                fontSize: 13, fontWeight: 500,
              }}>
                {detail.blockedReason}
              </div>
            )}

            <Section title="QR / Code">
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <img
                  alt={`QR for ticket ${detail.code}`}
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(`/checkin/${detail.code}`)}`}
                  width={128} height={128}
                  style={{ borderRadius: 8, border: "1px solid var(--color-border)" }}
                />
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Payload: <code>/checkin/{detail.code}</code>
                </div>
              </div>
            </Section>

            <Section title="Attendee">
              <Row label="Name" value={detail.attendeeName ?? detail.user.name ?? "—"} />
              <Row label="Email" value={detail.attendeeEmail ?? detail.user.email ?? "—"} />
              <Row label="Ticket type" value={detail.ticketType?.name ?? "Standard"} />
            </Section>

            <Section title="Session">
              <Row label="Series" value={detail.session?.series?.title ?? "—"} />
              <Row label="Session" value={detail.session?.title ?? "—"} />
              <Row label="Starts" value={detail.session?.startsAt ? new Date(detail.session.startsAt).toLocaleString() : "—"} />
              <Row label="Venue" value={detail.session?.series?.venue ?? "—"} />
            </Section>

            <Section title="Order / Payment">
              <Row label="Order #" value={detail.order?.orderNumber ?? "—"} />
              <Row label="Order status" value={detail.order?.status ?? "—"} />
              <Row label="Channel" value={detail.order?.channel ?? "—"} />
              <Row label="Total" value={detail.order ? `${(detail.order.totalCents / 100).toFixed(2)} ${detail.order.currency}` : "—"} />
              <Row label="Provider" value={detail.order?.payment?.provider ?? "—"} />
              <Row label="Txn (last 4)" value={detail.order?.payment?.authNetTransIdMasked ?? "—"} />
            </Section>

            <Section title={`Check-in records (${detail.checkins.length})`}>
              {detail.checkins.length === 0 && <Empty>No check-ins yet.</Empty>}
              {detail.checkins.map((c) => (
                <div key={c.id} style={logRow}>
                  <span style={{ fontWeight: 600 }}>{c.method}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    by {c.checkedInBy?.name ?? c.checkedInBy?.email ?? "—"}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </Section>

            <Section title={`Scan attempts (${detail.checkInLogs.length})`}>
              {detail.checkInLogs.length === 0 && <Empty>No scan attempts logged.</Empty>}
              {detail.checkInLogs.map((l) => (
                <div key={l.id} style={logRow}>
                  <span style={{
                    fontWeight: 700, fontSize: 11, letterSpacing: "0.04em",
                    padding: "2px 6px", borderRadius: 4,
                    background: l.valid ? "#dcfce7" : "#fee2e2",
                    color: l.valid ? "#166534" : "#991b1b",
                  }}>{l.result.replace("_", " ")}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    by {l.scannedBy?.name ?? l.scannedBy?.email ?? "—"}
                    {l.deviceInfo ? ` · ${l.deviceInfo}` : ""}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>
                    {new Date(l.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      border: "1px solid var(--color-border)", borderRadius: 10,
      padding: 14, background: "var(--color-bg)",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--color-text-muted)",
        marginBottom: 8,
      }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </section>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ textAlign: "right", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>{children}</div>;
}
const logRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "6px 0", borderBottom: "1px dashed var(--color-border)",
  fontSize: 12,
};
