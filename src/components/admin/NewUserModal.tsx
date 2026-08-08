"use client";

import { useState } from "react";

const ALL_ROLES = [
  "VISITOR", "ATTENDEE", "INFLUENCER", "PARTNER", "INVESTOR",
  "REFERRER", "STAFF_OKU", "STAFF_CATCH",
  "FB_DIRECTOR", "RESTAURANT_SUPERVISOR", "ADMIN_IR", "ADMIN_HR", "SUPERADMIN",
];

const REFERRER_TYPES = [
  { value: "STREETSIDE_HOST",  label: "Streetside Host" },
  { value: "TAXI_DRIVER",      label: "Taxi Driver" },
  { value: "TOUR_GUIDE",       label: "Tour Guide" },
  { value: "HOTEL_CONCIERGE",  label: "Hotel Concierge" },
  { value: "PARTNER",          label: "Partner" },
];

const ROLE_LABELS: Record<string, string> = {
  VISITOR:               "Visitor",
  ATTENDEE:              "Attendee",
  INFLUENCER:            "Influencer",
  PARTNER:               "Partner",
  INVESTOR:              "Investor",
  REFERRER:              "Referrer (commercial)",
  STAFF_OKU:             "Staff — OKÜ",
  STAFF_CATCH:           "Staff — CATCH",
  FB_DIRECTOR:           "F&B Director",
  RESTAURANT_SUPERVISOR: "Restaurant Supervisor",
  ADMIN_IR:              "Admin — IR",
  ADMIN_HR:              "Admin — HR",
  SUPERADMIN:            "Superadmin",
};

type Props = {
  onClose: () => void;
  onCreated: (user: any) => void;
};

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid #e0d9d3",
  borderRadius: 8, fontSize: 14, background: "#fff", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.07em", color: "#7d7269", marginBottom: 5,
};

export default function NewUserModal({ onClose, onCreated }: Props) {
  const [name,             setName]             = useState("");
  const [email,            setEmail]            = useState("");
  const [phone,            setPhone]            = useState("");
  const [initialRole,      setInitialRole]      = useState("ATTENDEE");
  const [referrerType,     setReferrerType]     = useState("STREETSIDE_HOST");
  const [organizationName, setOrganizationName] = useState("");
  const [referrerPhone,    setReferrerPhone]    = useState("");
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState<string | null>(null);

  const isReferrer = initialRole === "REFERRER";

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:             name.trim() || null,
          email:            email.trim(),
          phone:            phone.trim() || null,
          initialRole,
          referrerType:     isReferrer ? referrerType : undefined,
          organizationName: isReferrer ? organizationName.trim() || null : undefined,
          referrerPhone:    isReferrer ? referrerPhone.trim() || null  : undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to create user");
      onCreated(json.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", overflow: "auto", padding: "28px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22 }}>New User</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#7d7269" }}>Create a platform account manually</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#7d7269" }}>×</button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Full Name</label>
          <input style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Juan García" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email *</label>
          <input style={fieldStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Phone</label>
          <input style={fieldStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+507 6200 0000" />
        </div>

        <div style={{ marginBottom: isReferrer ? 20 : 24 }}>
          <label style={labelStyle}>Initial Role *</label>
          <select style={fieldStyle} value={initialRole} onChange={e => setInitialRole(e.target.value)}>
            {ALL_ROLES.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
            ))}
          </select>
        </div>

        {isReferrer && (
          <div style={{ background: "#faf8f6", border: "1px solid #e8e2dd", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7d7269", marginBottom: 14 }}>
              Referrer Details
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Referrer Type *</label>
              <select style={fieldStyle} value={referrerType} onChange={e => setReferrerType(e.target.value)}>
                {REFERRER_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Organization / Employer</label>
              <input style={fieldStyle} value={organizationName} onChange={e => setOrganizationName(e.target.value)} placeholder="e.g. Las Clementinas Hotel" />
            </div>

            <div>
              <label style={labelStyle}>Referrer Phone (if different)</label>
              <input style={fieldStyle} type="tel" value={referrerPhone} onChange={e => setReferrerPhone(e.target.value)} placeholder="+507 6200 0000" />
            </div>

            <div style={{ marginTop: 12, padding: "8px 12px", background: "#fff", borderRadius: 8, border: "1px solid #e8e2dd", fontSize: 12, color: "#7d7269" }}>
              A unique referral code will be generated automatically. You can assign a compensation plan from the user's profile after creation.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "10px 20px", background: "#faf8f6", border: "1px solid #e8e2dd", borderRadius: 8, cursor: "pointer", fontSize: 14 }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !email.trim()}
            style={{ padding: "10px 24px", background: "#1a1614", color: "#fff", border: "none", borderRadius: 8, cursor: saving || !email.trim() ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, opacity: saving || !email.trim() ? 0.6 : 1 }}
          >
            {saving ? "Creating…" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}
