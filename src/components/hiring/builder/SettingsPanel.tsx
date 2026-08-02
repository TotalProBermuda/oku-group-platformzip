"use client";

import { useState } from "react";
import { Settings, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Plus, X } from "lucide-react";
import { BuilderField } from "@/lib/hiring/builderTypes";
import { widgetRegistry } from "@/lib/hiring/widgetRegistry";

type Props = {
  field: BuilderField | null;
  allFields: BuilderField[];
  onUpdate: (patch: Partial<BuilderField>) => void;
};

type Section = "settings" | "validation" | "conditional" | "advanced";

export default function SettingsPanel({ field, allFields, onUpdate }: Props) {
  const [open, setOpen] = useState<Set<Section>>(new Set(["settings"]));

  const toggle = (s: Section) =>
    setOpen((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  if (!field) {
    return (
      <aside style={panelStyle}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Settings size={28} color="#d6cfc9" />
          <p style={{ fontSize: 13, color: "#b5aca6", textAlign: "center" }}>
            Click a field to edit its settings
          </p>
        </div>
      </aside>
    );
  }

  const meta = widgetRegistry[field.widget];
  const locked = field.meta?.isComplianceLocked ?? false;
  const hasOptions = ["select","multiselect","radio","checkbox","shift_selector","language_selector","years_experience","work_authorization","work_auth"].includes(field.widget);

  return (
    <aside style={panelStyle}>
      {/* Field type header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0ece8", background: "#faf8f6", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {meta && <meta.icon size={15} color={locked ? "#b45309" : "#7d7269"} />}
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1f1a17" }}>{meta?.label ?? field.widget}</span>
          {locked && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#b45309" }}>🔒 LOCKED</span>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* ── Settings ── */}
        <AccordionSection
          id="settings"
          label="Settings"
          icon={<Settings size={13} />}
          open={open.has("settings")}
          onToggle={() => toggle("settings")}
        >
          <FormRow label="Field Key" hint="Internal identifier — no spaces">
            <input
              style={inputStyle}
              value={field.key}
              onChange={(e) => !locked && onUpdate({ key: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
              readOnly={locked}
            />
          </FormRow>

          <FormRow label="Label">
            <input
              style={inputStyle}
              value={field.label}
              onChange={(e) => !locked && onUpdate({ label: e.target.value })}
              readOnly={locked}
            />
          </FormRow>

          {!["radio","checkbox","select","multiselect","yesno","divider","rich_text_info"].includes(field.widget) && (
            <FormRow label="Placeholder">
              <input
                style={inputStyle}
                value={field.placeholder ?? ""}
                onChange={(e) => onUpdate({ placeholder: e.target.value })}
                readOnly={locked}
              />
            </FormRow>
          )}

          <FormRow label="Help Text">
            <input
              style={inputStyle}
              value={field.helpText ?? ""}
              onChange={(e) => onUpdate({ helpText: e.target.value })}
            />
          </FormRow>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1f1a17" }}>Required</div>
              <div style={{ fontSize: 11, color: "#b5aca6" }}>Field must be filled</div>
            </div>
            <button
              onClick={() => !locked && onUpdate({ required: !field.required })}
              style={{ background: "none", border: "none", cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.5 : 1 }}
            >
              {field.required
                ? <ToggleRight size={28} color="#1f8a55" />
                : <ToggleLeft size={28} color="#b5aca6" />
              }
            </button>
          </div>

          {hasOptions && (
            <OptionsEditor
              options={field.options ?? []}
              locked={locked}
              onChange={(options) => onUpdate({ options })}
            />
          )}
        </AccordionSection>

        {/* ── Validation ── */}
        <AccordionSection
          id="validation"
          label="Validation"
          open={open.has("validation")}
          onToggle={() => toggle("validation")}
        >
          {["text","textarea","email","phone","url"].includes(field.widget) && (
            <>
              <FormRow label="Minimum Length">
                <input
                  type="number"
                  style={{ ...inputStyle, width: 80 }}
                  value={(field.validation?.minLength as number) ?? ""}
                  onChange={(e) => onUpdate({ validation: { ...field.validation, minLength: e.target.value ? Number(e.target.value) : undefined } })}
                />
              </FormRow>
              <FormRow label="Maximum Length">
                <input
                  type="number"
                  style={{ ...inputStyle, width: 80 }}
                  value={(field.validation?.maxLength as number) ?? ""}
                  onChange={(e) => onUpdate({ validation: { ...field.validation, maxLength: e.target.value ? Number(e.target.value) : undefined } })}
                />
              </FormRow>
            </>
          )}
          {field.widget === "number" && (
            <>
              <FormRow label="Minimum">
                <input type="number" style={{ ...inputStyle, width: 80 }} value={(field.validation?.min as number) ?? ""}
                  onChange={(e) => onUpdate({ validation: { ...field.validation, min: e.target.value ? Number(e.target.value) : undefined } })} />
              </FormRow>
              <FormRow label="Maximum">
                <input type="number" style={{ ...inputStyle, width: 80 }} value={(field.validation?.max as number) ?? ""}
                  onChange={(e) => onUpdate({ validation: { ...field.validation, max: e.target.value ? Number(e.target.value) : undefined } })} />
              </FormRow>
            </>
          )}
          {!["text","textarea","email","phone","url","number"].includes(field.widget) && (
            <p style={{ fontSize: 12, color: "#b5aca6", fontStyle: "italic" }}>No validation options for this widget type.</p>
          )}
        </AccordionSection>

        {/* ── Conditional Logic ── */}
        <AccordionSection
          id="conditional"
          label="Conditional Logic"
          open={open.has("conditional")}
          onToggle={() => toggle("conditional")}
        >
          {!field.conditionalLogic?.showWhen ? (
            <button
              onClick={() => onUpdate({ conditionalLogic: { showWhen: { field: "", operator: "equals", value: "" } } })}
              style={{ fontSize: 12, color: "#c41e3a", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500 }}
            >
              + Add condition
            </button>
          ) : (
            <div style={{ background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#3730a3" }}>Show when:</span>
                <button
                  onClick={() => onUpdate({ conditionalLogic: undefined })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#b5aca6" }}
                >
                  <X size={12} />
                </button>
              </div>
              <select
                style={{ ...inputStyle, fontSize: 12 }}
                value={field.conditionalLogic.showWhen.field}
                onChange={(e) => onUpdate({ conditionalLogic: { showWhen: { ...field.conditionalLogic!.showWhen!, field: e.target.value } } })}
              >
                <option value="">Select a field…</option>
                {allFields.filter((f) => f.id !== field.id).map((f) => (
                  <option key={f.id} value={f.key}>{f.label || f.key}</option>
                ))}
              </select>
              <select
                style={{ ...inputStyle, fontSize: 12 }}
                value={field.conditionalLogic.showWhen.operator}
                onChange={(e) => onUpdate({ conditionalLogic: { showWhen: { ...field.conditionalLogic!.showWhen!, operator: e.target.value as "equals" | "not_equals" | "in" | "not_in" } } })}
              >
                <option value="equals">equals</option>
                <option value="not_equals">does not equal</option>
                <option value="in">is one of</option>
                <option value="not_in">is not one of</option>
              </select>
              <input
                style={{ ...inputStyle, fontSize: 12 }}
                placeholder="Value…"
                value={field.conditionalLogic.showWhen.value as string}
                onChange={(e) => onUpdate({ conditionalLogic: { showWhen: { ...field.conditionalLogic!.showWhen!, value: e.target.value } } })}
              />
            </div>
          )}
        </AccordionSection>

        {/* ── Advanced ── */}
        <AccordionSection
          id="advanced"
          label="Advanced"
          open={open.has("advanced")}
          onToggle={() => toggle("advanced")}
        >
          <FormRow label="Width">
            <div style={{ display: "flex", gap: 6 }}>
              {(["full","half"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => onUpdate({ advanced: { ...field.advanced, width: w } })}
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer",
                    background: (field.advanced?.width ?? "full") === w ? "#1f1a17" : "#f5f1ee",
                    color: (field.advanced?.width ?? "full") === w ? "#fff" : "#7d7269",
                    border: "none",
                    transition: "all 0.15s",
                  }}
                >
                  {w === "full" ? "Full" : "Half"}
                </button>
              ))}
            </div>
          </FormRow>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1f1a17" }}>Hidden by default</div>
            <button
              onClick={() => onUpdate({ advanced: { ...field.advanced, hidden: !(field.advanced?.hidden) } })}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {field.advanced?.hidden
                ? <ToggleRight size={24} color="#c41e3a" />
                : <ToggleLeft size={24} color="#b5aca6" />}
            </button>
          </div>
        </AccordionSection>
      </div>
    </aside>
  );
}

function AccordionSection({
  label, icon, open, onToggle, children,
}: {
  id: Section;
  label: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid #f0ece8" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#faf8f6")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ color: "#7d7269" }}>{icon}</span>}
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1f1a17" }}>{label}</span>
        </div>
        {open ? <ChevronDown size={14} color="#b5aca6" /> : <ChevronRight size={14} color="#b5aca6" />}
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#1f1a17" }}>{label}</label>
      {hint && <span style={{ fontSize: 11, color: "#b5aca6" }}>{hint}</span>}
      {children}
    </div>
  );
}

function OptionsEditor({
  options,
  locked,
  onChange,
}: {
  options: { label: string; value: string }[];
  locked: boolean;
  onChange: (opts: { label: string; value: string }[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#1f1a17" }}>Options</div>
      {options.map((opt, i) => (
        <div key={i} style={{ display: "flex", gap: 4 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Label"
            value={opt.label}
            onChange={(e) => { const o = [...options]; o[i] = { ...o[i], label: e.target.value }; onChange(o); }}
            readOnly={locked}
          />
          <input
            style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 11 }}
            placeholder="value"
            value={opt.value}
            onChange={(e) => { const o = [...options]; o[i] = { ...o[i], value: e.target.value }; onChange(o); }}
            readOnly={locked}
          />
          {!locked && (
            <button onClick={() => onChange(options.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#b5aca6" }}>
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      {!locked && (
        <button
          onClick={() => onChange([...options, { label: "", value: "" }])}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#c41e3a", background: "none", border: "none", cursor: "pointer", fontWeight: 500, padding: 0 }}
        >
          <Plus size={12} /> Add option
        </button>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 340,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#fff",
  borderLeft: "1px solid #e8e2dd",
  overflow: "hidden",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 13,
  color: "#1f1a17",
  background: "#f5f1ee",
  border: "1px solid transparent",
  borderRadius: 8,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};
