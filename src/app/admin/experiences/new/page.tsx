"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewExperiencePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "", slug: "", description: "", category: "Food & Drink",
    venue: "OKU", hostType: "OKU", city: "New York", country: "US",
    capacityTotal: 50, status: "DRAFT",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  function f(key: string) {
    return {
      value: (form as any)[key] ?? "",
      onChange: (e: any) => setForm((p) => ({ ...p, [key]: e.target.value })),
    };
  }

  function autoSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const res = await fetch("/api/v1/admin/experiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to create"); setSaving(false); return; }
    router.push(`/admin/experiences/${data.series.id}`);
  }

  return (
    <div>
      <div style={{ background: "#fafaf9", borderBottom: "1px solid #e5e0d8", padding: "24px 0" }}>
        <div className="page-container">
          <Link href="/admin/experiences" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>← Experiences</Link>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 400, color: "#1a1614", margin: "8px 0 0" }}>New Experience</h1>
        </div>
      </div>

      <div className="page-container" style={{ padding: "40px 24px", maxWidth: 680 }}>
        {error && <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#dc2626", marginBottom: 24 }}>{error}</div>}
        <form onSubmit={submit}>
          {[
            { key: "title",       label: "Title *",        type: "text" },
            { key: "slug",        label: "URL Slug *",     type: "text" },
            { key: "description", label: "Description",    type: "textarea" },
          ].map(({ key, label, type }) => (
            <div key={key} style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
              {type === "textarea"
                ? <textarea rows={4} {...f(key)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />
                : <input type="text" required={key !== "description"} {...f(key)}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, [key]: e.target.value, ...(key === "title" ? { slug: autoSlug(e.target.value) } : {}) }));
                    }}
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14 }} />
              }
            </div>
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {[
              { key: "category", label: "Category",  options: ["Food & Drink", "Wellness", "Design & Art", "Music", "Business", "Community"] },
              { key: "venue",    label: "Venue",     options: ["OKU", "CATCH"] },
              { key: "hostType", label: "Host Type", options: ["OKU", "CATCH", "INFLUENCER", "PARTNER"] },
              { key: "status",   label: "Status",    options: ["DRAFT", "PUBLISHED"] },
            ].map(({ key, label, options }) => (
              <div key={key}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
                <select {...f(key)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14, background: "white" }}>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>City</label>
              <input type="text" {...f("city")} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Capacity</label>
              <input type="number" {...f("capacityTotal")} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e0d8", borderRadius: 8, fontSize: 14 }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <Link href="/admin/experiences" className="btn btn-ghost">Cancel</Link>
            <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
              {saving ? "Creating…" : "Create Experience"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
