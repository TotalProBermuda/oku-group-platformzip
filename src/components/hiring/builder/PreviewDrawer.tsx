"use client";

import { X } from "lucide-react";
import { BuilderTemplate } from "@/lib/hiring/builderTypes";

type Props = {
  open: boolean;
  onClose: () => void;
  template: BuilderTemplate;
};

export default function PreviewDrawer({ open, onClose, template }: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
      }}
      onClick={onClose}
    >
      <div style={{ flex: 1, background: "rgba(31,26,23,0.45)", backdropFilter: "blur(2px)" }} />

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(600px, 96vw)",
          height: "100vh",
          background: "#fff",
          overflowY: "auto",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e8e2dd",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 10,
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f1a17", margin: 0 }}>Form Preview</h2>
            <p style={{ fontSize: 12, color: "#7d7269", margin: "2px 0 0" }}>{template.name}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 8, border: "none", background: "#f5f1ee", cursor: "pointer",
              color: "#7d7269",
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, padding: 24 }}>
          {template.sections.map((section, si) => (
            <div key={section.id} style={{ marginBottom: 32 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{
                    width: 22, height: 22, background: "#c41e3a", color: "#fff",
                    borderRadius: "50%", display: "inline-flex", alignItems: "center",
                    justifyContent: "center", fontSize: 11, fontWeight: 700,
                  }}>
                    {si + 1}
                  </span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1f1a17", margin: 0 }}>
                    {section.title || "Untitled Section"}
                  </h3>
                </div>
                {section.description && (
                  <p style={{ fontSize: 13, color: "#7d7269", margin: 0, paddingLeft: 30 }}>
                    {section.description}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingLeft: 8 }}>
                {section.fields.map((field) => (
                  <div key={field.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#1f1a17", display: "flex", alignItems: "center", gap: 4 }}>
                      {field.label}
                      {field.required && <span style={{ color: "#c41e3a", fontWeight: 700 }}>*</span>}
                    </label>
                    {field.helpText && <p style={{ fontSize: 12, color: "#7d7269", margin: 0 }}>{field.helpText}</p>}
                    <PreviewInput field={field} />
                  </div>
                ))}
              </div>

              {si < template.sections.length - 1 && (
                <div style={{ height: 1, background: "#f0ece8", marginTop: 24 }} />
              )}
            </div>
          ))}

          {template.sections.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#b5aca6", fontSize: 14 }}>
              No sections yet.
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid #e8e2dd", background: "#faf8f6" }}>
          <button
            style={{
              width: "100%", padding: "12px 0",
              background: "#c41e3a", color: "#fff", border: "none",
              borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "not-allowed",
              opacity: 0.55,
            }}
          >
            Submit Application (preview only)
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewInput({ field }: { field: import("@/lib/hiring/builderTypes").BuilderField }) {
  const base: React.CSSProperties = {
    width: "100%", padding: "9px 12px", fontSize: 13, color: "#b5aca6",
    background: "#f5f1ee", border: "1px solid #e8e2dd", borderRadius: 10,
    boxSizing: "border-box", fontStyle: "italic",
  };
  const w = field.widget;

  if (w === "textarea") {
    return <div style={{ ...base, minHeight: 80 }}>{field.placeholder || "Your answer…"}</div>;
  }
  if (["select","multiselect"].includes(w)) {
    return (
      <div style={{ ...base, display: "flex", justifyContent: "space-between" }}>
        <span>{field.placeholder || "Select one…"}</span><span>▾</span>
      </div>
    );
  }
  if (["radio","checkbox"].includes(w)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(field.options || []).slice(0, 3).map((o) => (
          <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#7d7269" }}>
            <span style={{ width: 16, height: 16, borderRadius: w === "radio" ? "50%" : 4, border: "1px solid #d6cfc9", display: "inline-block", flexShrink: 0 }} />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  if (["data_consent","truthfulness_declaration","work_authorization","work_auth"].includes(w)) {
    return (
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#7d7269" }}>
        <span style={{ width: 16, height: 16, border: "1px solid #d6cfc9", borderRadius: 4, display: "inline-block", marginTop: 1, flexShrink: 0 }} />
        <span>I agree to the terms above</span>
      </label>
    );
  }
  if (["resume_upload","portfolio_upload","id_upload"].includes(w)) {
    return (
      <div style={{ ...base, textAlign: "center", padding: 20, border: "2px dashed #e8e2dd", background: "#faf8f6", fontStyle: "normal" }}>
        📎 Click to upload
      </div>
    );
  }
  return <div style={base}>{field.placeholder || `${field.label} eg.`}</div>;
}
