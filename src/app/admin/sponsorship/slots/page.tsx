"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";

const CATEGORIES = ["TITLE","BEVERAGE","SPIRITS","CULINARY","LUXURY","WELLNESS","REAL_ESTATE","MEDIA","EXPERIENCE","OTHER"];
const SCOPE_TYPES = ["SERIES","EVENT","PRIVATE_DINING","CURATED_TABLE"];
const STATUSES    = ["OPEN","FILLED","SUSPENDED"];

const CAT_ICONS: Record<string, string> = {
  TITLE: "👑", BEVERAGE: "🍷", SPIRITS: "🥃", CULINARY: "🍽️",
  LUXURY: "💎", WELLNESS: "🌿", REAL_ESTATE: "🏛️", MEDIA: "📸",
  EXPERIENCE: "✨", OTHER: "📦",
};

const SLOT_STATUS_COLOR: Record<string, string> = {
  OPEN: "#16a34a", FILLED: "#1a1614", SUSPENDED: "#9ca3af",
};

const BLANK_FORM = {
  title: "", category: "TITLE", scopeType: "SERIES", description: "",
  audienceProfile: "", exclusivityNote: "", isExclusive: true, maxSponsors: 1,
  askPriceCents: "", floorPriceCents: "", isPublished: false,
  seriesId: "", sessionId: "", sortOrder: "0", internalNotes: "",
  benefits: "", deliverables: "",
};

export default function AdminSponsorshipSlotsPage() {
  const t = useTranslation();
  const [slots, setSlots]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");
  const [filterStatus,   setFilterStatus]   = useState("");
  const [filterCategory, setFilterCategory] = useState(
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("category") ?? "" : ""
  );
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<any>({ ...BLANK_FORM });
  const [seriesList, setSeriesList] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filterStatus)   qs.set("status",   filterStatus);
    if (filterCategory) qs.set("category", filterCategory);
    const r = await fetch(`/api/v1/admin/sponsorship/slots?${qs}`);
    const d = await r.json();
    if (d.ok) setSlots(d.slots);
    setLoading(false);
  }, [filterStatus, filterCategory]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/v1/admin/series").then((r) => r.json()).then((d) => { if (d.ok) setSeriesList(d.series ?? []); });
  }, []);

  function fld(key: string, label: string, type = "text", opts?: string[]) {
    if (opts) return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <select className="form-select" value={form[key] ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))}>
          {opts.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
        </select>
      </div>
    );
    if (type === "textarea") return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <textarea className="form-input" rows={3} value={form[key] ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))} />
      </div>
    );
    if (type === "checkbox") return (
      <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="checkbox" id={key} checked={!!form[key]} onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.checked }))} />
        <label htmlFor={key} className="form-label" style={{ margin: 0, cursor: "pointer" }}>{label}</label>
      </div>
    );
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        <input className="form-input" type={type} value={form[key] ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))} />
      </div>
    );
  }

  async function submit() {
    if (!form.title?.trim()) { setError("Title is required"); return; }
    setSaving(true); setError(""); setSuccess("");
    const url    = editId ? `/api/v1/admin/sponsorship/slots/${editId}` : "/api/v1/admin/sponsorship/slots";
    const method = editId ? "PATCH" : "POST";
    const body: any = {
      ...form,
      askPriceCents:   form.askPriceCents   ? Number(form.askPriceCents)   : null,
      floorPriceCents: form.floorPriceCents ? Number(form.floorPriceCents) : null,
      sortOrder:       Number(form.sortOrder) || 0,
      seriesId:        form.seriesId  || null,
      sessionId:       form.sessionId || null,
    };
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setSaving(false);
    if (d.ok) {
      setSuccess(editId ? "Slot updated" : "Slot created");
      setShowCreate(false); setEditId(null); setForm({ ...BLANK_FORM });
      load();
    } else {
      setError(d.error ?? "Failed to save");
    }
  }

  async function togglePublish(slot: any) {
    await fetch(`/api/v1/admin/sponsorship/slots/${slot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !slot.isPublished }),
    });
    load();
  }

  async function deleteSlot(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await fetch(`/api/v1/admin/sponsorship/slots/${id}`, { method: "DELETE" });
    load();
  }

  function startEdit(slot: any) {
    setEditId(slot.id);
    setForm({
      ...BLANK_FORM,
      title:           slot.title,
      category:        slot.category,
      scopeType:       slot.scopeType,
      description:     slot.description   ?? "",
      audienceProfile: slot.audienceProfile ?? "",
      exclusivityNote: slot.exclusivityNote ?? "",
      isExclusive:     slot.isExclusive,
      maxSponsors:     slot.maxSponsors,
      askPriceCents:   slot.askPriceCents   != null ? String(slot.askPriceCents)   : "",
      floorPriceCents: slot.floorPriceCents != null ? String(slot.floorPriceCents) : "",
      isPublished:     slot.isPublished,
      seriesId:        slot.seriesId   ?? "",
      sessionId:       slot.sessionId  ?? "",
      sortOrder:       String(slot.sortOrder ?? 0),
      internalNotes:   slot.internalNotes ?? "",
    });
    setShowCreate(true);
    setError("");
  }

  return (
    <div className="page-container" style={{ padding: "40px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link href="/admin/sponsorship" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>← Sponsorship</Link>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 400, color: "#1a1614", margin: "6px 0 0" }}>Sponsorship Inventory</h1>
          <p style={{ color: "#7c7168", fontSize: 14, marginTop: 4, marginBottom: 0 }}>Define and manage sponsorship slots across series, events, and experiences.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditId(null); setForm({ ...BLANK_FORM }); setShowCreate(true); setError(""); }}>
          + New Slot
        </button>
      </div>

      {error   && <div className="alert alert-danger"   style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="alert alert-success"  style={{ marginBottom: 16 }}>{success}</div>}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <select className="form-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 160 }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ width: 180 }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_ICONS[c]} {c.replace("_", " ")}</option>)}
        </select>
      </div>

      {/* Create/Edit form */}
      {showCreate && (
        <div className="card" style={{ padding: 24, marginBottom: 28, borderColor: "#c41e3a30" }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginBottom: 20, color: "#1a1614" }}>
            {editId ? "Edit Slot" : "Create Sponsorship Slot"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {fld("title",    "Title *")}
            {fld("category", "Category", "text", CATEGORIES)}
            {fld("scopeType","Scope Type", "text", SCOPE_TYPES)}
            <div className="form-group">
              <label className="form-label">Series (optional)</label>
              <select className="form-select" value={form.seriesId ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, seriesId: e.target.value }))}>
                <option value="">None</option>
                {seriesList.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            {fld("askPriceCents",   "Ask Price (cents)", "number")}
            {fld("floorPriceCents", "Floor Price (cents)", "number")}
          </div>
          {fld("description",    "Description", "textarea")}
          {fld("audienceProfile","Audience Profile", "textarea")}
          {fld("exclusivityNote","Exclusivity Note")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {fld("isExclusive",  "Exclusive (one sponsor only)", "checkbox")}
            {!form.isExclusive && fld("maxSponsors", "Max Sponsors", "number")}
            {fld("isPublished",  "Published (visible to brands)", "checkbox")}
            {fld("sortOrder",    "Sort Order", "number")}
          </div>
          {fld("internalNotes", "Internal Notes", "textarea")}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving…" : editId ? "Update" : "Create"}</button>
            <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setEditId(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Slot list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="loading-spinner" style={{ margin: "0 auto" }} /></div>
      ) : slots.length === 0 ? (
        <div className="empty-state" style={{ padding: "60px 0" }}>
          <div className="empty-state-icon">🎯</div>
          <div className="empty-state-title">No sponsorship slots yet</div>
          <p style={{ color: "var(--color-text-muted)" }}>Create your first slot to start packaging sponsorship inventory.</p>
          <button className="btn btn-primary" onClick={() => { setEditId(null); setForm({ ...BLANK_FORM }); setShowCreate(true); }}>+ New Slot</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {slots.map((slot) => (
            <div key={slot.id} className="card" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "#f8f5f3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  {CAT_ICONS[slot.category] ?? "📦"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1614" }}>{slot.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: SLOT_STATUS_COLOR[slot.status] + "22", color: SLOT_STATUS_COLOR[slot.status] }}>
                      {slot.status}
                    </span>
                    {slot.isPublished ? (
                      <span className="badge badge-success" style={{ fontSize: 11 }}>Published</span>
                    ) : (
                      <span className="badge badge-neutral" style={{ fontSize: 11 }}>Draft</span>
                    )}
                    {slot.isExclusive && <span className="badge" style={{ fontSize: 11, background: "#1a161422", color: "#1a1614" }}>Exclusive</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {slot.askPriceCents && <span>Ask: <strong>${(slot.askPriceCents / 100).toLocaleString()}</strong></span>}
                    {slot.series && <span>→ {slot.series.title}</span>}
                    <span>{slot._count.applications} applications · {slot._count.deals} deals</span>
                  </div>
                  {slot.description && (
                    <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}>{slot.description}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => togglePublish(slot)}>
                    {slot.isPublished ? "Unpublish" : "Publish"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(slot)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }} onClick={() => deleteSlot(slot.id, slot.title)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
