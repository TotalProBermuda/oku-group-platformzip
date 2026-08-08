"use client";

import { useState, useEffect } from "react";

type Space = {
  id: string;
  venueId: string;
  name: string;
  capacity: number;
  reservable: boolean;
  requiresApproval: boolean;
  weatherSensitive: boolean;
  sortOrder: number;
  isActive: boolean;
  depositRequiredCents: number | null;
  venue: { id: string; name: string; slug: string };
  /** Active holds — partySize used for cover-accurate utilisation, not hold count */
  capacityHolds: { id: string; partySize: number }[];
};

type Venue = { id: string; name: string; slug: string };

export default function SpacesAdminPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const emptyForm = { venueId: "", name: "", capacity: 0, reservable: true, requiresApproval: false, weatherSensitive: false, sortOrder: 0 };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [sRes, vRes] = await Promise.all([
        fetch("/api/v1/admin/spaces"),
        fetch("/api/v1/admin/venues"),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        setSpaces(d.data ?? []);
      }
      if (vRes.ok) {
        const d = await vRes.json();
        setVenues(d.venues ?? d.data ?? []);
      }
    } catch {
      setError("Failed to load spaces");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.venueId || !form.name || form.capacity < 1) {
      setError("Venue, name, and a positive capacity are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, capacity: Number(form.capacity) }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to create"); return; }
      setSpaces(prev => [...prev, d.data]);
      setShowCreate(false);
      setForm(emptyForm);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/spaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to update"); return; }
      setSpaces(prev => prev.map(s => s.id === id ? { ...s, ...d.data } : s));
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Deactivate this space? Existing holds are preserved for history.")) return;
    await handleUpdate(id, { isActive: false });
  }

  async function handleReactivate(id: string) {
    await handleUpdate(id, { isActive: true });
  }

  // Group spaces by venue, preserving sort order from the API
  const venueGroups: { venue: { id: string; name: string; slug: string }; spaces: Space[] }[] = [];
  const seenVenueIds = new Set<string>();
  for (const space of spaces) {
    if (!seenVenueIds.has(space.venueId)) {
      seenVenueIds.add(space.venueId);
      venueGroups.push({ venue: space.venue, spaces: [] });
    }
    venueGroups.find(g => g.venue.id === space.venueId)!.spaces.push(space);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Restaurant Spaces</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Manage dining spaces and their capacity. Overlap-aware holds prevent overbooking.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); setError(null); setForm(emptyForm); }}
          style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          + Add Space
        </button>
      </div>

      {/* Guest-facing callout — explains the operational relationship */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#1e40af", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>ℹ️</span>
        <span>
          <strong>These spaces are the bookable options in the guest reservation form.</strong>{" "}
          When a guest scans a QR code, only <strong>active + reservable</strong> spaces appear.
          Deactivating or removing the reservable flag removes the space from the booking flow immediately.
        </span>
      </div>

      {error && (
        <div style={{ padding: "10px 16px", borderRadius: 8, background: "#fff1f2", border: "1px solid #fda4af", color: "#be123c", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>New Space</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Venue *</label>
              <select value={form.venueId} onChange={e => setForm(f => ({ ...f, venueId: e.target.value }))} style={inputStyle}>
                <option value="">Select venue…</option>
                {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Space Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. OKÜ Dining Room" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Capacity (covers) *</label>
              <input type="number" min={1} value={form.capacity || ""} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} placeholder="27" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Sort Order</label>
              <input type="number" min={0} value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
              <input type="checkbox" checked={form.reservable} onChange={e => setForm(f => ({ ...f, reservable: e.target.checked }))} /> Reservable
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
              <input type="checkbox" checked={form.requiresApproval} onChange={e => setForm(f => ({ ...f, requiresApproval: e.target.checked }))} /> Requires Approval
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
              <input type="checkbox" checked={form.weatherSensitive} onChange={e => setForm(f => ({ ...f, weatherSensitive: e.target.checked }))} /> Weather Sensitive
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={handleCreate} disabled={saving} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Creating…" : "Create Space"}
            </button>
            <button onClick={() => setShowCreate(false)} style={{ padding: "9px 16px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Loading spaces…</div>
      ) : (
        <div>
          {spaces.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>No spaces configured yet. Add one above.</div>
          )}
          {venueGroups.map(group => (
            <div key={group.venue.id} style={{ marginBottom: 28 }}>
              {venueGroups.length > 1 && (
                <h2 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px", paddingBottom: 6, borderBottom: "1.5px solid #f1f5f9" }}>
                  {group.venue.name}
                </h2>
              )}
              {group.spaces.map(space => (
                <SpaceRow
                  key={space.id}
                  space={space}
                  editing={editingId === space.id}
                  saving={saving}
                  onEdit={() => { setEditingId(space.id); setShowCreate(false); setError(null); }}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(patch) => handleUpdate(space.id, patch)}
                  onDeactivate={() => handleDeactivate(space.id)}
                  onReactivate={() => handleReactivate(space.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, color: "#0f172a", boxSizing: "border-box" };

function SpaceRow({
  space, editing, saving,
  onEdit, onCancelEdit, onSave, onDeactivate, onReactivate,
}: {
  space: Space; editing: boolean; saving: boolean;
  onEdit: () => void; onCancelEdit: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  onDeactivate: () => void; onReactivate: () => void;
}) {
  const [form, setForm] = useState({
    name: space.name,
    capacity: space.capacity,
    reservable: space.reservable,
    requiresApproval: space.requiresApproval,
    weatherSensitive: space.weatherSensitive,
    sortOrder: space.sortOrder,
  });

  if (editing) {
    return (
      <div style={{ background: "#f0f9ff", border: "1.5px solid #bae6fd", borderRadius: 12, padding: 20, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Capacity</label>
            <input type="number" min={1} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Sort Order</label>
            <input type="number" min={0} value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={form.reservable} onChange={e => setForm(f => ({ ...f, reservable: e.target.checked }))} /> Reservable
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={form.requiresApproval} onChange={e => setForm(f => ({ ...f, requiresApproval: e.target.checked }))} /> Requires Approval
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={form.weatherSensitive} onChange={e => setForm(f => ({ ...f, weatherSensitive: e.target.checked }))} /> Weather Sensitive
          </label>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => onSave(form)} disabled={saving} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onCancelEdit} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Utilisation measured in covers held, not number of holds.
  // A single party of 20 occupying a 42-cover terrace = 20/42 = 48%, not 1/42 = 2%.
  const heldCovers = space.capacityHolds.reduce((sum, h) => sum + h.partySize, 0);
  const utilPct = Math.min(100, Math.round((heldCovers / space.capacity) * 100));
  const isBookable = space.isActive && space.reservable;

  return (
    <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", marginBottom: 10, opacity: space.isActive ? 1 : 0.6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{space.name}</span>

            {/* Primary guest-visibility badge */}
            {isBookable ? (
              <span style={{ padding: "2px 9px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", whiteSpace: "nowrap" }}>
                ✓ Bookable by guests
              </span>
            ) : (
              <span style={{ padding: "2px 9px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                Not bookable
              </span>
            )}

            {!space.isActive && (
              <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "#94a3b8", color: "#fff" }}>INACTIVE</span>
            )}
            {space.weatherSensitive && (
              <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "#0ea5e9", color: "#fff" }}>☁ Weather</span>
            )}
            {space.requiresApproval && (
              <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "#7e22ce", color: "#fff" }}>✓ Approval</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#475569" }}>
              <strong style={{ color: "#0f172a" }}>{space.capacity}</strong> covers
            </span>
            <span style={{ fontSize: 12, color: "#64748b" }}>Sort: {space.sortOrder}</span>
            {heldCovers > 0 ? (
              <span style={{ fontSize: 12, color: "#059669" }}>
                {heldCovers}/{space.capacity} covers held ({space.capacityHolds.length} hold{space.capacityHolds.length !== 1 ? "s" : ""})
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>No active holds</span>
            )}
          </div>

          {/* Utilisation bar — width represents covers held / capacity */}
          <div style={{ marginTop: 8, maxWidth: 240 }}>
            <div style={{ height: 5, borderRadius: 99, background: "#f1f5f9", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${utilPct}%`,
                borderRadius: 99,
                background: utilPct > 80 ? "#ef4444" : utilPct > 50 ? "#f59e0b" : "#10b981",
                transition: "width 0.3s",
              }} />
            </div>
            {heldCovers > 0 && (
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{utilPct}% covers held</div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
          <button onClick={onEdit} style={{ padding: "6px 14px", borderRadius: 7, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Edit
          </button>
          {space.isActive ? (
            <button onClick={onDeactivate} style={{ padding: "6px 14px", borderRadius: 7, border: "1.5px solid #fda4af", background: "#fff", color: "#be123c", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Deactivate
            </button>
          ) : (
            <button onClick={onReactivate} style={{ padding: "6px 14px", borderRadius: 7, border: "1.5px solid #86efac", background: "#fff", color: "#15803d", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Reactivate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
