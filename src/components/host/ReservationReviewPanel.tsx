"use client";

import { useState } from "react";

type ReviewRow = {
  id: string;
  venueId: string;
  venue: { name: string };
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  confirmationCode: string;
  reservationDate: string;
  partySize: number;
  status: string;
  source: string;
  sourceContext: string | null;
  notes: string | null;
  archiveBlockedReason: string | null;
};

function panamaDate(value: string) {
  return new Date(value).toLocaleString("en", {
    timeZone: "America/Panama", dateStyle: "medium", timeStyle: "short",
  }) + " (Panama)";
}

export default function ReservationReviewPanel({ dark = false, onArchived }: { dark?: boolean; onArchived?: () => void }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [confirmById, setConfirmById] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const ink = dark ? "#f8fafc" : "#0f172a";
  const muted = dark ? "#94a3b8" : "#64748b";
  const card = dark ? "rgba(255,255,255,.04)" : "#fff";
  const border = dark ? "rgba(255,255,255,.12)" : "#e2e8f0";

  async function search() {
    setError(""); setNotice(""); setSearched(true);
    if (query.trim().length < 3) { setRows([]); setError("Enter at least 3 characters to search."); return; }
    try {
      const response = await fetch(`/api/v1/host/reservation-review?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Search failed.");
      setRows(payload.data ?? []);
      if (payload.limited) setNotice("Showing the 50 most recently dated matches. Narrow the search if needed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
  }

  async function archive(row: ReviewRow) {
    const reason = reasonById[row.id]?.trim() ?? "";
    if (!confirmById[row.id] || reason.length < 8) return;
    setBusyId(row.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/host/reservation-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: row.id, reason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not archive this reservation.");
      setRows((current) => current.filter((item) => item.id !== row.id));
      setNotice(`${row.contactName} was cancelled and removed from the active queue. Its audit history is retained; no record was deleted.`);
      onArchived?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not archive this reservation."); }
    finally { setBusyId(null); }
  }

  return (
    <section aria-label="Review demo and test reservations" style={{ margin: "16px 0", padding: 16, border: `1px solid ${border}`, borderRadius: 14, background: card, color: ink }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>Review demo / test reservations</div>
      <p style={{ margin: "6px 0 12px", color: muted, fontSize: 12, lineHeight: 1.5 }}>
        Search by guest, email, phone, booking code, notes or source context. Review each result before cancelling it as test data. Seated, POS-linked, revenue-bearing or payment-linked records are protected. This archives by audited cancellation—it never deletes records.
      </p>
      <form onSubmit={(event) => { event.preventDefault(); void search(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input aria-label="Search reservations" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try ‘test’, ‘demo’, a name or booking code" style={{ flex: "1 1 250px", minWidth: 0, minHeight: 44, boxSizing: "border-box", border: `1px solid ${border}`, borderRadius: 9, padding: "10px 12px", color: ink, background: dark ? "#111318" : "#fff" }} />
        <button type="submit" style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: 9, color: "#fff", background: "#be123c", fontWeight: 800 }}>Search</button>
      </form>
      {notice && <div role="status" style={{ marginTop: 10, color: dark ? "#86efac" : "#166534", fontSize: 12 }}>{notice}</div>}
      {error && <div role="alert" style={{ marginTop: 10, color: "#be123c", fontSize: 12 }}>{error}</div>}
      {searched && !error && rows.length === 0 && <div style={{ marginTop: 12, color: muted, fontSize: 12 }}>No reservations matched that search.</div>}
      {rows.length > 0 && <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {rows.map((row) => <article key={row.id} style={{ padding: 12, border: `1px solid ${border}`, borderRadius: 10, background: dark ? "rgba(15,23,42,.65)" : "#f8fafc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong>{row.contactName} · {row.partySize} pax</strong><span style={{ color: muted, fontSize: 12 }}>{row.status.replaceAll("_", " ")}</span>
          </div>
          <div style={{ marginTop: 5, color: muted, fontSize: 12, lineHeight: 1.5 }}>
            {row.venue.name} · {panamaDate(row.reservationDate)}<br />
            {row.source} · {row.confirmationCode} · {row.contactEmail}{row.contactPhone ? ` · ${row.contactPhone}` : row.contactWhatsapp ? ` · ${row.contactWhatsapp}` : ""}
          </div>
          {(row.sourceContext || row.notes) && <div style={{ marginTop: 6, color: muted, fontSize: 11, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>Context: {[row.sourceContext, row.notes].filter(Boolean).join(" · ")}</div>}
          {row.archiveBlockedReason ? <div style={{ marginTop: 8, color: "#9a3412", fontSize: 12, fontWeight: 700 }}>Protected: {row.archiveBlockedReason}</div> : <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <textarea aria-label={`Reason ${row.contactName} is test data`} value={reasonById[row.id] ?? ""} onChange={(event) => setReasonById((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Why is this reservation test/demo data? (minimum 8 characters)" rows={2} style={{ width: "100%", boxSizing: "border-box", minHeight: 56, border: `1px solid ${border}`, borderRadius: 8, padding: 9, color: ink, background: dark ? "#111318" : "#fff", font: "inherit", fontSize: 12 }} />
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, lineHeight: 1.4, color: muted }}><input type="checkbox" checked={!!confirmById[row.id]} onChange={(event) => setConfirmById((current) => ({ ...current, [row.id]: event.target.checked }))} />I reviewed this exact reservation and confirm it is test/demo data, not a genuine guest booking.</label>
            <button type="button" disabled={!confirmById[row.id] || (reasonById[row.id]?.trim().length ?? 0) < 8 || busyId === row.id} onClick={() => void archive(row)} style={{ minHeight: 42, justifySelf: "start", padding: "0 14px", border: "1px solid #be123c", borderRadius: 8, background: "transparent", color: "#be123c", fontWeight: 800, opacity: !confirmById[row.id] || (reasonById[row.id]?.trim().length ?? 0) < 8 ? .5 : 1 }}>{busyId === row.id ? "Archiving…" : "Cancel & archive from active queue"}</button>
          </div>}
        </article>)}
      </div>}
    </section>
  );
}
