"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MediaUpload from "@/components/ui/MediaUpload";

const SOCIAL_FIELDS = [
  { key: "instagramUrl", label: "Instagram URL", placeholder: "https://instagram.com/@handle" },
  { key: "tiktokUrl",    label: "TikTok URL",    placeholder: "https://tiktok.com/@handle" },
  { key: "youtubeUrl",   label: "YouTube URL",   placeholder: "https://youtube.com/@handle" },
  { key: "websiteUrl",   label: "Website",       placeholder: "https://yourwebsite.com" },
];

const LANGUAGES = ["English", "Spanish", "French", "Portuguese", "Other"];

export default function InfluencerProfileEditorPage() {
  const [profile, setProfile] = useState<any>(null);
  const [form,    setForm]    = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");

  useEffect(() => {
    fetch("/api/v1/me/influencer-profile")
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.profile);
        setForm(d.profile ?? {});
      })
      .catch(() => setError("Unable to load profile"))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    const res = await fetch("/api/v1/me/influencer-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Save failed"); }
    else         { setSuccess("Profile saved successfully"); setProfile(data.profile); }
    setSaving(false);
  }

  function f(key: string) {
    return {
      value: form[key] ?? "",
      onChange: (e: any) => setForm((p: any) => ({ ...p, [key]: e.target.value })),
    };
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" };

  if (loading) return (
    <div className="page-container" style={{ padding: "80px 24px", textAlign: "center" }}>
      <div className="loading-spinner" style={{ margin: "0 auto" }} />
    </div>
  );

  if (!profile) return (
    <div className="page-container" style={{ padding: "80px 24px", textAlign: "center" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, color: "#1a1614" }}>Influencer profile not found</h2>
      <p style={{ color: "#9ca3af" }}>You don't have an influencer profile set up yet. Please contact the OKÜ team.</p>
    </div>
  );

  const initials = (profile.displayName ?? profile.handle ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div>
      {/* Header */}
      <div style={{ background: "#fafaf9", borderBottom: "1px solid #e5e0d8", padding: "40px 0 32px" }}>
        <div className="page-container">
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c41e3a", fontWeight: 600, marginBottom: 8 }}>My Account</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 400, color: "#1a1614", margin: 0 }}>Creator Profile</h1>
        </div>
      </div>

      <div className="page-container" style={{ padding: "40px 24px", display: "grid", gridTemplateColumns: "280px 1fr", gap: 40, alignItems: "start" }}>
        {/* Preview card */}
        <div>
          <div style={{ background: "linear-gradient(135deg, #1a1614 0%, #2d1f1a 100%)", borderRadius: 16, padding: "28px", textAlign: "center", marginBottom: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: profile.profileImageUrl ? `url(${profile.profileImageUrl}) center/cover` : "linear-gradient(135deg, #c41e3a 0%, #7c0d1f 100%)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 24, fontFamily: "var(--font-heading)" }}>
              {!profile.profileImageUrl && initials}
            </div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, color: "white", marginBottom: 4 }}>{form.displayName || profile.displayName}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>{form.headline || profile.headline}</div>
            {profile.isVerified && <span style={{ fontSize: 11, background: "#c41e3a", color: "white", padding: "3px 8px", borderRadius: 10, fontWeight: 700 }}>Verified Creator</span>}
          </div>

          <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 12, padding: "16px" }}>
            <div style={{ fontSize: 11, color: "#c41e3a", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Public Profile</div>
            <Link href={`/influencers/${encodeURIComponent(profile.handle ?? "")}`} target="_blank" style={{ fontSize: 13, color: "#1a1614", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{profile.handle}</span>
              <span style={{ color: "#c41e3a" }}>↗</span>
            </Link>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Referral Code</div>
              <code style={{ fontSize: 13, color: "#1a1614", background: "#fafaf9", padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e0d8" }}>{profile.refCode}</code>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Commission Rate</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1614" }}>{profile.commissionRateBps / 100}%</div>
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div>
          {success && <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", color: "#16a34a", marginBottom: 24, fontWeight: 500 }}>{success}</div>}
          {error   && <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#dc2626", marginBottom: 24 }}>{error}</div>}

          <form onSubmit={save}>
            {/* Identity */}
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "24px", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>Identity</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Display Name</label>
                  <input type="text" {...f("displayName")} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Location</label>
                  <input type="text" {...f("location")} placeholder="City, Country" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Headline</label>
                <input type="text" {...f("headline")} placeholder="e.g. Interior Designer & Luxury Lifestyle Creator" style={inputStyle} />
              </div>
            </div>

            {/* Bio */}
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "24px", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>Bio</h2>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Short Bio <span style={{ color: "#9ca3af", fontWeight: 400, textTransform: "none", fontSize: 11 }}>(shown on cards)</span></label>
                <textarea rows={2} {...f("shortBio")} placeholder="One-sentence summary" style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div>
                <label style={labelStyle}>Full Bio <span style={{ color: "#9ca3af", fontWeight: 400, textTransform: "none", fontSize: 11 }}>(shown on your profile page)</span></label>
                <textarea rows={6} {...f("longBio")} placeholder="Tell your story…" style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>

            {/* Images */}
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "24px", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>Images</h2>
              <div style={{ marginBottom: 24 }}>
                <MediaUpload
                  label="Profile Photo"
                  value={form.profileImageUrl || ""}
                  onChange={(url) => setForm((p: any) => ({ ...p, profileImageUrl: url }))}
                  aspectRatio="square"
                  mediaType="image"
                  maxSizeMB={5}
                />
              </div>
              <div>
                <MediaUpload
                  label="Cover Image"
                  value={form.coverImageUrl || ""}
                  onChange={(url) => setForm((p: any) => ({ ...p, coverImageUrl: url }))}
                  aspectRatio="wide"
                  mediaType="image"
                  maxSizeMB={10}
                />
              </div>
            </div>

            {/* Social links */}
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "24px", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>Social Links</h2>
              {SOCIAL_FIELDS.map((sf) => (
                <div key={sf.key} style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{sf.label}</label>
                  <input type="url" {...f(sf.key)} placeholder={sf.placeholder} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* Contact & Preferences */}
            <div style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 16, padding: "24px", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 400, color: "#1a1614", marginBottom: 20 }}>Contact & Preferences</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>WhatsApp Number</label>
                  <input type="tel" {...f("whatsapp")} placeholder="+507 6000 0000" style={inputStyle} />
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Private — not shown publicly. Used for OKÜ coordination.</p>
                </div>
                <div>
                  <label style={labelStyle}>Preferred Language</label>
                  <select value={form.preferredLanguage ?? ""} onChange={(e) => setForm((p: any) => ({ ...p, preferredLanguage: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                    <option value="">Select language</option>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <Link href="/influencer/dashboard" className="btn btn-ghost">Back to Dashboard</Link>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
                {saving ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
