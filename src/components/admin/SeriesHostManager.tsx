"use client";

import { useEffect, useState, useCallback } from "react";

interface Entity {
  id: string;
  type: "PERSON" | "COMPANY";
  displayName: string;
  logoUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  linkedInfluencerProfile: { id: string; handle: string | null; refCode: string; commissionRateBps: number; profileImageUrl: string | null } | null;
  linkedUser: { id: string; name: string | null; email: string } | null;
}

interface SeriesHost {
  id: string;
  role: string;
  isFrontFacing: boolean;
  commissionShareBps: number | null;
  sortOrder: number;
  entity: Entity;
}

const ROLE_LABELS: Record<string, string> = {
  PRIMARY_HOST:  "Primary Host",
  CO_HOST:       "Co-Host",
  SPONSOR:       "Sponsor",
  BRAND_PARTNER: "Brand Partner",
};

const ROLE_COLORS: Record<string, string> = {
  PRIMARY_HOST:  "#1a1614",
  CO_HOST:       "#4a7c59",
  SPONSOR:       "#8b5e3c",
  BRAND_PARTNER: "#5a4a7c",
};

interface Props {
  seriesId: string;
}

export default function SeriesHostManager({ seriesId }: Props) {
  const [hosts, setHosts]         = useState<SeriesHost[]>([]);
  const [entities, setEntities]   = useState<Entity[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [showAddHost, setShowAddHost] = useState(false);
  const [showNewEntity, setShowNewEntity] = useState(false);
  const [entitySearch, setEntitySearch] = useState("");
  const [editingHostId, setEditingHostId] = useState<string | null>(null);

  const [addForm, setAddForm] = useState({
    entityId: "",
    role: "PRIMARY_HOST",
    isFrontFacing: true,
    commissionShareBps: "",
    sortOrder: "0",
  });

  const [newEntityForm, setNewEntityForm] = useState({
    type: "PERSON",
    displayName: "",
    description: "",
    websiteUrl: "",
    instagramUrl: "",
    logoUrl: "",
    linkedInfluencerProfileId: "",
  });

  const loadHosts = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/series/${seriesId}/hosts`);
    const data = await res.json();
    if (data.ok) setHosts(data.hosts);
    setLoading(false);
  }, [seriesId]);

  const loadEntities = useCallback(async (q = "") => {
    const res = await fetch(`/api/v1/admin/entities?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (data.ok) setEntities(data.entities);
  }, []);

  useEffect(() => { loadHosts(); loadEntities(); }, [loadHosts, loadEntities]);

  const filteredEntities = entities.filter(
    (e) => !hosts.some((h) => h.entity.id === e.id)
  );

  async function addHost() {
    if (!addForm.entityId) { setError("Select an entity first"); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/v1/admin/series/${seriesId}/hosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityId:           addForm.entityId,
        role:               addForm.role,
        isFrontFacing:      addForm.isFrontFacing,
        commissionShareBps: addForm.commissionShareBps ? Math.round(Number(addForm.commissionShareBps) * 100) : null,
        sortOrder:          Number(addForm.sortOrder),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      await loadHosts();
      setShowAddHost(false);
      setAddForm({ entityId: "", role: "PRIMARY_HOST", isFrontFacing: true, commissionShareBps: "", sortOrder: "0" });
    } else {
      setError(data.error ?? "Failed to add host");
    }
  }

  async function createEntity() {
    if (!newEntityForm.displayName.trim()) { setError("Display name required"); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/v1/admin/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:                      newEntityForm.type,
        displayName:               newEntityForm.displayName.trim(),
        description:               newEntityForm.description || null,
        websiteUrl:                newEntityForm.websiteUrl  || null,
        instagramUrl:              newEntityForm.instagramUrl || null,
        logoUrl:                   newEntityForm.logoUrl     || null,
        linkedInfluencerProfileId: newEntityForm.linkedInfluencerProfileId || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      await loadEntities();
      setAddForm((f) => ({ ...f, entityId: data.entity.id }));
      setShowNewEntity(false);
      setNewEntityForm({ type: "PERSON", displayName: "", description: "", websiteUrl: "", instagramUrl: "", logoUrl: "", linkedInfluencerProfileId: "" });
    } else {
      setError(data.error ?? "Failed to create entity");
    }
  }

  async function updateHost(hostId: string, patch: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch(`/api/v1/admin/series/${seriesId}/hosts/${hostId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (res.ok) await loadHosts();
  }

  async function removeHost(hostId: string) {
    if (!confirm("Remove this host from the series?")) return;
    await fetch(`/api/v1/admin/series/${seriesId}/hosts/${hostId}`, { method: "DELETE" });
    await loadHosts();
  }

  if (loading) return <div className="loading-dots"><span /><span /><span /></div>;

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Existing hosts */}
      {hosts.length === 0 ? (
        <div className="empty-state" style={{ padding: "32px 0" }}>
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">No hosts assigned</div>
          <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
            Add entities as hosts — persons or companies can be primary hosts, co-hosts, sponsors, or brand partners.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {hosts.map((h) => (
            <div key={h.id} className="card" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                  {h.entity.logoUrl ? (
                    <img src={h.entity.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: h.entity.type === "COMPANY" ? "#e8f0e8" : "#f0e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                      {h.entity.type === "COMPANY" ? "🏢" : "👤"}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{h.entity.displayName}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className="badge" style={{ background: ROLE_COLORS[h.role], color: "#fff", fontSize: 11 }}>
                        {ROLE_LABELS[h.role]}
                      </span>
                      {h.isFrontFacing && (
                        <span className="badge badge-success" style={{ fontSize: 11 }}>Front-facing</span>
                      )}
                      {h.entity.linkedInfluencerProfile && (
                        <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                          {h.entity.linkedInfluencerProfile.handle ?? h.entity.linkedInfluencerProfile.refCode}
                        </span>
                      )}
                      {h.commissionShareBps != null && (
                        <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                          {(h.commissionShareBps / 100).toFixed(1)}% commission share
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditingHostId(editingHostId === h.id ? null : h.id)}
                  >
                    Edit
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }} onClick={() => removeHost(h.id)}>
                    Remove
                  </button>
                </div>
              </div>

              {editingHostId === h.id && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-border)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Role</label>
                    <select className="form-select" value={h.role} onChange={(e) => updateHost(h.id, { role: e.target.value })}>
                      {Object.entries(ROLE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Commission share (%)</label>
                    <div style={{ position: "relative" }}>
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        placeholder="e.g. 12"
                        style={{ paddingRight: 32 }}
                        defaultValue={h.commissionShareBps != null ? h.commissionShareBps / 100 : ""}
                        onBlur={(e) => updateHost(h.id, { commissionShareBps: e.target.value ? Math.round(Number(e.target.value) * 100) : null })}
                      />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--color-text-muted)", pointerEvents: "none" }}>%</span>
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0, display: "flex", alignItems: "flex-end" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", paddingBottom: 6 }}>
                      <input type="checkbox" checked={h.isFrontFacing} onChange={(e) => updateHost(h.id, { isFrontFacing: e.target.checked })} />
                      <span className="form-label" style={{ margin: 0 }}>Front-facing (displayed publicly)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add host button / form */}
      {!showAddHost ? (
        <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddHost(true); loadEntities(); }}>
          + Add Host
        </button>
      ) : (
        <div className="card" style={{ padding: 20, borderStyle: "dashed" }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Add Host to Series</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 12 }}>
            <div>
              <input
                className="form-input"
                placeholder="Search entities by name…"
                value={entitySearch}
                onChange={(e) => { setEntitySearch(e.target.value); loadEntities(e.target.value); }}
              />
              {entitySearch && filteredEntities.length > 0 && (
                <div className="card" style={{ maxHeight: 200, overflowY: "auto", marginTop: 4, padding: 0 }}>
                  {filteredEntities.filter((e) => e.displayName.toLowerCase().includes(entitySearch.toLowerCase())).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => { setAddForm((f) => ({ ...f, entityId: e.id })); setEntitySearch(e.displayName); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}
                    >
                      <span>{e.type === "COMPANY" ? "🏢" : "👤"}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{e.displayName}</div>
                        {e.linkedInfluencerProfile && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{e.linkedInfluencerProfile.handle}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {addForm.entityId && (
                <div style={{ marginTop: 6, fontSize: 13, color: "var(--color-success)", fontWeight: 600 }}>
                  ✓ Selected: {entities.find((e) => e.id === addForm.entityId)?.displayName}
                </div>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ height: 40, whiteSpace: "nowrap" }} onClick={() => setShowNewEntity(!showNewEntity)}>
              + New Entity
            </button>
          </div>

          {showNewEntity && (
            <div style={{ background: "#f8f5f3", padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Create New Entity</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Type</label>
                  <select className="form-select" value={newEntityForm.type} onChange={(e) => setNewEntityForm((f) => ({ ...f, type: e.target.value }))}>
                    <option value="PERSON">Person</option>
                    <option value="COMPANY">Company</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Display Name *</label>
                  <input className="form-input" value={newEntityForm.displayName} onChange={(e) => setNewEntityForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="e.g. Sophia Laurent" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Website</label>
                  <input className="form-input" value={newEntityForm.websiteUrl} onChange={(e) => setNewEntityForm((f) => ({ ...f, websiteUrl: e.target.value }))} placeholder="https://..." />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Instagram</label>
                  <input className="form-input" value={newEntityForm.instagramUrl} onChange={(e) => setNewEntityForm((f) => ({ ...f, instagramUrl: e.target.value }))} placeholder="https://instagram.com/..." />
                </div>
                <div className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={2} value={newEntityForm.description} onChange={(e) => setNewEntityForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={createEntity}>Create Entity</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowNewEntity(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Role</label>
              <select className="form-select" value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}>
                {Object.entries(ROLE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Commission share (%)</label>
              <div style={{ position: "relative" }}>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="e.g. 12"
                  style={{ paddingRight: 32 }}
                  value={addForm.commissionShareBps}
                  onChange={(e) => setAddForm((f) => ({ ...f, commissionShareBps: e.target.value }))}
                />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--color-text-muted)", pointerEvents: "none" }}>%</span>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0, display: "flex", alignItems: "flex-end" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", paddingBottom: 6 }}>
                <input type="checkbox" checked={addForm.isFrontFacing} onChange={(e) => setAddForm((f) => ({ ...f, isFrontFacing: e.target.checked }))} />
                <span className="form-label" style={{ margin: 0 }}>Front-facing</span>
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={saving || !addForm.entityId} onClick={addHost}>
              {saving ? "Adding…" : "Add Host"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddHost(false); setEntitySearch(""); setAddForm({ entityId: "", role: "PRIMARY_HOST", isFrontFacing: true, commissionShareBps: "", sortOrder: "0" }); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Info note */}
      {hosts.length > 0 && (
        <div style={{ marginTop: 20, padding: "12px 16px", background: "#f8f5f3", borderRadius: 8, fontSize: 13, color: "var(--color-text-muted)" }}>
          <strong>Front-facing</strong> hosts appear publicly on event pages and marketing materials.
          Sessions inherit these hosts by default, but each session can override with its own host list.
        </div>
      )}
    </div>
  );
}
