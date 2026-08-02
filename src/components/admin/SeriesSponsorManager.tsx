"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import SponsorPlacementPreview from "@/components/sponsors/SponsorPlacementPreview";
import { resolveSponsors } from "@/lib/sponsor-render";
import MediaUpload from "@/components/ui/MediaUpload";
import type { ResolvedSponsors } from "@/lib/sponsor-render";

interface Props {
  seriesId: string;
}

type PreviewSurface = "event_page" | "ticket" | "email";

const SURFACES: { id: PreviewSurface; label: string }[] = [
  { id: "event_page", label: "Event Page" },
  { id: "ticket",    label: "Ticket" },
  { id: "email",     label: "Email" },
];

const PLACEMENT_TOGGLES = [
  { key: "showOnEventPage", label: "Event Page" },
  { key: "showOnTicket",    label: "Ticket" },
  { key: "showOnEmail",     label: "Email" },
  { key: "showOnCheckInView", label: "Check-In" },
];

export default function SeriesSponsorManager({ seriesId }: Props) {
  const t = useTranslation();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [previewSurface, setPreviewSurface] = useState<PreviewSurface>("event_page");
  const [previewData, setPreviewData] = useState<ResolvedSponsors | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    entityId: "", tierId: "", sortOrder: 0, logoUrl: "", websiteUrl: "",
    displayNameOverride: "", showOnEventPage: true, showOnTicket: true,
    showOnEmail: true, showOnCheckInView: false, notes: "",
  });

  const load = useCallback(async () => {
    const [aRes, tRes, eRes] = await Promise.all([
      fetch(`/api/v1/admin/series/${seriesId}/sponsors`),
      fetch(`/api/v1/admin/sponsor-tiers`),
      fetch(`/api/v1/admin/entities`),
    ]);
    const [aData, tData, eData] = await Promise.all([aRes.json(), tRes.json(), eRes.json()]);
    const assignments = aData.assignments ?? [];
    setAssignments(assignments);
    setTiers(tData.tiers ?? []);
    setEntities(eData.entities ?? []);
    if (assignments.length === 0) setShowAdd(true);
    setLoading(false);
  }, [seriesId]);

  useEffect(() => { load(); }, [load]);

  const loadPreview = useCallback(async (surface: PreviewSurface) => {
    const res = await fetch(`/api/v1/sponsors/resolve?scopeType=SERIES&scopeId=${seriesId}&surface=${surface}`);
    setPreviewData(await res.json());
  }, [seriesId]);

  useEffect(() => {
    if (showPreview) loadPreview(previewSurface);
  }, [showPreview, previewSurface, loadPreview]);

  async function addOrUpdate() {
    setSaving(true);
    const url = editId
      ? `/api/v1/admin/series/${seriesId}/sponsors/${editId}`
      : `/api/v1/admin/series/${seriesId}/sponsors`;
    const method = editId ? "PATCH" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        logoUrl: form.logoUrl || null,
        websiteUrl: form.websiteUrl || null,
        displayNameOverride: form.displayNameOverride || null,
        notes: form.notes || null,
      }),
    });
    setShowAdd(false);
    setEditId(null);
    resetForm();
    setSaving(false);
    await load();
    if (showPreview) loadPreview(previewSurface);
  }

  async function remove(id: string) {
    if (!confirm("Remove this sponsor assignment?")) return;
    await fetch(`/api/v1/admin/series/${seriesId}/sponsors/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleActive(a: any) {
    await fetch(`/api/v1/admin/series/${seriesId}/sponsors/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !a.isActive }),
    });
    load();
  }

  function resetForm() {
    setForm({ entityId: "", tierId: "", sortOrder: 0, logoUrl: "", websiteUrl: "", displayNameOverride: "", showOnEventPage: true, showOnTicket: true, showOnEmail: true, showOnCheckInView: false, notes: "" });
  }

  function startEdit(a: any) {
    setEditId(a.id);
    setForm({
      entityId: a.entityId,
      tierId: a.tierId,
      sortOrder: a.sortOrder,
      logoUrl: a.logoUrl ?? "",
      websiteUrl: a.websiteUrl ?? "",
      displayNameOverride: a.displayNameOverride ?? "",
      showOnEventPage: a.showOnEventPage,
      showOnTicket: a.showOnTicket,
      showOnEmail: a.showOnEmail,
      showOnCheckInView: a.showOnCheckInView,
      notes: a.notes ?? "",
    });
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const grouped = tiers.map((tier) => ({
    tier,
    items: assignments.filter((a) => a.tierId === tier.id),
  })).filter((g) => g.items.length > 0);

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}><div className="loading-spinner" style={{ margin: "0 auto" }} /></div>;

  const inpStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 };

  return (
    <div>
      {/* Header actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={() => { setEditId(null); resetForm(); setShowAdd(!showAdd); }} className="btn btn-primary" style={{ fontSize: 13 }}>
          {showAdd && !editId ? "Cancel" : "+ Add Sponsor"}
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="btn btn-ghost"
          style={{ fontSize: 13, borderColor: showPreview ? "#c41e3a" : undefined, color: showPreview ? "#c41e3a" : undefined }}
        >
          {showPreview ? "Hide Preview" : "Preview Placement"}
        </button>
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1614" }}>{editId ? "Edit Sponsor Assignment" : "Add Sponsor"}</h3>
            {!editId && (
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#9ca3af" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#1a1614", color: "white", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>1</span>
                  Pick Brand
                </span>
                <span style={{ color: "#d1cdc7" }}>→</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#1a1614", color: "white", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>2</span>
                  Choose Tier
                </span>
                <span style={{ color: "#d1cdc7" }}>→</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#1a1614", color: "white", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>3</span>
                  Upload Logo (optional)
                </span>
                <span style={{ color: "#d1cdc7" }}>→</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#c41e3a", color: "white", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>4</span>
                  <span style={{ color: "#c41e3a", fontWeight: 600 }}>Save Assignment</span>
                </span>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Brand / Entity</label>
              <select value={form.entityId} onChange={(e) => setForm((p: any) => ({ ...p, entityId: e.target.value }))} style={inpStyle}>
                <option value="">Select entity…</option>
                {entities.map((e: any) => <option key={e.id} value={e.id}>{e.displayName}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sponsor Tier</label>
              <select value={form.tierId} onChange={(e) => setForm((p: any) => ({ ...p, tierId: e.target.value }))} style={inpStyle}>
                <option value="">Select tier…</option>
                {tiers.map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={labelStyle}>Logo Override</label>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>Optional — uses entity's logo by default</span>
              </div>
              {form.entityId && !form.logoUrl && (
                <div style={{ marginBottom: 8, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, color: "#16a34a" }}>
                  ✓ Entity logo will be used automatically. Upload here only to override with a different image for this series.
                </div>
              )}
              <MediaUpload
                value={form.logoUrl ?? ""}
                onChange={(url) => setForm((p: any) => ({ ...p, logoUrl: url }))}
                mediaType="icon"
                aspectRatio="wide"
                maxSizeMB={5}
              />
              {form.logoUrl && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ padding: "8px 16px", background: "#1a1614", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={form.logoUrl} alt="Logo preview" style={{ maxHeight: 32, maxWidth: 120, objectFit: "contain" }} />
                  </div>
                  <div style={{ padding: "8px 16px", background: "white", border: "1px solid #e5e0d8", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={form.logoUrl} alt="Logo preview" style={{ maxHeight: 32, maxWidth: 120, objectFit: "contain" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>Preview on dark & light</div>
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Website URL</label>
              <input value={form.websiteUrl} onChange={(e) => setForm((p: any) => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://…" style={inpStyle} />
            </div>
            <div>
              <label style={labelStyle}>Display Name Override</label>
              <input value={form.displayNameOverride} onChange={(e) => setForm((p: any) => ({ ...p, displayNameOverride: e.target.value }))} placeholder="Leave blank to use entity name" style={inpStyle} />
            </div>
            <div>
              <label style={labelStyle}>Sort Order</label>
              <input type="number" value={form.sortOrder} onChange={(e) => setForm((p: any) => ({ ...p, sortOrder: +e.target.value }))} style={inpStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Placement Visibility</label>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {PLACEMENT_TOGGLES.map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!form[key]} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Internal Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inpStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={addOrUpdate}
              disabled={saving || !form.entityId || !form.tierId}
              className="btn btn-primary"
              style={{ padding: "12px 28px", fontSize: 14 }}
            >
              {saving ? "Saving…" : editId ? "Update Assignment" : "✓ Add Sponsor"}
            </button>
            <button onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }} className="btn btn-ghost">Cancel</button>
            {(!form.entityId || !form.tierId) && (
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 500 }}>
                {!form.entityId ? "← Select a Brand first" : "← Select a Tier to enable"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Preview panel */}
      {showPreview && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {SURFACES.map((s) => (
              <button
                key={s.id}
                onClick={() => setPreviewSurface(s.id)}
                style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: "none",
                  background: previewSurface === s.id ? "#1a1614" : "#f0ede8",
                  color: previewSurface === s.id ? "white" : "#6b7280",
                  fontWeight: previewSurface === s.id ? 600 : 400,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <SponsorPlacementPreview data={previewData} surface={previewSurface} />
        </div>
      )}

      {/* Assignment list grouped by tier */}
      {assignments.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "#9ca3af", border: "1px dashed #e5e0d8", borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>No sponsors assigned yet.</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Add your first sponsor to this series.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {grouped.map(({ tier, items }) => (
            <div key={tier.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9ca3af" }}>{tier.label}</span>
                <div style={{ flex: 1, height: 1, background: "#e5e0d8" }} />
                <span style={{ fontSize: 11, color: "#d1cdc7" }}>Order {tier.displayOrder}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((a: any) => (
                  <div key={a.id} style={{
                    background: "white",
                    border: "1px solid #e5e0d8",
                    borderRadius: 10,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    opacity: a.isActive ? 1 : 0.55,
                  }}>
                    {/* Logo preview */}
                    <div style={{ width: 48, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#fafaf9", borderRadius: 6, border: "1px solid #f0ede8" }}>
                      {a.logoUrl || a.entity?.logoUrl
                        ? <img src={a.logoUrl || a.entity?.logoUrl} alt="" style={{ maxHeight: 28, maxWidth: 44, objectFit: "contain" }} />
                        : <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>LOGO</span>}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1614" }}>
                        {a.displayNameOverride || a.entity?.displayName}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        {[
                          { show: a.showOnEventPage, label: "Page" },
                          { show: a.showOnTicket, label: "Ticket" },
                          { show: a.showOnEmail, label: "Email" },
                          { show: a.showOnCheckInView, label: "Check-In" },
                        ].map(({ show, label }) => (
                          <span key={label} style={{
                            fontSize: 10, padding: "2px 7px", borderRadius: 10,
                            background: show ? "#dcfce7" : "#f0ede8",
                            color: show ? "#16a34a" : "#9ca3af",
                            fontWeight: 600,
                          }}>{label}</span>
                        ))}
                      </div>
                    </div>
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => toggleActive(a)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e0d8", background: "white", cursor: "pointer", color: "#6b7280" }}>
                        {a.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => startEdit(a)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e0d8", background: "white", cursor: "pointer", color: "#374151" }}>Edit</button>
                      <button onClick={() => remove(a.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "white", cursor: "pointer", color: "#dc2626" }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Unassigned tier slots */}
          {tiers.filter((t: any) => !assignments.some((a) => a.tierId === t.id)).length > 0 && (
            <div style={{ padding: "16px 20px", border: "1px dashed #e5e0d8", borderRadius: 10, color: "#9ca3af", fontSize: 13 }}>
              Empty tiers: {tiers.filter((t: any) => !assignments.some((a) => a.tierId === t.id)).map((t: any) => t.label).join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
