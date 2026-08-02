"use client";

import { useState, useCallback, useRef } from "react";
import {
  DndContext, DragEndEvent, DragOverEvent,
  PointerSensor, useSensor, useSensors,
  closestCenter, DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { BuilderTemplate, BuilderSection, BuilderField } from "@/lib/hiring/builderTypes";
import { createFieldFromWidget, createSection } from "@/lib/hiring/builderDefaults";
import BuilderHeader from "./BuilderHeader";
import WidgetSidebar from "./WidgetSidebar";
import BuilderCanvas from "./BuilderCanvas";
import SettingsPanel from "./SettingsPanel";
import PreviewDrawer from "./PreviewDrawer";

type Props = {
  initialTemplate: BuilderTemplate;
};

export default function FormBuilder({ initialTemplate }: Props) {
  const [template, setTemplate] = useState<BuilderTemplate>(initialTemplate);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const templateRef = useRef(template);
  templateRef.current = template;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const allFields: BuilderField[] = template.sections.flatMap((s) => s.fields);
  const selectedField = allFields.find((f) => f.id === selectedFieldId) ?? null;

  // ── Mutators ───────────────────────────────────────────────────────────────
  const mut = useCallback((updater: (t: BuilderTemplate) => BuilderTemplate) => {
    setTemplate((prev) => updater(prev));
  }, []);

  function addSection() {
    const sec = createSection();
    mut((t) => ({ ...t, sections: [...t.sections, sec] }));
  }

  function updateSection(sectionId: string, patch: Partial<BuilderSection>) {
    mut((t) => ({
      ...t,
      sections: t.sections.map((s) => s.id === sectionId ? { ...s, ...patch } : s),
    }));
  }

  function deleteSection(sectionId: string) {
    mut((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== sectionId) }));
    const deletedSection = template.sections.find((s) => s.id === sectionId);
    if (deletedSection?.fields.some((f) => f.id === selectedFieldId)) {
      setSelectedFieldId(null);
    }
  }

  function duplicateSection(sectionId: string) {
    const src = template.sections.find((s) => s.id === sectionId);
    if (!src) return;
    const suffix = `_c${Date.now()}`;
    const copy: BuilderSection = {
      ...src, id: src.id + suffix, title: src.title + " (copy)",
      fields: src.fields.map((f) => ({ ...f, id: f.id + suffix, key: f.key + suffix })),
    };
    mut((t) => {
      const idx = t.sections.findIndex((s) => s.id === sectionId);
      const next = [...t.sections];
      next.splice(idx + 1, 0, copy);
      return { ...t, sections: next };
    });
  }

  function addFieldToSection(sectionId: string, widgetKey: string) {
    const field = createFieldFromWidget(widgetKey);
    mut((t) => ({
      ...t,
      sections: t.sections.map((s) =>
        s.id === sectionId ? { ...s, fields: [...s.fields, field] } : s
      ),
    }));
    setSelectedFieldId(field.id);
  }

  function addFieldToLast(widgetKey: string) {
    if (template.sections.length === 0) {
      const sec = createSection("Section 1");
      const field = createFieldFromWidget(widgetKey);
      setTemplate((t) => ({ ...t, sections: [{ ...sec, fields: [field] }] }));
      setSelectedFieldId(field.id);
      return;
    }
    addFieldToSection(template.sections[template.sections.length - 1].id, widgetKey);
  }

  function updateField(sectionId: string, fieldId: string, patch: Partial<BuilderField>) {
    mut((t) => ({
      ...t,
      sections: t.sections.map((s) =>
        s.id === sectionId
          ? { ...s, fields: s.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f) }
          : s
      ),
    }));
  }

  function updateSelectedField(patch: Partial<BuilderField>) {
    if (!selectedFieldId) return;
    mut((t) => ({
      ...t,
      sections: t.sections.map((s) => ({
        ...s,
        fields: s.fields.map((f) => f.id === selectedFieldId ? { ...f, ...patch } : f),
      })),
    }));
  }

  function deleteField(sectionId: string, fieldId: string) {
    mut((t) => ({
      ...t,
      sections: t.sections.map((s) =>
        s.id === sectionId ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) } : s
      ),
    }));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  }

  function duplicateField(sectionId: string, fieldId: string) {
    mut((t) => ({
      ...t,
      sections: t.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const idx = s.fields.findIndex((f) => f.id === fieldId);
        const field = s.fields[idx];
        const suffix = `_c${Date.now()}`;
        const copy = { ...field, id: field.id + suffix, key: field.key + suffix };
        const next = [...s.fields];
        next.splice(idx + 1, 0, copy);
        return { ...s, fields: next };
      }),
    }));
  }

  function moveField(sectionId: string, fieldId: string, dir: "up" | "down") {
    mut((t) => ({
      ...t,
      sections: t.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const idx = s.fields.findIndex((f) => f.id === fieldId);
        const next = [...s.fields];
        const swapIdx = dir === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= next.length) return s;
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        return { ...s, fields: next };
      }),
    }));
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Widget from sidebar → add to section
    if (activeId.startsWith("widget::")) {
      const widgetKey = activeId.replace("widget::", "");
      // Find which section the drop target belongs to
      const targetSection = template.sections.find(
        (s) => s.id === overId || s.fields.some((f) => f.id === overId)
      );
      if (targetSection) {
        addFieldToSection(targetSection.id, widgetKey);
      } else {
        addFieldToLast(widgetKey);
      }
      return;
    }

    // Section reorder
    const activeSectionIdx = template.sections.findIndex((s) => s.id === activeId);
    const overSectionIdx = template.sections.findIndex((s) => s.id === overId);
    if (activeSectionIdx !== -1 && overSectionIdx !== -1) {
      mut((t) => ({ ...t, sections: arrayMove(t.sections, activeSectionIdx, overSectionIdx) }));
      return;
    }

    // Field reorder within same section
    for (const section of template.sections) {
      const activeIdx = section.fields.findIndex((f) => f.id === activeId);
      const overIdx = section.fields.findIndex((f) => f.id === overId);
      if (activeIdx !== -1 && overIdx !== -1) {
        mut((t) => ({
          ...t,
          sections: t.sections.map((s) =>
            s.id === section.id ? { ...s, fields: arrayMove(s.fields, activeIdx, overIdx) } : s
          ),
        }));
        return;
      }
    }
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  async function saveDraft() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/hiring/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateRef.current.name,
          schemaJson: { sections: templateRef.current.sections, version: templateRef.current.version },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      await saveDraft();
      const res = await fetch(`/api/hiring/templates/${template.id}/publish`, { method: "POST" });
      if (res.ok) {
        setTemplate((t) => ({ ...t, status: "PUBLISHED" }));
        showToast("Template published ✓");
      } else {
        showToast("Publish failed — check API");
      }
    } finally {
      setPublishing(false);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div style={{ minHeight: "100vh", background: "#faf8f6", display: "flex", flexDirection: "column" }}>
        <BuilderHeader
          template={template}
          onNameChange={(name) => setTemplate((t) => ({ ...t, name }))}
          onPreview={() => setPreviewOpen(true)}
          onSaveDraft={saveDraft}
          onPublish={publish}
          saving={saving}
          saved={saved}
          publishing={publishing}
        />

        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "280px minmax(0,1fr) 340px",
            overflow: "hidden",
            height: "calc(100vh - 56px)",
          }}
        >
          {/* Left sidebar */}
          <WidgetSidebar onAddWidget={addFieldToLast} />

          {/* Center canvas */}
          <main style={{ overflowY: "auto", padding: "24px" }}>
            <BuilderCanvas
              template={template}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
              onUpdateSection={updateSection}
              onDeleteSection={deleteSection}
              onDuplicateSection={duplicateSection}
              onUpdateField={updateField}
              onDeleteField={deleteField}
              onDuplicateField={duplicateField}
              onMoveField={moveField}
              onAddSection={addSection}
              onAddFieldToSection={addFieldToSection}
            />
          </main>

          {/* Right settings panel */}
          <SettingsPanel
            field={selectedField}
            allFields={allFields}
            onUpdate={updateSelectedField}
          />
        </div>
      </div>

      <PreviewDrawer
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        template={template}
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1f1a17", color: "#fff", fontSize: 13, fontWeight: 500,
          padding: "10px 20px", borderRadius: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          zIndex: 999,
        }}>
          {toast}
        </div>
      )}
    </DndContext>
  );
}
