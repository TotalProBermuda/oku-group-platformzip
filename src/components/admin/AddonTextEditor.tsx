"use client";
import { useState } from "react";
import EventTextNotice from "./EventTextNotice";
import SeriesTranslationStatus from "./SeriesTranslationStatus";
import { useSeriesTranslations } from "./useSeriesTranslations";

type Addon = { id: string; name: string; description?: string | null; priceCents: number; capacity?: number | null };
export default function AddonTextEditor({ seriesId, addons, canEdit, onSaved }: { seriesId: string; addons: Addon[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const translations = useSeriesTranslations(seriesId);
  return <div><EventTextNotice /><SeriesTranslationStatus translation={translations.translation} loading={translations.loading} working={translations.working} error={translations.error} onResume={translations.resume} onRetry={translations.retry} onRefresh={translations.refresh} />{!addons.length && <p>No add-ons are configured.</p>}{addons.map(addon => <section key={addon.id} style={{ border: "1px solid #e5e0d8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
    <strong>{addon.name}</strong><p>${(addon.priceCents / 100).toFixed(2)} · Capacity {addon.capacity ?? "unlimited"}</p>
    {editing === addon.id ? <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try {
        const response = await fetch(`/api/v1/admin/experiences/${seriesId}/addons/${addon.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) throw new Error("Could not save add-on text.");
        await translations.onSave(result);
        await onSaved(); setEditing(null);
      } catch (e) { setError(e instanceof Error ? e.message : "Could not save add-on text."); }
      finally { setBusy(false); }
    }} style={{ display: "grid", gap: 10 }}>
      <label>English name<input required maxLength={160} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={{ width: "100%", boxSizing: "border-box" }} /></label>
      <label>English description<textarea maxLength={5000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} style={{ width: "100%", boxSizing: "border-box" }} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save add-on text"}</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
    </form> : <><p>{addon.description}</p>{canEdit && <button type="button" className="btn btn-ghost" onClick={() => { setEditing(addon.id); setDraft({ name: addon.name, description: addon.description ?? "" }); setError(""); }}>Edit add-on text</button>}</>}
  </section>)}</div>;
}
