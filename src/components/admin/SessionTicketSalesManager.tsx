"use client";

import { useState } from "react";

type SessionRow = {
  id: string;
  title?: string | null;
  startsAt: string;
  ticketSalesMode?: "INHERIT" | "OVERRIDE";
  ticketSalesStartAt?: string | null;
  ticketSalesEndAt?: string | null;
};

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export default function SessionTicketSalesManager({ sessions }: { sessions: SessionRow[] }) {
  const [values, setValues] = useState(() => Object.fromEntries(sessions.map((session) => [session.id, {
    mode: session.ticketSalesMode ?? "INHERIT",
    startsAt: toLocalInput(session.ticketSalesStartAt),
    endsAt: toLocalInput(session.ticketSalesEndAt),
  }])) as Record<string, { mode: "INHERIT" | "OVERRIDE"; startsAt: string; endsAt: string }>);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { error?: string; success?: string }>>({});

  async function save(session: SessionRow) {
    const value = values[session.id];
    if (!value) return;
    setSavingId(session.id);
    setMessages((current) => ({ ...current, [session.id]: {} }));
    try {
      const response = await fetch(`/api/v1/admin/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketSalesMode: value.mode,
          ticketSalesStartAt: toIso(value.startsAt),
          ticketSalesEndAt: toIso(value.endsAt),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the event sale window.");
      setMessages((current) => ({ ...current, [session.id]: { success: "Saved. This event’s checkout now uses the selected sale window." } }));
    } catch (error) {
      setMessages((current) => ({ ...current, [session.id]: { error: error instanceof Error ? error.message : "Save failed." } }));
    } finally {
      setSavingId(null);
    }
  }

  const fieldStyle = { width: "100%", boxSizing: "border-box" as const, padding: "9px 11px", border: "1px solid #e5e0d8", borderRadius: 8, background: "white", fontSize: 13 };

  return (
    <section style={{ marginTop: 28, padding: 18, border: "1px solid #e5e0d8", borderRadius: 12, background: "#fff" }}>
      <h3 style={{ margin: "0 0 6px", color: "#1a1614", fontSize: 17 }}>Event-level ticket availability</h3>
      <p style={{ margin: "0 0 16px", color: "#7c7168", fontSize: 13, lineHeight: 1.5 }}>
        Ticket types are assigned to this series. Each event can inherit their sale window or override it independently. An override applies to all ticket types for that event and replaces both dates, so a blank end means no event-level cutoff.
      </p>
      {sessions.length === 0 ? <p style={{ color: "#9b8f85", fontSize: 13 }}>Create an event session first.</p> : (
        <div style={{ display: "grid", gap: 12 }}>
          {sessions.map((session) => {
            const value = values[session.id] ?? { mode: "INHERIT" as const, startsAt: "", endsAt: "" };
            const message = messages[session.id];
            return (
              <article key={session.id} style={{ border: "1px solid #eee8e1", borderRadius: 10, padding: 14 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 650, color: "#1a1614", fontSize: 14 }}>{session.title || "Event"}</div>
                  <div style={{ color: "#8b8178", fontSize: 12 }}>{new Date(session.startsAt).toLocaleString()}</div>
                </div>
                <label style={{ display: "block", fontSize: 11, color: "#645b55", fontWeight: 700, marginBottom: 6 }}>SALE WINDOW</label>
                <select value={value.mode} onChange={(event) => setValues((current) => ({ ...current, [session.id]: { ...value, mode: event.target.value as "INHERIT" | "OVERRIDE" } }))} style={fieldStyle}>
                  <option value="INHERIT">Use each ticket type’s series sale window</option>
                  <option value="OVERRIDE">Override the sale window for this event</option>
                </select>
                {value.mode === "OVERRIDE" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 10 }}>
                    <label style={{ fontSize: 11, color: "#645b55", fontWeight: 700 }}>EVENT SALES OPEN
                      <input type="datetime-local" value={value.startsAt} onChange={(event) => setValues((current) => ({ ...current, [session.id]: { ...value, startsAt: event.target.value } }))} style={{ ...fieldStyle, display: "block", marginTop: 5, fontWeight: 400 }} />
                    </label>
                    <label style={{ fontSize: 11, color: "#645b55", fontWeight: 700 }}>EVENT SALES CLOSE
                      <input type="datetime-local" value={value.endsAt} onChange={(event) => setValues((current) => ({ ...current, [session.id]: { ...value, endsAt: event.target.value } }))} style={{ ...fieldStyle, display: "block", marginTop: 5, fontWeight: 400 }} />
                    </label>
                  </div>
                )}
                {message?.error && <p role="alert" style={{ color: "#b91c1c", fontSize: 12, margin: "10px 0 0" }}>{message.error}</p>}
                {message?.success && <p role="status" style={{ color: "#15803d", fontSize: 12, margin: "10px 0 0" }}>{message.success}</p>}
                <button type="button" onClick={() => save(session)} disabled={savingId === session.id} style={{ marginTop: 12, padding: "8px 14px", background: "#1a1614", color: "white", border: 0, borderRadius: 7, fontWeight: 650, cursor: savingId === session.id ? "wait" : "pointer" }}>
                  {savingId === session.id ? "Saving…" : "Save event sale window"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
