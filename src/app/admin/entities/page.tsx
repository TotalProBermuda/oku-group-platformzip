"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import MediaUpload from "@/components/ui/MediaUpload";

interface Entity {
  id: string;
  type: "PERSON" | "COMPANY";
  displayName: string;
  logoUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  linkedInfluencerProfile: { id: string; handle: string | null; refCode: string } | null;
  linkedUser: { id: string; name: string | null; email: string } | null;
  _count: { seriesHosts: number; eventHosts: number };
}

const BLANK: Partial<Entity> & { type: "PERSON" | "COMPANY" } = {
  type: "PERSON",
  displayName: "",
  logoUrl: null,
  description: null,
  websiteUrl: null,
  instagramUrl: null,
};

export default function AdminEntitiesPage() {
  const t = useTranslation();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState<any>({ ...BLANK });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/entities?q=${encodeURIComponent(search)}&type=${typeFilter}`);
    const data = await res.json();
    if (data.ok) setEntities(data.entities);
    setLoading(false);
  }, [search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  function startEdit(e: Entity) {
    setEditId(e.id);
    setForm({
      type:         e.type,
      displayName:  e.displayName,
      logoUrl:      e.logoUrl ?? "",
      description:  e.description ?? "",
      websiteUrl:   e.websiteUrl ?? "",
      instagramUrl: e.instagramUrl ?? "",
    });
    setShowCreate(false);
    setError("");
  }

  function startCreate() {
    setEditId(null);
    setForm({ ...BLANK, logoUrl: "", description: "", websiteUrl: "", instagramUrl: "" });
    setShowCreate(true);
    setError("");
  }

  async function submit() {
    if (!form.displayName?.trim()) { setError("Display name is required"); return; }
    setSaving(true); setError(""); setSuccess("");
    const url    = editId ? `/api/v1/admin/entities/${editId}` : "/api/v1/admin/entities";
    const method = editId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:         form.type,
        displayName:  form.displayName.trim(),
        logoUrl:      form.logoUrl      || null,
        description:  form.description  || null,
        websiteUrl:   form.websiteUrl   || null,
        instagramUrl: form.instagramUrl || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      setSuccess(editId ? "Entity updated" : "Entity created");
      setShowCreate(false);
      setEditId(null);
      load();
    } else {
      setError(data.error ?? "Failed to save");
    }
  }

  async function deleteEntity(id: string, name: string) {
    if (!confirm(`Delete entity "${name}"? This will also remove all their host assignments.`)) return;
    const res = await fetch(`/api/v1/admin/entities/${id}`, { method: "DELETE" });
    if (res.ok) { setSuccess("Deleted"); load(); }
  }

  const fld = (key: string, label: string, type = "text") => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={form[key] ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div className="page-container" style={{ padding: "40px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 6 }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Admin</Link> → Entities
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 400, color: "#1a1614", margin: 0 }}>
            {t("admin", "entities") ?? "Host Entities"}
          </h1>
          <p style={{ color: "#7c7168", fontSize: 14, marginTop: 6, marginBottom: 0 }}>
            Persons and companies that can be assigned as hosts to series and sessions.
          </p>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>+ New Entity</button>
      </div>

      {error   && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          className="form-input"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select className="form-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">All types</option>
          <option value="PERSON">Person</option>
          <option value="COMPANY">Company</option>
        </select>
      </div>

      {/* Create / Edit form */}
      {(showCreate || editId) && (
        <div className="card" style={{ padding: 28, marginBottom: 24, borderColor: "#c41e3a30" }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginBottom: 24, color: "#1a1614" }}>
            {editId ? "Edit Entity" : "Create Entity"}
          </h3>

          {/* Basic Info */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={(e) => setForm((f: any) => ({ ...f, type: e.target.value }))}>
                <option value="PERSON">Person</option>
                <option value="COMPANY">Company</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Display Name *</label>
              <input className="form-input" type="text" value={form.displayName ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Website</label>
              <input className="form-input" type="text" value={form.websiteUrl ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, websiteUrl: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Instagram URL</label>
              <input className="form-input" type="text" value={form.instagramUrl ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, instagramUrl: e.target.value }))} />
            </div>
          </div>

          {/* Logo Upload + Preview */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>Logo / Photo</label>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>SVG · PNG · WebP — transparent background recommended</span>
            </div>
            <MediaUpload
              value={form.logoUrl ?? ""}
              onChange={(url) => setForm((f: any) => ({ ...f, logoUrl: url }))}
              mediaType="icon"
              aspectRatio="wide"
              maxSizeMB={5}
              compact={false}
            />
            {/* Logo size preview */}
            {form.logoUrl && (
              <div style={{ marginTop: 16, padding: "16px 20px", background: "#fafaf9", borderRadius: 10, border: "1px solid #e5e0d8" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 14 }}>
                  Logo Preview — How it renders across the platform
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
                  {[
                    { label: "List Thumbnail", size: 40, bg: "white", note: "48×48 container" },
                    { label: "Series Card", size: 52, bg: "white", note: "Host row" },
                    { label: "Sponsor — Partner", size: 32, bg: "#1a1614", note: "Dark surface" },
                    { label: "Sponsor — Presented By", size: 64, bg: "#1a1614", note: "Top tier" },
                    { label: "Profile Header", size: 72, bg: "white", note: "Entity detail" },
                  ].map(({ label, size, bg, note }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{
                        width: size + 24, height: size + 24,
                        background: bg, border: "1px solid #e5e0d8", borderRadius: 8,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        marginBottom: 6,
                      }}>
                        <img src={form.logoUrl} alt="" style={{ maxHeight: size, maxWidth: size + 16, objectFit: "contain" }} />
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280" }}>{label}</div>
                      <div style={{ fontSize: 9, color: "#9ca3af" }}>{note}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, padding: "10px 14px", background: "#fff8f0", borderRadius: 8, border: "1px solid #fde8cc" }}>
                  <div style={{ fontSize: 11, color: "#92400e", fontWeight: 600, marginBottom: 4 }}>Recommended specs</div>
                  <div style={{ fontSize: 11, color: "#78350f", lineHeight: 1.6 }}>
                    <b>Primary logo:</b> Min 400×200px · SVG preferred · Transparent background<br />
                    <b>Sponsor use:</b> Horizontal layout works best (wider than tall) · Max 1200×600px<br />
                    <b>Profile photo:</b> Square format · Min 400×400px · JPEG or PNG
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={form.description ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving…" : editId ? "Update" : "Create"}</button>
            <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setEditId(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Entity list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="loading-spinner" style={{ margin: "0 auto" }} /></div>
      ) : entities.length === 0 ? (
        <div className="empty-state" style={{ padding: "60px 0" }}>
          <div className="empty-state-icon">🏢</div>
          <div className="empty-state-title">No entities yet</div>
          <p style={{ color: "var(--color-text-muted)" }}>Create your first entity to start assigning hosts to series and sessions.</p>
          <button className="btn btn-primary" onClick={startCreate}>+ New Entity</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entities.map((e) => (
            <div key={e.id} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              {e.logoUrl ? (
                <img src={e.logoUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 8, background: e.type === "COMPANY" ? "#e8f0e8" : "#f0e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  {e.type === "COMPANY" ? "🏢" : "👤"}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1614" }}>{e.displayName}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <span className="badge badge-neutral" style={{ fontSize: 11 }}>{e.type}</span>
                  {e.linkedInfluencerProfile && (
                    <span className="badge badge-success" style={{ fontSize: 11 }}>
                      Influencer: {e.linkedInfluencerProfile.handle ?? e.linkedInfluencerProfile.refCode}
                    </span>
                  )}
                  {e.linkedUser && (
                    <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                      User: {e.linkedUser.name ?? e.linkedUser.email}
                    </span>
                  )}
                  {(e._count.seriesHosts > 0 || e._count.eventHosts > 0) && (
                    <span className="badge" style={{ fontSize: 11, background: "#1a1614", color: "#fff" }}>
                      {e._count.seriesHosts} series · {e._count.eventHosts} sessions
                    </span>
                  )}
                </div>
                {e.description && (
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 480 }}>{e.description}</div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {e.websiteUrl && (
                  <a href={e.websiteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>↗</a>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(e)}>Edit</button>
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }} onClick={() => deleteEntity(e.id, e.displayName)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
