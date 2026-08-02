"use client";

import { useState } from "react";
import { X, Users, Building2, ChevronRight, Check } from "lucide-react";
import { useTranslation } from "@/components/i18n/LocaleProvider";

const CATEGORY_OPTIONS = [
  { value: "host",         label: "Host" },
  { value: "mc",           label: "MC" },
  { value: "presenter",   label: "Presenter" },
  { value: "partner",     label: "Partner" },
  { value: "influencer",  label: "Influencer" },
  { value: "referrer",    label: "Referrer" },
  { value: "sponsor",     label: "Sponsor" },
  { value: "brand",       label: "Brand" },
  { value: "staff_contact", label: "Staff Contact" },
  { value: "general",    label: "General" },
];

type Step = 1 | 2 | 3 | 4;

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

interface FormState {
  profileType: "PERSON" | "COMPANY";
  displayName: string;
  primaryCategory: string;
  bio: string;
  email: string;
  phone: string;
  publicVisible: boolean;
  compensationEligible: boolean;
  assignableToSeries: boolean;
  status: string;
}

export default function CreateProfileModal({ onClose, onCreated }: Props) {
  const t = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>({
    profileType: "PERSON",
    displayName: "",
    primaryCategory: "",
    bio: "",
    email: "",
    phone: "",
    publicVisible: false,
    compensationEligible: false,
    assignableToSeries: true,
    status: "ACTIVE",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const canAdvance = () => {
    if (step === 1) return true;
    if (step === 2) return form.displayName.trim().length > 0;
    return true;
  };

  const handleSubmit = async () => {
    if (!form.displayName.trim()) { setError("Display name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/v1/admin/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          primaryCategory: form.primaryCategory || null,
          bio: form.bio || null,
          email: form.email || null,
          phone: form.phone || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create profile");
      onCreated(data.profile.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
      setSaving(false);
    }
  };

  const STEPS = ["Type", "Basic Info", "Options", "Done"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "white", borderRadius: 16, width: 520, maxWidth: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0, color: "#1a1614" }}>New Profile</h3>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><X size={18} /></button>
          </div>

          {/* Step indicators */}
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {STEPS.map((label, i) => {
              const n = (i + 1) as Step;
              const done = step > n;
              const active = step === n;
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: done ? "#c41e3a" : active ? "#1a1614" : "#f3f4f6", color: done || active ? "white" : "#9ca3af", transition: "all 0.2s" }}>
                      {done ? <Check size={12} /> : n}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: active ? "#1a1614" : "#9ca3af" }}>{label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: done ? "#c41e3a" : "#f3f4f6", margin: "0 8px", marginBottom: 16, transition: "background 0.2s" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div style={{ padding: "24px" }}>

          {step === 1 && (
            <div>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 20px" }}>
                What kind of profile are you creating?
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { value: "PERSON" as const, icon: <Users size={28} color={form.profileType === "PERSON" ? "#c41e3a" : "#9ca3af"} />, label: "Person", desc: "Individual — host, MC, presenter, influencer, referrer" },
                  { value: "COMPANY" as const, icon: <Building2 size={28} color={form.profileType === "COMPANY" ? "#c41e3a" : "#9ca3af"} />, label: "Company", desc: "Organization — brand, partner, sponsor, agency" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => set("profileType", opt.value)}
                    style={{
                      padding: "20px 16px", border: `2px solid ${form.profileType === opt.value ? "#c41e3a" : "#e5e0d8"}`,
                      borderRadius: 12, background: form.profileType === opt.value ? "#fff5f5" : "white",
                      cursor: "pointer", textAlign: "center", transition: "all 0.15s",
                    }}
                  >
                    <div style={{ marginBottom: 10 }}>{opt.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1614", marginBottom: 6 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.4 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="form-label">
                  {form.profileType === "COMPANY" ? "Company Name" : "Full Name"} *
                </label>
                <input
                  className="form-input" style={{ margin: 0 }}
                  placeholder={form.profileType === "COMPANY" ? "e.g. Bermuda Open" : "e.g. Marco Villanueva"}
                  value={form.displayName}
                  onChange={e => set("displayName", e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="form-label">Category</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CATEGORY_OPTIONS.map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => set("primaryCategory", form.primaryCategory === cat.value ? "" : cat.value)}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                        border: `1px solid ${form.primaryCategory === cat.value ? "#c41e3a" : "#e5e0d8"}`,
                        background: form.primaryCategory === cat.value ? "#c41e3a" : "white",
                        color: form.primaryCategory === cat.value ? "white" : "#374151",
                        transition: "all 0.12s",
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="form-label">Email</label>
                  <input className="form-input" style={{ margin: 0 }} type="email" value={form.email} onChange={e => set("email", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input className="form-input" style={{ margin: 0 }} type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
                </div>
              </div>

              <div>
                <label className="form-label">Short bio / description</label>
                <textarea
                  className="form-input" style={{ margin: 0, resize: "vertical", minHeight: 80, fontFamily: "inherit" }}
                  placeholder="A brief description shown publicly…"
                  value={form.bio}
                  onChange={e => set("bio", e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                Set operational options for this profile. All can be changed later.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { key: "assignableToSeries" as const, label: "Can be assigned to events", desc: "This profile can be added as a host, MC, or presenter to series and sessions" },
                  { key: "compensationEligible" as const, label: "Compensation eligible", desc: "Enable payout tracking and compensation plan assignment" },
                  { key: "publicVisible" as const, label: "Publicly visible", desc: "Show this profile on public-facing event pages" },
                ].map(opt => (
                  <label key={opt.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", border: `1px solid ${form[opt.key] ? "#c41e3a" : "#e5e0d8"}`, borderRadius: 10, cursor: "pointer", background: form[opt.key] ? "#fff5f5" : "white", transition: "all 0.12s" }}>
                    <input
                      type="checkbox"
                      checked={form[opt.key]}
                      onChange={e => set(opt.key, e.target.checked)}
                      style={{ marginTop: 2, accentColor: "#c41e3a" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1614" }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div>
                <label className="form-label">Initial Status</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["ACTIVE", "DRAFT"].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("status", s)}
                      style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${form.status === s ? "#1a1614" : "#e5e0d8"}`, background: form.status === s ? "#1a1614" : "white", color: form.status === s ? "white" : "#6b7280", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Check size={28} color="#16a34a" />
              </div>
              <h4 style={{ fontFamily: "var(--font-heading)", fontSize: 20, margin: "0 0 8px" }}>Ready to create</h4>
              <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 20px" }}>
                Creating a <strong>{form.profileType === "COMPANY" ? "Company" : "Person"}</strong> profile
                {form.primaryCategory ? ` as ${form.primaryCategory.replace(/_/g, " ")}` : ""}
                {form.displayName ? `: "${form.displayName}"` : ""}.
              </p>

              {[
                { label: "Assignable to events", value: form.assignableToSeries },
                { label: "Compensation eligible", value: form.compensationEligible },
                { label: "Publicly visible", value: form.publicVisible },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ color: "#6b7280" }}>{r.label}</span>
                  <span style={{ color: r.value ? "#16a34a" : "#9ca3af", fontWeight: 600 }}>{r.value ? "Yes" : "No"}</span>
                </div>
              ))}

              {error && <div className="alert-strip alert-strip-error" style={{ marginTop: 16 }}>{error}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f3f4f6", display: "flex", gap: 10, justifyContent: "space-between" }}>
          <button
            className="btn btn-ghost"
            onClick={step === 1 ? onClose : () => setStep(s => (s - 1) as Step)}
          >
            {step === 1 ? "Cancel" : "← Back"}
          </button>
          {step < 4 ? (
            <button
              className="btn btn-primary"
              onClick={() => setStep(s => (s + 1) as Step)}
              disabled={!canAdvance()}
            >
              Continue <ChevronRight size={14} />
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={saving}
              style={{ minWidth: 140 }}
            >
              {saving ? "Creating…" : "Create Profile"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
