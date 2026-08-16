"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Space = { id: string; name: string; venueId: string; isActive: boolean };
type Occupancy = {
  id: string;
  scope: "SPACE" | "VENUE";
  policy: "EXCLUSIVE" | "COEXIST";
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "POSTPONED" | "CANCELLED";
  eventStartsAt: string;
  eventEndsAt: string;
  setupMinutes: number;
  resetMinutes: number;
  space: { id: string; name: string } | null;
  _count: { reservationConflicts: number };
};

function asLocalInput(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

const inputStyle = { width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" };

export default function EventOccupancyPanel({ seriesId, venueId, seriesSpaceId, spaces, isPublished }: {
  seriesId: string;
  venueId: string | null | undefined;
  seriesSpaceId: string | null | undefined;
  spaces: Space[];
  isPublished: boolean;
}) {
  const [items, setItems] = useState<Occupancy[]>([]);
  const [scope, setScope] = useState<"SPACE" | "VENUE">(seriesSpaceId ? "SPACE" : "VENUE");
  const [spaceId, setSpaceId] = useState(seriesSpaceId ?? "");
  const [start, setStart] = useState(asLocalInput(new Date()));
  const [end, setEnd] = useState(asLocalInput(new Date(Date.now() + 2 * 60 * 60_000)));
  const [setup, setSetup] = useState(0);
  const [reset, setReset] = useState(0);
  const [messages, setMessages] = useState({ en: "", es: "", pt: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const venueSpaces = useMemo(() => spaces.filter((space) => space.venueId === venueId && space.isActive), [spaces, venueId]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/series/${seriesId}/occupancies`);
    if (res.ok) setItems((await res.json()).occupancies ?? []);
  }, [seriesId]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!venueId) return setNotice("Select an operational venue in Basic Info before scheduling dining availability.");
    if (scope === "SPACE" && !spaceId) return setNotice("Select a physical space, or choose Whole restaurant.");
    setBusy(true); setNotice("");
    const res = await fetch(`/api/v1/admin/series/${seriesId}/occupancies`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope, spaceId: scope === "SPACE" ? spaceId : null, policy: "EXCLUSIVE",
        eventStartsAt: new Date(start).toISOString(), eventEndsAt: new Date(end).toISOString(),
        setupMinutes: Number(setup), resetMinutes: Number(reset),
        guestMessageEn: messages.en || undefined, guestMessageEs: messages.es || undefined, guestMessagePt: messages.pt || undefined,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(data.error ?? "Could not create the dining block.");
    setNotice(data.conflictCount ? `${data.conflictCount} existing reservation(s) need review. They were not cancelled.` : "Dining block created.");
    await load();
  }

  async function update(id: string, status: Occupancy["status"]) {
    setBusy(true); setNotice("");
    const res = await fetch(`/api/v1/admin/series/${seriesId}/occupancies`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(data.error ?? "Could not update the dining block.");
    setNotice(status === "PAUSED" ? "Block paused: new diners may book again; existing conflicts remain for review." : "Dining block updated.");
    await load();
  }

  return <div>
    <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: "0 0 8px", color: "#1a1614" }}>Dining availability</h2>
    <p style={{ color: "#7c7168", fontSize: 14, lineHeight: 1.55, margin: "0 0 20px" }}>
      Schedule an exclusive event or whole-restaurant block. Existing reservations are flagged for review, never automatically cancelled. A paused or postponed event immediately releases new dining availability.
    </p>
    {!isPublished && <div style={{ background: "#fff7e6", border: "1px solid #f8d38a", borderRadius: 8, color: "#7a4d00", padding: 12, fontSize: 13, marginBottom: 16 }}>This event is not published. New blocks will remain drafts until it is published.</div>}
    {notice && <div style={{ background: "#f3f7ff", border: "1px solid #bfd3f5", borderRadius: 8, color: "#234a91", padding: 12, fontSize: 13, marginBottom: 16 }}>{notice}</div>}
    <div style={{ border: "1px solid #e5e0d8", borderRadius: 12, padding: 18, marginBottom: 22, background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#534942", textTransform: "uppercase" }}>Coverage
          <select value={scope} onChange={(e) => setScope(e.target.value as "SPACE" | "VENUE")} style={{ ...inputStyle, marginTop: 6 }}>
            <option value="SPACE">One physical space</option><option value="VENUE">Whole restaurant</option>
          </select>
        </label>
        {scope === "SPACE" && <label style={{ fontSize: 12, fontWeight: 700, color: "#534942", textTransform: "uppercase" }}>Physical space
          <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
            <option value="">Select space</option>{venueSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
        </label>}
        <label style={{ fontSize: 12, fontWeight: 700, color: "#534942", textTransform: "uppercase" }}>Event starts
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#534942", textTransform: "uppercase" }}>Event ends
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#534942", textTransform: "uppercase" }}>Setup minutes
          <input type="number" min="0" max="720" value={setup} onChange={(e) => setSetup(Number(e.target.value))} style={{ ...inputStyle, marginTop: 6 }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#534942", textTransform: "uppercase" }}>Reset minutes
          <input type="number" min="0" max="720" value={reset} onChange={(e) => setReset(Number(e.target.value))} style={{ ...inputStyle, marginTop: 6 }} />
        </label>
      </div>
      <p style={{ margin: "18px 0 8px", fontSize: 13, color: "#534942", fontWeight: 700 }}>Guest message — 160 characters maximum per language</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
        {(["en", "es", "pt"] as const).map((locale) => <label key={locale} style={{ fontSize: 12, color: "#7c7168" }}>{locale.toUpperCase()}
          <input maxLength={160} value={messages[locale]} onChange={(e) => setMessages((current) => ({ ...current, [locale]: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }} />
        </label>)}
      </div>
      <button disabled={busy} onClick={create} className="btn btn-primary" style={{ marginTop: 18 }}>{busy ? "Saving…" : "Schedule dining block"}</button>
    </div>
    <h3 style={{ fontSize: 15, margin: "0 0 10px", color: "#1a1614" }}>Scheduled blocks</h3>
    {items.length === 0 ? <p style={{ color: "#7c7168", fontSize: 14 }}>No dining blocks yet.</p> : <div style={{ display: "grid", gap: 10 }}>{items.map((item) => <div key={item.id} style={{ border: "1px solid #e5e0d8", borderRadius: 10, padding: 14, background: "#fff", display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ fontSize: 13, color: "#4c433d", lineHeight: 1.6 }}><strong>{item.scope === "VENUE" ? "Whole restaurant" : item.space?.name ?? "Physical space"}</strong> · {item.status}<br />{new Date(item.eventStartsAt).toLocaleString()} – {new Date(item.eventEndsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}<br /><span style={{ color: item._count.reservationConflicts ? "#b45309" : "#7c7168" }}>{item._count.reservationConflicts} existing reservation conflict(s) to review</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{item.status === "ACTIVE" && <><button className="btn btn-ghost" disabled={busy} onClick={() => update(item.id, "PAUSED")}>Pause</button><button className="btn btn-ghost" disabled={busy} onClick={() => update(item.id, "POSTPONED")}>Postpone</button></>}{isPublished && (item.status === "PAUSED" || item.status === "POSTPONED" || item.status === "DRAFT") && <button className="btn btn-ghost" disabled={busy} onClick={() => update(item.id, "ACTIVE")}>Resume</button>}{item.status !== "CANCELLED" && <button className="btn btn-ghost" disabled={busy} onClick={() => update(item.id, "CANCELLED")}>Cancel block</button>}</div>
    </div>)}</div>}
  </div>;
}
