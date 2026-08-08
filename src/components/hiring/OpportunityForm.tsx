"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OpportunityForm({
  templates,
  pipelines,
}: {
  templates: { id: string; name: string }[];
  pipelines: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    slug: "",
    department: "",
    engagementType: "PART_TIME",
    employmentCategory: "EMPLOYEE",
    visibility: "PUBLIC",
    status: "DRAFT",
    description: "",
    formTemplateId: templates[0]?.id ?? "",
    applicationPipelineId: pipelines[0]?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "title" && !form.slug) {
      const autoSlug = (value as string)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      setForm((prev) => ({ ...prev, title: value as string, slug: autoSlug }));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hiring/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError("Failed to create opportunity. Check all fields and try again.");
        return;
      }
      router.push("/admin/hiring/opportunities");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="form-group">
        <label className="form-label">Title <span style={{ color: "var(--color-crimson)" }}>*</span></label>
        <input className="form-input" placeholder="e.g. Hostess" value={form.title} onChange={(e) => set("title", e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Slug <span style={{ color: "var(--color-crimson)" }}>*</span></label>
        <input className="form-input" placeholder="e.g. hostess-casco-viejo" value={form.slug} onChange={(e) => set("slug", e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Department</label>
        <input className="form-input" placeholder="e.g. Front of House" value={form.department} onChange={(e) => set("department", e.target.value)} />
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <div className="form-group">
          <label className="form-label">Engagement Type</label>
          <select className="form-input" value={form.engagementType} onChange={(e) => set("engagementType", e.target.value)}>
            {["FULL_TIME","PART_TIME","SEASONAL","CONTRACT","CONSULTANT","FREELANCE","TALENT","INTERN","TEMPORARY"].map((v) => (
              <option key={v} value={v}>{v.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Employment Category</label>
          <select className="form-input" value={form.employmentCategory} onChange={(e) => set("employmentCategory", e.target.value)}>
            {["EMPLOYEE","INDEPENDENT_CONTRACTOR","CONSULTANT","PERFORMER","AGENCY","VENDOR"].map((v) => (
              <option key={v} value={v}>{v.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <div className="form-group">
          <label className="form-label">Visibility</label>
          <select className="form-input" value={form.visibility} onChange={(e) => set("visibility", e.target.value)}>
            <option value="PUBLIC">Public</option>
            <option value="INVITE_ONLY">Invite Only</option>
            <option value="INTERNAL_ONLY">Internal Only</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input" value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="PAUSED">Paused</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Form Template <span style={{ color: "var(--color-crimson)" }}>*</span></label>
        <select className="form-input" value={form.formTemplateId} onChange={(e) => set("formTemplateId", e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Pipeline</label>
        <select className="form-input" value={form.applicationPipelineId} onChange={(e) => set("applicationPipelineId", e.target.value)}>
          <option value="">— None —</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea
          className="form-input"
          style={{ minHeight: 120 }}
          placeholder="Role overview…"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      <div style={{ display: "flex", gap: 12 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Opportunity"}
        </button>
        <button className="btn btn-ghost" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </div>
  );
}
