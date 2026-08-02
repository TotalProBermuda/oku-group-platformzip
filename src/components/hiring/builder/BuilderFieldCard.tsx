"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Copy, Trash2, CheckSquare, Square, ChevronUp, ChevronDown } from "lucide-react";
import { BuilderField } from "@/lib/hiring/builderTypes";
import { widgetRegistry } from "@/lib/hiring/widgetRegistry";

type Props = {
  field: BuilderField;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleRequired: () => void;
};

export default function BuilderFieldCard({
  field,
  isSelected,
  onSelect,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleRequired,
}: Props) {
  const meta = widgetRegistry[field.widget];
  const locked = field.meta?.isComplianceLocked ?? false;

  const {
    attributes, listeners,
    setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: field.id, data: { type: "FIELD" } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const widget = field.widget;
  const showPreviewInput = !["radio","checkbox","multiselect","select","yesno","divider","rich_text_info","data_consent","truthfulness_declaration","work_authorization","work_auth","shift_selector","language_selector","resume_upload","portfolio_upload","id_upload"].includes(widget);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: "#fff",
        border: `1px solid ${isSelected ? "#c41e3a" : locked ? "#f0c070" : "#e8e2dd"}`,
        borderLeft: `3px solid ${isSelected ? "#c41e3a" : locked ? "#f0c070" : "transparent"}`,
        borderRadius: 12,
        marginBottom: 6,
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: isSelected ? "0 0 0 2px rgba(180,35,47,0.1)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}
      onClick={onSelect}
      className="group"
    >
      <div style={{ display: "flex", alignItems: "flex-start", padding: "10px 12px", gap: 8 }}>
        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", color: "#d6cfc9", paddingTop: 2, flexShrink: 0, display: "flex" }}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={15} />
        </span>

        {/* Widget icon */}
        {meta && (
          <span style={{ color: locked ? "#b45309" : "#7d7269", paddingTop: 2, flexShrink: 0, display: "flex" }}>
            <meta.icon size={14} />
          </span>
        )}

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1f1a17" }}>
              {field.label || "(unlabelled)"}
            </span>
            {field.required && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#c41e3a",
                background: "#fdf0f1", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em"
              }}>
                REQ
              </span>
            )}
            {locked && <span style={{ fontSize: 10 }}>🔒</span>}
            {field.conditionalLogic?.showWhen && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#3730a3",
                background: "#eef2ff", borderRadius: 4, padding: "1px 5px"
              }}>
                COND
              </span>
            )}
          </div>

          {/* Inline preview */}
          {showPreviewInput && (
            <div style={{
              marginTop: 6,
              padding: "6px 10px",
              background: "#f5f1ee",
              border: "1px solid #e8e2dd",
              borderRadius: 8,
              fontSize: 12,
              color: field.placeholder ? "#b5aca6" : "#d6cfc9",
              fontStyle: field.placeholder ? "normal" : "italic",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {field.placeholder || `${field.label || "Field"} eg.`}
            </div>
          )}

          {/* Choice preview */}
          {["select","multiselect"].includes(widget) && field.options && field.options.length > 0 && (
            <div style={{ marginTop: 6, padding: "6px 10px", background: "#f5f1ee", border: "1px solid #e8e2dd", borderRadius: 8, fontSize: 12, color: "#b5aca6" }}>
              {field.options[0]?.label || "Select one…"} ▾
            </div>
          )}

          {["radio","checkbox"].includes(widget) && field.options && (
            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {field.options.slice(0, 3).map((o) => (
                <span key={o.value} style={{ fontSize: 11, color: "#7d7269", display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 10, height: 10, borderRadius: widget === "radio" ? "50%" : 2, border: "1px solid #b5aca6", display: "inline-block" }} />
                  {o.label}
                </span>
              ))}
            </div>
          )}

          {/* Meta line */}
          <div style={{ marginTop: 4, fontSize: 11, color: "#b5aca6" }}>
            {meta?.label ?? field.widget} · {field.advanced?.width ?? "full"}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{ display: "flex", gap: 2, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn title="Toggle required" onClick={onToggleRequired} disabled={locked}>
            {field.required ? <CheckSquare size={13} color="#1f8a55" /> : <Square size={13} />}
          </ActionBtn>
          <ActionBtn title="Move up" onClick={onMoveUp}>
            <ChevronUp size={13} />
          </ActionBtn>
          <ActionBtn title="Move down" onClick={onMoveDown}>
            <ChevronDown size={13} />
          </ActionBtn>
          <ActionBtn title="Duplicate" onClick={onDuplicate}>
            <Copy size={13} />
          </ActionBtn>
          <ActionBtn title="Delete" onClick={onDelete} disabled={locked} danger>
            <Trash2 size={13} />
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  children, title, onClick, disabled, danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer",
        background: hov ? (danger ? "#fdf0f1" : "#f5f1ee") : "transparent",
        color: disabled ? "#d6cfc9" : hov ? (danger ? "#c41e3a" : "#1f1a17") : "#b5aca6",
        transition: "all 0.12s",
      }}
    >
      {children}
    </button>
  );
}
