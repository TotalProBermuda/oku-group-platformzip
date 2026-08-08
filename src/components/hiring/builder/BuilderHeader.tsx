"use client";

import { ChevronLeft, Eye, Save, Zap, Check } from "lucide-react";
import { BuilderTemplate } from "@/lib/hiring/builderTypes";

type Props = {
  template: BuilderTemplate;
  onNameChange: (name: string) => void;
  onPreview: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  saving: boolean;
  saved: boolean;
  publishing: boolean;
};

export default function BuilderHeader({
  template,
  onNameChange,
  onPreview,
  onSaveDraft,
  onPublish,
  saving,
  saved,
  publishing,
}: Props) {
  const isPublished = template.status === "PUBLISHED";

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #e8e2dd",
        boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 24px",
          height: 56,
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        {/* Back */}
        <a
          href="/admin/hiring/templates"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "#7d7269",
            textDecoration: "none",
            fontWeight: 500,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#1f1a17")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#7d7269")}
        >
          <ChevronLeft size={15} />
          Templates
        </a>

        <div style={{ width: 1, height: 20, background: "#e8e2dd", flexShrink: 0 }} />

        {/* Template name */}
        <input
          type="text"
          value={template.name}
          onChange={(e) => onNameChange(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 600,
            color: "#1f1a17",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: 8,
            padding: "4px 8px",
            outline: "none",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#e8e2dd")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
        />

        {/* Status badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "3px 8px",
            borderRadius: 20,
            background: isPublished ? "#e6f4ed" : "#f5f0eb",
            color: isPublished ? "#1f8a55" : "#7d7269",
            flexShrink: 0,
            textTransform: "uppercase",
          }}
        >
          {template.status}
        </span>

        {saved && !saving && (
          <span style={{ fontSize: 12, color: "#1f8a55", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <Check size={13} /> Saved
          </span>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={onPreview}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: "none", border: "1px solid #e8e2dd", color: "#7d7269", cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1f1a17"; (e.currentTarget as HTMLButtonElement).style.color = "#1f1a17"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e8e2dd"; (e.currentTarget as HTMLButtonElement).style.color = "#7d7269"; }}
          >
            <Eye size={14} /> Preview
          </button>

          <button
            onClick={onSaveDraft}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: "none", border: "1px solid #e8e2dd", color: "#7d7269", cursor: "pointer",
              transition: "all 0.15s", opacity: saving ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!saving) { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1f1a17"; (e.currentTarget as HTMLButtonElement).style.color = "#1f1a17"; } }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e8e2dd"; (e.currentTarget as HTMLButtonElement).style.color = "#7d7269"; }}
          >
            <Save size={14} /> {saving ? "Saving…" : "Save Draft"}
          </button>

          <button
            onClick={onPublish}
            disabled={publishing}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "#c41e3a", border: "none", color: "#fff", cursor: "pointer",
              transition: "background 0.15s", opacity: publishing ? 0.7 : 1,
            }}
            onMouseEnter={(e) => { if (!publishing) (e.currentTarget as HTMLButtonElement).style.background = "#9e1a26"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#c41e3a"; }}
          >
            <Zap size={14} /> {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
