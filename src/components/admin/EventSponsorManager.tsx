"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";
import SponsorPlacementPreview from "@/components/sponsors/SponsorPlacementPreview";
import { mergeSponsors, resolveSponsors } from "@/lib/sponsor-render";
import MediaUpload from "@/components/ui/MediaUpload";
import type { ResolvedSponsors } from "@/lib/sponsor-render";

interface Props {
  sessionId: string;
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

export default function EventSponsorManager({ sessionId }: Props) {
  const t = useTranslation();
  const [eventAssignments, setEventAssignments] = useState<any[]>([]);
  const [seriesAssignments, setSeriesAssignments] = useState<any[]>([]);
  const [inherits, setInherits] = useState(true);
  const [tiers, setTiers] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [previewSurface, setPreviewSurface] = useState<PreviewSurface>("event_page");
  const [previewData, setPreviewData] = useState<ResolvedSponsors | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    entityId: "", tierId: "", sortOrder: 0, logoUrl: "", websiteUrl: "",
    displayNameOverride: "", showOnEventPage: true, showOnTicket: true,
    showOnEmail: true, showOnCheckInView: false, notes: "",
  });

  const load = useCallback(async () => {
    const [sRes, tRes, eRes] = await Promise.all([
      fetch(`/api/v1/admin/sessions/${sessionId}/sponsors`),
      fetch(`/api/v1/admin/sponsor-tiers`),
      fetch(`/api/v1/admin/entities`),
    ]);
    const [sData, tData, eData] = await Promise.all([sRes.json(), tRes.json(), eRes.json()]);
    setEventAssignments(sData.eventAssignments ?? []);
    setSeriesAssignments(sData.seriesAssignments ?? []);
    setInherits(sData.inheritsSeriesSponsors ?? true);
    setTiers(tData.tiers ?? []);
    setEntities(eData.entities ?? []);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const computePreview = useCallback((surface: PreviewSurface, ea: any[], sa: any[], inh: boolean) => {
    const merged = inh
      ? mergeSponsors(sa, ea, surface)
      : resolveSponsors(ea, surface, false);
    setPreviewData(merged);
  }, []);

  useEffect(() => {
    if (showPreview) computePreview(previewSurface, eventAssignments, seriesAssignments, inherits);
  }, [showPreview, previewSurface, eventAssignments, seriesAssignments, inherits, computePreview]);

  async function toggleInherit() {
    const next = !inherits;
    await fetch(`/api/v1/admin/sessions/${sessionId}/inherit-sponsors`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inheritsSeriesSponsors: next }),
    });
    setInherits(next);
    if (showPreview) computePreview(previewSurface, eventAssignments, seriesAssignments, next);
  }

  async function addOrUpdate() {
    setSaving(true);
    const url = editId
      ? `/api/v1/admin/sessions/${sessionId}/sponsors/${editId}`
      : `/api/v1/admin/sessions/${sessionId}/sponsors`;
    const method = editId ? "PATCH" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowAdd(false);
    setEditId(null);
    resetForm();
    setSaving(false);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this event-level sponsor?")) return;
    await fetch(`/api/v1/admin/sessions/${sessionId}/sponsors/${id}`, { method: "DELETE" });
    load();
  }

  function resetForm() {
    setForm({ entityId: "", tierId: "", sortOrder: 0, logoUrl: "", websiteUrl: "", displayNameOverride: "", showOnEventPage: true, showOnTicket: true, showOnEmail: true, showOnCheckInView: false, notes: "" });
  }

  function startEdit(a: any) {
    setEditId(a.id);
    setForm({
      entityId: a.entityId, tierId: a.tierId, sortOrder: a.sortOrder,
      logoUrl: a.logoUrl ?? "", websiteUrl: a.websiteUrl ?? "",
      displayNameOverride: a.displayNameOverride ?? "",
      showOnEventPage: a.showOnEventPage, showOnTicket: a.showOnTicket,
      showOnEmail: a.showOnEmail, showOnCheckInView: a.showOnCheckInView,
      notes: a.notes ?? "",
    });
    setShowAdd(true);
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}><div className="loading-spinner" style={{ margin: "0 auto" }} /></div>;

  const inpStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 };

  const allGrouped = tiers.map((tier: any) => ({
    tier,
    eventItems: eventAssignments.filter((a) => a.tierId === tier.id),
    seriesItems: seriesAssignments.filter((a) => a.tierId === tier.id),
  })).filter((g) => g.eventItems.length + (inherits ? g.seriesItems.length : 0) > 0);

  return (
    <div>
      {/* Inherit toggle */}
      <div style={{ background: inherits ? "#f0fdf4" : "#fafaf9", border: `1px solid ${inherits ? "#bbf7d0" : "#e5e0d8"}`, borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1614" }}>Inherit Series Sponsors</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 3 }}>
            {inherits ? `Showing ${seriesAssignments.length} inherited sponsor(s) from the series, plus any event-specific additions.` : "Using only event-specific sponsors. Series sponsors are hidden for this event."}
          </div>
        </div>
        <button onClick={toggleInherit} style={{
          padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
          background: inherits ? "#16a34a" : "#e5e0d8", color: inherits ? "white" : "#6b7280",
        }}>
          {inherits ? "Inheriting ✓" : "Not Inheriting"}
        </button>
      </div>

      {/* Header actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={() => { setEditId(null); resetForm(); setShowAdd(!showAdd); }} className="btn btn-primary" style={{ fontSize: 13 }}>
          {showAdd && !editId ? "Cancel" : "+ Add Event Sponsor"}
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
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1614", marginBottom: 20 }}>{editId ? "Edit Event Sponsor" : "Add Event-Specific Sponsor"}</h3>
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
              <MediaUpload
                value={form.logoUrl ?? ""}
                onChange={(url) => setForm((p: any) => ({ ...p, logoUrl: url }))}
                label="Sponsor Logo"
                mediaType="icon"
                aspectRatio="wide"
                maxSizeMB={5}
              />
            </div>
            <div>
              <label style={labelStyle}>Website URL</label>
              <input value={form.websiteUrl} onChange={(e) => setForm((p: any) => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://…" style={inpStyle} />
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
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={addOrUpdate} disabled={saving || !form.entityId || !form.tierId} className="btn btn-primary">
              {saving ? "Saving…" : editId ? "Update" : "Add Sponsor"}
            </button>
            <button onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Preview panel */}
      {showPreview && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {SURFACES.map((s) => (
              <button key={s.id} onClick={() => setPreviewSurface(s.id)} style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: "none",
                background: previewSurface === s.id ? "#1a1614" : "#f0ede8",
                color: previewSurface === s.id ? "white" : "#6b7280",
                fontWeight: previewSurface === s.id ? 600 : 400,
              }}>{s.label}</button>
            ))}
          </div>
          <SponsorPlacementPreview data={previewData} surface={previewSurface} />
        </div>
      )}

      {/* Grouped assignment view */}
      {allGrouped.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "#9ca3af", border: "1px dashed #e5e0d8", borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>No sponsors for this event.</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            {!inherits ? "Enable series inheritance or add event-specific sponsors above." : "No series sponsors are active. Add event-specific sponsors above."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {allGrouped.map(({ tier, eventItems, seriesItems }) => (
            <div key={tier.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9ca3af" }}>{tier.label}</span>
                <div style={{ flex: 1, height: 1, background: "#e5e0d8" }} />
              </div>

              {/* Inherited series sponsors */}
              {inherits && seriesItems.map((a: any) => (
                <div key={a.id} style={{ background: "#fafaf9", border: "1px solid #e5e0d8", borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, opacity: 0.75 }}>
                  <div style={{ width: 40, height: 30, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "white", borderRadius: 4, border: "1px solid #f0ede8" }}>
                    {a.logoUrl || a.entity?.logoUrl ? <img src={a.logoUrl || a.entity?.logoUrl} alt="" style={{ maxHeight: 22, objectFit: "contain" }} /> : <span style={{ fontSize: 8, color: "#9ca3af" }}>LOGO</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, color: "#6b7280" }}>{a.displayNameOverride || a.entity?.displayName}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "#9ca3af", background: "#e5e0d8", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>From Series</span>
                </div>
              ))}

              {/* Event-specific sponsors */}
              {eventItems.map((a: any) => (
                <div key={a.id} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 10, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 48, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#fafaf9", borderRadius: 6, border: "1px solid #f0ede8" }}>
                    {a.logoUrl || a.entity?.logoUrl ? <img src={a.logoUrl || a.entity?.logoUrl} alt="" style={{ maxHeight: 28, maxWidth: 44, objectFit: "contain" }} /> : <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>LOGO</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1614" }}>{a.displayNameOverride || a.entity?.displayName}</div>
                    <span style={{ fontSize: 10, color: "#16a34a", background: "#dcfce7", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Event-Specific</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => startEdit(a)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e0d8", background: "white", cursor: "pointer" }}>Edit</button>
                    <button onClick={() => remove(a.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "white", cursor: "pointer", color: "#dc2626" }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
