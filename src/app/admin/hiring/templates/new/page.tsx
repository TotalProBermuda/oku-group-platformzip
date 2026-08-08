"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STARTER_SCHEMA = {
  version: 1,
  sections: [
    {
      id: "personal_information",
      title: "Personal Information",
      fields: [
        { key: "full_name", type: "text",  label: "Full Legal Name",  required: true },
        { key: "email",     type: "email", label: "Email Address",    required: true },
        { key: "phone",     type: "phone", label: "Phone Number",     required: true },
      ],
    },
  ],
};

export default function NewTemplatePage() {
  const router = useRouter();
  const [name,       setName]       = useState("");
  const [slug,       setSlug]       = useState("");
  const [category,   setCategory]   = useState("employment");
  const [schemaJson, setSchemaJson] = useState(JSON.stringify(STARTER_SCHEMA, null, 2));
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  function handleNameChange(v: string) {
    setName(v);
    if (!slug) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(schemaJson);
      } catch {
        setError("Schema JSON is invalid. Please fix the syntax and try again.");
        return;
      }

      const res = await fetch("/api/hiring/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          category,
          status: "DRAFT",
          schemaJson: parsed,
          uiSchemaJson: { layout: "multi_step", showProgressBar: true, saveDraftEnabled: true },
          validationJson: {},
        }),
      });

      if (!res.ok) {
        setError("Failed to save template.");
        return;
      }

      router.push("/admin/hiring/templates");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h2 className="section-title">New Form Template</h2>
        <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginTop: 4 }}>
          Define the schema used to collect applicant information.
        </p>
      </div>

      <div className="card" style={{ padding: "28px 24px", maxWidth: 740 }}>
        <div style={{ display: "grid", gap: 20 }}>
          <div className="form-group">
            <label className="form-label">Name <span style={{ color: "var(--color-crimson)" }}>*</span></label>
            <input className="form-input" placeholder="e.g. Standard Hospitality Form" value={name} onChange={(e) => handleNameChange(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Slug <span style={{ color: "var(--color-crimson)" }}>*</span></label>
            <input className="form-input" placeholder="e.g. standard-hospitality-form" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="employment">Employment</option>
              <option value="talent">Talent</option>
              <option value="contractor">Contractor</option>
              <option value="general">General</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Schema JSON</label>
            <p className="form-hint" style={{ marginBottom: 8 }}>
              Define <code>sections</code> and <code>fields</code>. Field types: text, email, phone, textarea, radio, select, multiselect.
            </p>
            <textarea
              className="form-input"
              style={{ minHeight: 400, fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
              value={schemaJson}
              onChange={(e) => setSchemaJson(e.target.value)}
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Template"}
            </button>
            <button className="btn btn-ghost" onClick={() => router.back()}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
