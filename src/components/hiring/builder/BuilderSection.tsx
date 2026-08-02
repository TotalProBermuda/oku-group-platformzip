"use client";

import { useState } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Copy, Trash2, Plus } from "lucide-react";
import { BuilderSection as Section, BuilderField } from "@/lib/hiring/builderTypes";
import BuilderFieldCard from "./BuilderFieldCard";

type Props = {
  section: Section;
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onUpdateSection: (patch: Partial<Section>) => void;
  onDeleteSection: () => void;
  onDuplicateSection: () => void;
  onUpdateField: (fieldId: string, patch: Partial<BuilderField>) => void;
  onDeleteField: (fieldId: string) => void;
  onDuplicateField: (fieldId: string) => void;
  onMoveField: (fieldId: string, dir: "up" | "down") => void;
  onAddFieldToSection: (widgetKey: string) => void;
};

export default function BuilderSectionCard({
  section,
  selectedFieldId,
  onSelectField,
  onUpdateSection,
  onDeleteSection,
  onDuplicateSection,
  onUpdateField,
  onDeleteField,
  onDuplicateField,
  onMoveField,
  onAddFieldToSection,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id, data: { type: "SECTION" } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e8e2dd",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid #f0ece8",
          background: "#faf8f6",
        }}
      >
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", color: "#d6cfc9", paddingTop: 4, flexShrink: 0, display: "flex" }}
        >
          <GripVertical size={16} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            type="text"
            value={section.title}
            onChange={(e) => onUpdateSection({ title: e.target.value })}
            placeholder="Section title…"
            style={{
              display: "block",
              width: "100%",
              fontSize: 14,
              fontWeight: 700,
              color: "#1f1a17",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              marginBottom: 2,
            }}
          />
          <input
            type="text"
            value={section.description ?? ""}
            onChange={(e) => onUpdateSection({ description: e.target.value })}
            placeholder="Optional description…"
            style={{
              display: "block",
              width: "100%",
              fontSize: 12,
              color: "#b5aca6",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <SectionBtn title="Duplicate section" onClick={onDuplicateSection}>
            <Copy size={13} />
          </SectionBtn>
          <SectionBtn title="Delete section" onClick={onDeleteSection} danger>
            <Trash2 size={13} />
          </SectionBtn>
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: "12px 16px" }}>
        <SortableContext
          items={section.fields.map((f: BuilderField) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          {section.fields.length === 0 ? (
            <div
              style={{
                border: "2px dashed #e8e2dd",
                borderRadius: 10,
                padding: "20px 16px",
                textAlign: "center",
                color: "#b5aca6",
                fontSize: 13,
                marginBottom: 10,
              }}
            >
              Click a widget in the sidebar to add a field, or drag one here
            </div>
          ) : (
            section.fields.map((field: BuilderField) => (
              <BuilderFieldCard
                key={field.id}
                field={field}
                isSelected={selectedFieldId === field.id}
                onSelect={() => onSelectField(field.id)}
                onDuplicate={() => onDuplicateField(field.id)}
                onDelete={() => onDeleteField(field.id)}
                onMoveUp={() => onMoveField(field.id, "up")}
                onMoveDown={() => onMoveField(field.id, "down")}
                onToggleRequired={() => onUpdateField(field.id, { required: !field.required })}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function SectionBtn({
  children, title, onClick, danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 7, border: "none", cursor: "pointer",
        background: hov ? (danger ? "#fdf0f1" : "#f0ece8") : "transparent",
        color: hov ? (danger ? "#c41e3a" : "#1f1a17") : "#b5aca6",
        transition: "all 0.12s",
      }}
    >
      {children}
    </button>
  );
}
