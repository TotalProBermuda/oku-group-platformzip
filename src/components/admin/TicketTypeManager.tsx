"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

interface TicketType {
  id: string;
  name: string;
  description: string | null;
  tierCode: string | null;
  priceCents: number;
  currency: string;
  maxPerOrder: number;
  minPerOrder: number;
  typeCapacity: number | null;
  soldCount: number;
  displayOrder: number;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  visibilityMode: string;
  requiresMembership: boolean;
  earlyAccessOnly: boolean;
  ticketStatus: string;
}

const BLANK: Partial<TicketType> = {
  name: "",
  description: "",
  tierCode: "",
  priceCents: 0,
  currency: "USD",
  maxPerOrder: 10,
  minPerOrder: 1,
  typeCapacity: undefined,
  displayOrder: 0,
  saleStartsAt: null,
  saleEndsAt: null,
  visibilityMode: "VISIBLE",
  requiresMembership: false,
  earlyAccessOnly: false,
  ticketStatus: "ACTIVE",
};

const VISIBILITY_OPTIONS = ["VISIBLE", "HIDDEN", "MEMBERS_ONLY", "NEWSLETTER_ONLY", "INVITE_ONLY"];
const STATUS_OPTIONS = ["DRAFT", "ACTIVE", "INACTIVE", "SOLD_OUT"];

const pill = (color: string) => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 600,
  background: color === "green" ? "#dcfce7" : color === "yellow" ? "#fef9c3" : color === "red" ? "#fee2e2" : "#f3f4f6",
  color: color === "green" ? "#15803d" : color === "yellow" ? "#854d0e" : color === "red" ? "#b91c1c" : "#6b7280",
});

function statusColor(s: string) {
  if (s === "ACTIVE") return "green";
  if (s === "DRAFT") return "yellow";
  if (s === "SOLD_OUT" || s === "INACTIVE") return "red";
  return "grey";
}

export default function TicketTypeManager({ seriesId }: { seriesId: string }) {
  const t = useTranslation();
  const [items, setItems] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<TicketType> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/experiences/${seriesId}/ticket-types`);
    const data = await res.json();
    setItems(data.ticketTypes ?? []);
    setLoading(false);
  }, [seriesId]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing({ ...BLANK });
    setEditingId(null);
    setError("");
  }

  function openEdit(tt: TicketType) {
    setEditing({
      ...tt,
      saleStartsAt: tt.saleStartsAt ? tt.saleStartsAt.slice(0, 16) : "",
      saleEndsAt: tt.saleEndsAt ? tt.saleEndsAt.slice(0, 16) : "",
    });
    setEditingId(tt.id);
    setError("");
  }

  function cancel() {
    setEditing(null);
    setEditingId(null);
    setError("");
  }

  function set(key: string, value: any) {
    setEditing((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError("");

    const payload = {
      ...editing,
      priceCents: Math.round((Number(editing.priceCents) || 0)),
      typeCapacity: editing.typeCapacity ? Number(editing.typeCapacity) : null,
      saleStartsAt: editing.saleStartsAt || null,
      saleEndsAt: editing.saleEndsAt || null,
    };

    const url = editingId
      ? `/api/v1/admin/experiences/${seriesId}/ticket-types/${editingId}`
      : `/api/v1/admin/experiences/${seriesId}/ticket-types`;
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Save failed");
    } else {
      setEditing(null);
      setEditingId(null);
      await load();
    }
    setSaving(false);
  }

  async function deleteTicketType(id: string) {
    setSaving(true);
    setError("");
    const res = await fetch(
      `/api/v1/admin/experiences/${seriesId}/ticket-types/${id}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Delete failed");
    } else {
      setDeletingId(null);
      await load();
    }
    setSaving(false);
  }

  const inputStyle = {
    width: "100%",
    padding: "9px 12px",
    border: "1px solid #e5e0d8",
    borderRadius: 8,
    fontSize: 14,
    background: "white",
    boxSizing: "border-box" as const,
  };

  const labelStyle = {
    display: "block",
    fontSize: 11,
    fontWeight: 600 as const,
    color: "#374151",
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  };

  if (loading) {
    return <p style={{ color: "#9ca3af", fontSize: 14 }}>{t("admin", "loading") ?? "Loading…"}</p>;
  }

  return (
    <div>
      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#b91c1c", fontSize: 14 }}>
          {error}
        </div>
      )}

      {!editing && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
              {items.length === 0
                ? (t("admin", "no_ticket_types") ?? "No ticket types yet. Create one to enable ticket sales.")
                : `${items.length} ticket type${items.length !== 1 ? "s" : ""}`}
            </p>
            <button
              onClick={openNew}
              style={{ padding: "9px 20px", background: "#1a1614", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              + {t("admin", "add_ticket_type") ?? "Add Ticket Type"}
            </button>
          </div>

          {items.map((tt) => (
            <div
              key={tt.id}
              style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: "#1a1614", fontSize: 16 }}>{tt.name}</span>
                    <span style={pill(statusColor(tt.ticketStatus))}>{t("admin", `status.${tt.ticketStatus}`) ?? tt.ticketStatus}</span>
                    {tt.requiresMembership && <span style={pill("red")}>{t("admin", "members_only") ?? "Members Only"}</span>}
                    {tt.earlyAccessOnly && <span style={pill("yellow")}>{t("admin", "early_access") ?? "Early Access"}</span>}
                  </div>
                  {tt.description && (
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 6px" }}>{tt.description}</p>
                  )}
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" as const, fontSize: 13, color: "#9ca3af" }}>
                    <span><strong style={{ color: "#1a1614" }}>${(tt.priceCents / 100).toFixed(2)}</strong> {tt.currency}</span>
                    {tt.tierCode && <span>Tier: <strong style={{ color: "#1a1614" }}>{tt.tierCode}</strong></span>}
                    <span>Cap: <strong style={{ color: "#1a1614" }}>{tt.typeCapacity ?? "∞"}</strong></span>
                    <span>Sold: <strong style={{ color: tt.soldCount > 0 ? "#1a1614" : "#9ca3af" }}>{tt.soldCount}</strong></span>
                    <span>Per order: {tt.minPerOrder}–{tt.maxPerOrder}</span>
                    <span>Visibility: {tt.visibilityMode}</span>
                    {tt.displayOrder > 0 && <span>Order: {tt.displayOrder}</span>}
                  </div>
                  {(tt.saleStartsAt || tt.saleEndsAt) && (
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                      Sale: {tt.saleStartsAt ? new Date(tt.saleStartsAt).toLocaleString() : "now"} → {tt.saleEndsAt ? new Date(tt.saleEndsAt).toLocaleString() : "∞"}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => openEdit(tt)}
                    style={{ padding: "7px 14px", background: "#f9f7f5", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#1a1614" }}
                  >
                    {t("admin", "edit") ?? "Edit"}
                  </button>
                  {tt.soldCount === 0 ? (
                    <button
                      onClick={() => setDeletingId(tt.id)}
                      style={{ padding: "7px 14px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#b91c1c" }}
                    >
                      {t("admin", "delete") ?? "Delete"}
                    </button>
                  ) : (
                    <span style={{ padding: "7px 14px", fontSize: 12, color: "#9ca3af" }}>Has tickets</span>
                  )}
                </div>
              </div>

              {deletingId === tt.id && (
                <div style={{ marginTop: 16, padding: "14px 16px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8 }}>
                  <p style={{ margin: "0 0 12px", fontSize: 14, color: "#9a3412" }}>
                    {t("admin", "confirm_delete_ticket_type") ?? `Delete "${tt.name}"? This cannot be undone.`}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => deleteTicketType(tt.id)}
                      disabled={saving}
                      style={{ padding: "7px 16px", background: "#dc2626", color: "white", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}
                    >
                      {saving ? "Deleting…" : (t("admin", "confirm_delete") ?? "Yes, Delete")}
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      style={{ padding: "7px 16px", background: "white", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                    >
                      {t("admin", "cancel") ?? "Cancel"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {editing && (
        <div style={{ background: "#f9f7f5", border: "1px solid #e5e0d8", borderRadius: 14, padding: 24 }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginTop: 0, marginBottom: 24, color: "#1a1614" }}>
            {editingId ? (t("admin", "edit_ticket_type") ?? "Edit Ticket Type") : (t("admin", "new_ticket_type") ?? "New Ticket Type")}
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>{t("admin", "name") ?? "Name"} *</label>
              <input style={inputStyle} value={editing.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. General Admission" />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>{t("admin", "description") ?? "Description"}</label>
              <textarea rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} value={editing.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Optional description shown to buyers" />
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "price") ?? "Price"} (in cents) *</label>
              <input type="number" min={0} style={inputStyle} value={editing.priceCents ?? 0} onChange={(e) => set("priceCents", e.target.value)} placeholder="e.g. 2500 = $25.00" />
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0" }}>
                ${((Number(editing.priceCents) || 0) / 100).toFixed(2)} {editing.currency ?? "USD"}
              </p>
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "currency") ?? "Currency"}</label>
              <select style={inputStyle} value={editing.currency ?? "USD"} onChange={(e) => set("currency", e.target.value)}>
                {["USD", "EUR", "GBP", "PAB"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "tier_code") ?? "Tier Code"}</label>
              <input style={inputStyle} value={editing.tierCode ?? ""} onChange={(e) => set("tierCode", e.target.value)} placeholder="e.g. VIP, GA, TABLE" />
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "capacity") ?? "Capacity"} (blank = unlimited)</label>
              <input type="number" min={0} style={inputStyle} value={editing.typeCapacity ?? ""} onChange={(e) => set("typeCapacity", e.target.value || null)} placeholder="Leave blank for unlimited" />
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "min_per_order") ?? "Min Per Order"}</label>
              <input type="number" min={1} style={inputStyle} value={editing.minPerOrder ?? 1} onChange={(e) => set("minPerOrder", e.target.value)} />
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "max_per_order") ?? "Max Per Order"}</label>
              <input type="number" min={1} style={inputStyle} value={editing.maxPerOrder ?? 10} onChange={(e) => set("maxPerOrder", e.target.value)} />
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "display_order") ?? "Display Order"}</label>
              <input type="number" style={inputStyle} value={editing.displayOrder ?? 0} onChange={(e) => set("displayOrder", e.target.value)} />
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "ticket_status") ?? "Status"}</label>
              <select style={inputStyle} value={editing.ticketStatus ?? "ACTIVE"} onChange={(e) => set("ticketStatus", e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t("admin", `status.${s}`) ?? s}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "visibility") ?? "Visibility"}</label>
              <select style={inputStyle} value={editing.visibilityMode ?? "VISIBLE"} onChange={(e) => set("visibilityMode", e.target.value)}>
                {VISIBILITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "sale_starts") ?? "Sale Opens"}</label>
              <input type="datetime-local" style={inputStyle} value={editing.saleStartsAt ?? ""} onChange={(e) => set("saleStartsAt", e.target.value || null)} />
            </div>

            <div>
              <label style={labelStyle}>{t("admin", "sale_ends") ?? "Sale Closes"}</label>
              <input type="datetime-local" style={inputStyle} value={editing.saleEndsAt ?? ""} onChange={(e) => set("saleEndsAt", e.target.value || null)} />
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 24 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                <input type="checkbox" checked={Boolean(editing.requiresMembership)} onChange={(e) => set("requiresMembership", e.target.checked)} style={{ width: 16, height: 16 }} />
                {t("admin", "requires_membership") ?? "Requires Membership"}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                <input type="checkbox" checked={Boolean(editing.earlyAccessOnly)} onChange={(e) => set("earlyAccessOnly", e.target.checked)} style={{ width: 16, height: 16 }} />
                {t("admin", "early_access_only") ?? "Early Access Only"}
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              onClick={save}
              disabled={saving || !editing.name}
              style={{ padding: "10px 28px", background: "#1a1614", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving || !editing.name ? 0.6 : 1 }}
            >
              {saving ? (t("admin", "saving") ?? "Saving…") : (editingId ? (t("admin", "save_changes") ?? "Save Changes") : (t("admin", "create_ticket_type") ?? "Create Ticket Type"))}
            </button>
            <button
              onClick={cancel}
              disabled={saving}
              style={{ padding: "10px 20px", background: "white", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, cursor: "pointer" }}
            >
              {t("admin", "cancel") ?? "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
