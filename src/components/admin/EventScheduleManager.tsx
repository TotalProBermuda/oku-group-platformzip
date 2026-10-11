"use client";

import { FormEvent, useMemo, useState } from "react";
import MediaUpload from "@/components/ui/MediaUpload";
import { panamaDateTimeLocalInput, panamaDateTimeLocalIso, PANAMA_TIME_ZONE } from "@/lib/panamaDateTime";

type SessionRow = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  flyerImageUrl?: string | null;
  ticketPrices?: Array<{ ticketTypeId: string; priceCents: number }>;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: string;
  allowLateSales?: boolean;
};

type FormState = {
  title: string;
  subtitle: string;
  description: string;
  flyerImageUrl: string;
  ticketPrices: Record<string, string>;
  startsAt: string;
  endsAt: string;
  capacity: string;
  occupancyScope: "NONE" | "SPACE" | "VENUE";
  setupMinutes: string;
  resetMinutes: string;
};

function localInput(date: Date) {
  return panamaDateTimeLocalInput(date);
}

function initialForm(defaultCapacity: number, hasSpace: boolean): FormState {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 3 * 60 * 60_000);

  return {
    title: "",
    subtitle: "",
    description: "",
    flyerImageUrl: "",
    ticketPrices: {},
    startsAt: localInput(start),
    endsAt: localInput(end),
    capacity: String(Math.max(1, defaultCapacity || 1)),
    occupancyScope: hasSpace ? "SPACE" : "NONE",
    setupMinutes: "0",
    resetMinutes: "0",
  };
}

function firstApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const value = payload as { error?: unknown; fields?: Record<string, unknown> };
  if (value.fields) {
    for (const messages of Object.values(value.fields)) {
      if (!Array.isArray(messages)) continue;
      const message = messages.find((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (message) return message;
    }
  }
  return typeof value.error === "string" && value.error.trim() ? value.error : fallback;
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  marginTop: 6,
  padding: "10px 12px",
  border: "1px solid #e5e0d8",
  borderRadius: 8,
  background: "white",
  fontSize: 14,
};

export default function EventScheduleManager({
  seriesId,
  sessions,
  defaultCapacity,
  hasOperationalVenue,
  hasPhysicalSpace,
  ticketTypes = [],
  onCreated,
  canManageSessionContent = false,
}: {
  seriesId: string;
  sessions: SessionRow[];
  defaultCapacity: number;
  hasOperationalVenue: boolean;
  hasPhysicalSpace: boolean;
  ticketTypes?: Array<{ id: string; name: string; priceCents: number }>;
  onCreated: () => Promise<void> | void;
  canManageSessionContent?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialForm(defaultCapacity, hasPhysicalSpace));
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState({ title: "", subtitle: "", description: "", flyerImageUrl: "" });
  const [editTicketPrices, setEditTicketPrices] = useState<Record<string, string>>({});
  const [savingContent, setSavingContent] = useState(false);

  const sortedSessions = useMemo(
    () => [...sessions].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()),
    [sessions],
  );

  function openForm() {
    setNotice("");
    setForm(initialForm(defaultCapacity, hasPhysicalSpace));
    setShowForm(true);
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");

    if (form.occupancyScope !== "NONE" && !hasOperationalVenue) {
      setNotice("Select and save an operational venue before creating a dining block for this event.");
      return;
    }
    if (form.occupancyScope === "SPACE" && !hasPhysicalSpace) {
      setNotice("Select and save a physical space, or choose Whole venue / Ticket-only event.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/admin/series/${seriesId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim() || undefined,
          subtitle: form.subtitle.trim() || undefined,
          description: form.description.trim() || undefined,
          flyerImageUrl: form.flyerImageUrl || undefined,
          ticketPrices: Object.entries(form.ticketPrices).filter(([, value]) => value.trim() !== "").map(([ticketTypeId, value]) => ({ ticketTypeId, priceCents: Math.round(Number(value) * 100) })),
          startsAt: panamaDateTimeLocalIso(form.startsAt),
          endsAt: panamaDateTimeLocalIso(form.endsAt),
          capacity: form.capacity,
          occupancyScope: form.occupancyScope,
          setupMinutes: form.setupMinutes,
          resetMinutes: form.resetMinutes,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(firstApiError(payload, "Could not create this event."));
        return;
      }

      const conflicts = Number((payload as { conflictCount?: unknown } | null)?.conflictCount ?? 0);
      setNotice(
        conflicts > 0
          ? `Event created. ${conflicts} existing reservation(s) need review; none were cancelled.`
          : "Event created.",
      );
      setShowForm(false);
      await onCreated();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create this event.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={{ borderTop: "1px solid #e5e0d8", marginTop: 28, paddingTop: 28 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ color: "#1a1614", fontSize: 18, margin: "0 0 5px" }}>Event sessions</h3>
          <p style={{ color: "#7c7168", fontSize: 14, lineHeight: 1.5, margin: 0 }}>
            Add each dated event guests can book. The series remains the shared programme.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={showForm ? () => setShowForm(false) : openForm}>
          {showForm ? "Close" : "+ Create event"}
        </button>
      </div>

      {notice ? (
        <div role="status" style={{ background: "#f3f7ff", border: "1px solid #bfd3f5", borderRadius: 8, color: "#234a91", fontSize: 13, marginTop: 16, padding: 12 }}>
          {notice}
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={createEvent} style={{ background: "#fff", border: "1px solid #e5e0d8", borderRadius: 12, marginTop: 16, padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
            <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
              Event title (optional)
              <input value={form.title} maxLength={160} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} style={inputStyle} />
            </label>
            <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
              Theme / subtitle (optional)
              <input value={form.subtitle} maxLength={240} onChange={(e) => setForm((current) => ({ ...current, subtitle: e.target.value }))} style={inputStyle} />
            </label>
            <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
              Capacity
              <input required type="number" min="1" max="100000" value={form.capacity} onChange={(e) => setForm((current) => ({ ...current, capacity: e.target.value }))} style={inputStyle} />
            </label>
            <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
              Starts
              <input required type="datetime-local" value={form.startsAt} onChange={(e) => setForm((current) => ({ ...current, startsAt: e.target.value }))} style={inputStyle} />
            </label>
            <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
              Ends
              <input required type="datetime-local" value={form.endsAt} min={form.startsAt} onChange={(e) => setForm((current) => ({ ...current, endsAt: e.target.value }))} style={inputStyle} />
            </label>
            <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
              Dining coverage
              <select value={form.occupancyScope} onChange={(e) => setForm((current) => ({ ...current, occupancyScope: e.target.value as FormState["occupancyScope"] }))} style={inputStyle}>
                <option value="NONE">Ticket-only — do not block dining</option>
                <option value="SPACE" disabled={!hasPhysicalSpace}>Selected physical space</option>
                <option value="VENUE" disabled={!hasOperationalVenue}>Whole venue</option>
              </select>
            </label>
            {form.occupancyScope !== "NONE" ? (
              <>
                <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                  Setup minutes
                  <input type="number" min="0" max="720" value={form.setupMinutes} onChange={(e) => setForm((current) => ({ ...current, setupMinutes: e.target.value }))} style={inputStyle} />
                </label>
                <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                  Reset minutes
                  <input type="number" min="0" max="720" value={form.resetMinutes} onChange={(e) => setForm((current) => ({ ...current, resetMinutes: e.target.value }))} style={inputStyle} />
                </label>
              </>
            ) : null}
          </div>
          <label style={{ color: "#534942", display: "block", fontSize: 12, fontWeight: 700, marginTop: 14, textTransform: "uppercase" }}>
            Session description (optional)
            <textarea rows={3} maxLength={5000} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
          </label>
          <MediaUpload value={form.flyerImageUrl} onChange={(url) => setForm((current) => ({ ...current, flyerImageUrl: url }))} label="Session flyer / image (optional)" mediaType="image" aspectRatio="portrait" maxSizeMB={10} />
          {canManageSessionContent && ticketTypes.length ? <div style={{ borderTop: "1px solid #eee7df", marginTop: 16, paddingTop: 14 }}>
            <h4 style={{ color: "#1a1614", fontSize: 14, margin: "0 0 4px" }}>Session ticket prices</h4>
            <p style={{ color: "#7c7168", fontSize: 12, margin: "0 0 10px" }}>Leave a price blank to inherit the series ticket price. Existing paid orders keep their recorded prices.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {ticketTypes.map((ticket) => <label key={ticket.id} style={{ color: "#534942", fontSize: 12, fontWeight: 700 }}>{ticket.name} · base ${(ticket.priceCents / 100).toFixed(2)}
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Use series price" value={form.ticketPrices[ticket.id] ?? ""} onChange={(event) => setForm((current) => ({ ...current, ticketPrices: { ...current.ticketPrices, [ticket.id]: event.target.value } }))} style={inputStyle} />
              </label>)}
            </div>
          </div> : null}
          <p style={{ color: "#7c7168", fontSize: 12, lineHeight: 1.5, margin: "14px 0 0" }}>
            Dining coverage creates a linked draft block. Existing reservations are flagged for review and are never cancelled automatically.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Creating…" : "Create event"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={submitting} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      ) : null}

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        {sortedSessions.length === 0 ? (
          <p style={{ color: "#8a817a", fontSize: 14, margin: 0 }}>No event sessions yet.</p>
        ) : sortedSessions.map((session) => (
          <div key={session.id} style={{ background: "#fff", border: "1px solid #e5e0d8", borderRadius: 10, padding: 14 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 14, justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ color: "#1a1614", display: "block", fontSize: 14 }}>{session.title || "Event session"}</strong>
                {session.subtitle && <span style={{ color: "#7c7168", display: "block", fontSize: 13 }}>{session.subtitle}</span>}
                <span style={{ color: "#6b7280", fontSize: 13 }}>
                  {new Date(session.startsAt).toLocaleString(undefined, { timeZone: PANAMA_TIME_ZONE })} – {new Date(session.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: PANAMA_TIME_ZONE })} (Panama)
                </span>
                {session.flyerImageUrl && <img src={session.flyerImageUrl} alt={`${session.title || "Session"} flyer`} style={{ display: "block", borderRadius: 8, marginTop: 10, maxHeight: 120, maxWidth: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ color: "#6b7280", fontSize: 12, textAlign: "right" }}>
                <strong style={{ color: "#374151" }}>{session.status}</strong><br />Capacity {session.capacity}
                <label style={{ display: "block", paddingTop: 12 }}>
                  <input type="checkbox" checked={!!session.allowLateSales} onChange={async event => {
                    try {
                      const response = await fetch(`/api/v1/admin/sessions/${session.id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ allowLateSales: event.target.checked }),
                      });
                      if (!response.ok) throw new Error("Unable to change late sales. Superadmin access is required.");
                      await onCreated();
                      setNotice("Sales cutoff updated.");
                    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update cutoff"); }
                  }} /> Allow sales after start, until event ends
                </label>
                {canManageSessionContent && <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => {
                  setNotice("");
                  setEditingSessionId(editingSessionId === session.id ? null : session.id);
                  setEditContent({ title: session.title ?? "", subtitle: session.subtitle ?? "", description: session.description ?? "", flyerImageUrl: session.flyerImageUrl ?? "" });
                  setEditTicketPrices(Object.fromEntries((session.ticketPrices ?? []).map((price) => [price.ticketTypeId, (price.priceCents / 100).toFixed(2)])));
                }}>{editingSessionId === session.id ? "Close content editor" : "Edit session content"}</button>}
              </div>
            </div>
            {editingSessionId === session.id && canManageSessionContent && (
              <div style={{ borderTop: "1px solid #eee7df", marginTop: 14, paddingTop: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
                  <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Session title<input maxLength={160} value={editContent.title} onChange={(e) => setEditContent((current) => ({ ...current, title: e.target.value }))} style={inputStyle} /></label>
                  <label style={{ color: "#534942", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Theme / subtitle<input maxLength={240} value={editContent.subtitle} onChange={(e) => setEditContent((current) => ({ ...current, subtitle: e.target.value }))} style={inputStyle} /></label>
                </div>
                <label style={{ color: "#534942", display: "block", fontSize: 12, fontWeight: 700, marginTop: 12, textTransform: "uppercase" }}>Session description<textarea rows={3} maxLength={5000} value={editContent.description} onChange={(e) => setEditContent((current) => ({ ...current, description: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} /></label>
                <MediaUpload value={editContent.flyerImageUrl} onChange={(url) => setEditContent((current) => ({ ...current, flyerImageUrl: url }))} label="Session flyer / image" mediaType="image" aspectRatio="portrait" maxSizeMB={10} />
                {ticketTypes.length ? <div style={{ borderTop: "1px solid #eee7df", marginTop: 16, paddingTop: 14 }}>
                  <h4 style={{ color: "#1a1614", fontSize: 14, margin: "0 0 4px" }}>Session ticket prices</h4>
                  <p style={{ color: "#7c7168", fontSize: 12, margin: "0 0 10px" }}>Leave blank to inherit the series price. Paid orders are not repriced.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    {ticketTypes.map((ticket) => <label key={ticket.id} style={{ color: "#534942", fontSize: 12, fontWeight: 700 }}>{ticket.name} · base ${(ticket.priceCents / 100).toFixed(2)}
                      <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Use series price" value={editTicketPrices[ticket.id] ?? ""} onChange={(event) => setEditTicketPrices((current) => ({ ...current, [ticket.id]: event.target.value }))} style={inputStyle} />
                    </label>)}
                  </div>
                </div> : null}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <button type="button" className="btn btn-primary" disabled={savingContent} onClick={async () => {
                    setSavingContent(true); setNotice("");
                    try {
                      const response = await fetch(`/api/v1/admin/sessions/${session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: editContent.title, subtitle: editContent.subtitle, description: editContent.description, flyerImageUrl: editContent.flyerImageUrl, ticketPrices: Object.entries(editTicketPrices).filter(([, value]) => value.trim() !== "").map(([ticketTypeId, value]) => ({ ticketTypeId, priceCents: Math.round(Number(value) * 100) })) }) });
                      const payload = await response.json().catch(() => null);
                      if (!response.ok) throw new Error(payload?.error ?? "Unable to save session content.");
                      setEditingSessionId(null); setNotice("Session content saved."); await onCreated();
                    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save session content."); }
                    finally { setSavingContent(false); }
                  }}>{savingContent ? "Saving…" : "Save session content"}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
