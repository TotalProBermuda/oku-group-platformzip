"use client";

import { useEffect, useState } from "react";

interface SessionOption {
  id: string;
  title: string | null;
  startsAt: string;
  series: { title: string } | null;
}

export default function IssueTicketModal({
  onClose,
  onIssued,
}: {
  onClose: () => void;
  onIssued: (msg: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/checkin/sessions?range=future");
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setSessions(data.sessions ?? []);
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !attendeeName.trim() || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/tickets/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          attendeeName: attendeeName.trim(),
          attendeeEmail: attendeeEmail.trim() || undefined,
          reason: reason.trim(),
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to issue ticket");
      onIssued(`Comp ticket ${data.data.ticketCode} issued.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 250,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: "var(--color-surface)", color: "var(--color-text)",
          borderRadius: 12, padding: 24, width: "100%", maxWidth: 480,
          boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400 }}>
            Issue comp ticket
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
            Creates a zero-payment order and a valid ticket. Audited.
          </p>
        </div>

        <Field label="Session" required>
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            disabled={loadingSessions}
            required
            style={input}
          >
            <option value="">{loadingSessions ? "Loading sessions…" : "Select a session"}</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.series?.title ?? "Series")} — {s.title ?? "Session"} · {new Date(s.startsAt).toLocaleString()}
              </option>
            ))}
          </select>
          {!loadingSessions && sessions.length === 0 && (
            <small style={{ color: "var(--color-text-muted)" }}>
              No upcoming sessions in the next 90 days.
            </small>
          )}
        </Field>

        <Field label="Guest name" required>
          <input type="text" value={attendeeName} onChange={(e) => setAttendeeName(e.target.value)} required maxLength={120} style={input} />
        </Field>

        <Field label="Guest email (optional)">
          <input type="email" value={attendeeEmail} onChange={(e) => setAttendeeEmail(e.target.value)} style={input} />
        </Field>

        <Field label="Reason" required>
          <input
            type="text" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={280}
            placeholder="e.g. press, partner host, founder guest"
            style={input}
          />
        </Field>

        <Field label="Internal note (optional)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} style={{ ...input, resize: "vertical" }} />
        </Field>

        {error && (
          <div style={{ padding: 10, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} disabled={submitting} style={btnGhost}>Cancel</button>
          <button
            type="submit"
            disabled={submitting || !sessionId || !attendeeName.trim() || !reason.trim()}
            style={btnPrimary}
          >
            {submitting ? "Issuing…" : "Issue ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
        {label}{required && <span style={{ color: "#dc2626" }}> *</span>}
      </span>
      {children}
    </label>
  );
}
const input: React.CSSProperties = {
  padding: "9px 12px", border: "1px solid var(--color-border)",
  borderRadius: 8, background: "var(--color-surface)",
  color: "var(--color-text)", fontSize: 14, outline: "none", minHeight: 38,
};
const btnGhost: React.CSSProperties = {
  padding: "9px 14px", border: "1px solid var(--color-border)",
  background: "var(--color-surface)", color: "var(--color-text)",
  borderRadius: 8, fontSize: 13, cursor: "pointer", minHeight: 38,
};
const btnPrimary: React.CSSProperties = {
  padding: "9px 16px", border: "none",
  background: "var(--color-primary, #1a1614)", color: "white",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", minHeight: 38,
};
