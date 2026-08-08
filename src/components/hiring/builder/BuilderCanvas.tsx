"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { BuilderTemplate, BuilderSection, BuilderField } from "@/lib/hiring/builderTypes";
import BuilderSectionCard from "./BuilderSection";
import { useDroppable } from "@dnd-kit/core";

type Props = {
  template: BuilderTemplate;
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onUpdateSection: (sectionId: string, patch: Partial<BuilderSection>) => void;
  onDeleteSection: (sectionId: string) => void;
  onDuplicateSection: (sectionId: string) => void;
  onUpdateField: (sectionId: string, fieldId: string, patch: Partial<BuilderField>) => void;
  onDeleteField: (sectionId: string, fieldId: string) => void;
  onDuplicateField: (sectionId: string, fieldId: string) => void;
  onMoveField: (sectionId: string, fieldId: string, dir: "up" | "down") => void;
  onAddSection: () => void;
  onAddFieldToSection: (sectionId: string, widgetKey: string) => void;
};

export default function BuilderCanvas({
  template,
  selectedFieldId,
  onSelectField,
  onUpdateSection,
  onDeleteSection,
  onDuplicateSection,
  onUpdateField,
  onDeleteField,
  onDuplicateField,
  onMoveField,
  onAddSection,
  onAddFieldToSection,
}: Props) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        paddingBottom: 40,
      }}
    >
      {template.sections.length === 0 ? (
        <EmptyCanvas onAddSection={onAddSection} />
      ) : (
        <SortableContext
          items={template.sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {template.sections.map((section) => (
            <BuilderSectionCard
              key={section.id}
              section={section}
              selectedFieldId={selectedFieldId}
              onSelectField={onSelectField}
              onUpdateSection={(patch) => onUpdateSection(section.id, patch)}
              onDeleteSection={() => onDeleteSection(section.id)}
              onDuplicateSection={() => onDuplicateSection(section.id)}
              onUpdateField={(fieldId, patch) => onUpdateField(section.id, fieldId, patch)}
              onDeleteField={(fieldId) => onDeleteField(section.id, fieldId)}
              onDuplicateField={(fieldId) => onDuplicateField(section.id, fieldId)}
              onMoveField={(fieldId, dir) => onMoveField(section.id, fieldId, dir)}
              onAddFieldToSection={(widgetKey) => onAddFieldToSection(section.id, widgetKey)}
            />
          ))}
        </SortableContext>
      )}

      {/* Add Section */}
      <button
        onClick={onAddSection}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          padding: "14px 0",
          background: "none",
          border: "2px dashed #e8e2dd",
          borderRadius: 14,
          fontSize: 13,
          fontWeight: 600,
          color: "#b5aca6",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "#c41e3a";
          (e.currentTarget as HTMLButtonElement).style.color = "#c41e3a";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "#e8e2dd";
          (e.currentTarget as HTMLButtonElement).style.color = "#b5aca6";
        }}
      >
        <Plus size={16} /> Add Section
      </button>
    </div>
  );
}

function EmptyCanvas({ onAddSection }: { onAddSection: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1f1a17", marginBottom: 8 }}>
        Start building your form
      </h3>
      <p style={{ fontSize: 13, color: "#7d7269", marginBottom: 20, maxWidth: 320, margin: "0 auto 20px" }}>
        Add sections to organise your fields, then click widgets from the sidebar to insert fields.
      </p>
      <button
        onClick={onAddSection}
        style={{
          padding: "10px 20px",
          background: "#c41e3a",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + Add First Section
      </button>
    </div>
  );
}
