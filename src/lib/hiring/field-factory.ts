import { WIDGET_REGISTRY } from "./widget-registry";

export type BuilderField = {
  id: string;
  key: string;
  widget: string;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { label: string; value: string }[];
  layout: { width: "full" | "half" | "third" };
  validation: Record<string, unknown>;
  visibility: { showWhen: ConditionalRule | null };
  meta: { isSystem: boolean; isComplianceLocked: boolean };
};

export type ConditionalRule = {
  logic: "AND" | "OR";
  rules: { field: string; operator: "equals" | "not_equals" | "contains"; value: string }[];
};

export type BuilderSection = {
  id: string;
  title: string;
  description?: string;
  layout: { columns: 1 | 2 };
  fields: BuilderField[];
};

export type BuilderSchema = {
  version: number;
  sections: BuilderSection[];
};

let counter = 0;
function uid() {
  return `${Date.now()}_${++counter}`;
}

export function createField(widgetKey: string): BuilderField {
  const def = WIDGET_REGISTRY[widgetKey];
  if (!def) throw new Error(`Unknown widget: ${widgetKey}`);

  const label = def.label;
  const key = widgetKey + "_" + uid();

  return {
    id: "fld_" + uid(),
    key,
    widget: widgetKey,
    label,
    required: (def.defaultProps.required as boolean) ?? false,
    placeholder: (def.defaultProps.placeholder as string) ?? "",
    helpText: "",
    options: def.hasOptions ? (def.defaultProps.options as { label: string; value: string }[] ?? []) : undefined,
    layout: { width: "full" },
    validation: {},
    visibility: { showWhen: null },
    meta: { isSystem: def.isCompliance ?? false, isComplianceLocked: def.isCompliance ?? false },
  };
}

export function createSection(title = "New Section"): BuilderSection {
  return {
    id: "sec_" + uid(),
    title,
    description: "",
    layout: { columns: 1 },
    fields: [],
  };
}

export function normalizeSchema(raw: unknown): BuilderSchema {
  if (!raw || typeof raw !== "object") return { version: 1, sections: [] };

  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.sections)) return { version: 1, sections: [] };

  const sections: BuilderSection[] = (r.sections as Record<string, unknown>[]).map((sec) => {
    const fields: BuilderField[] = (Array.isArray(sec.fields) ? sec.fields : []).map((f: Record<string, unknown>) => ({
      id: (f.id as string) ?? "fld_" + uid(),
      key: (f.key as string) ?? (f.widget as string) + "_" + uid(),
      widget: (f.widget as string) ?? (f.type as string) ?? "text",
      label: (f.label as string) ?? "Field",
      required: (f.required as boolean) ?? false,
      placeholder: (f.placeholder as string) ?? "",
      helpText: (f.helpText as string) ?? "",
      options: f.options as { label: string; value: string }[] | undefined,
      layout: (f.layout as { width: "full" | "half" | "third" }) ?? { width: "full" },
      validation: (f.validation as Record<string, unknown>) ?? {},
      visibility: (f.visibility as { showWhen: ConditionalRule | null }) ?? { showWhen: null },
      meta: (f.meta as { isSystem: boolean; isComplianceLocked: boolean }) ?? { isSystem: false, isComplianceLocked: false },
    }));

    return {
      id: (sec.id as string) ?? "sec_" + uid(),
      title: (sec.title as string) ?? "Section",
      description: (sec.description as string) ?? "",
      layout: (sec.layout as { columns: 1 | 2 }) ?? { columns: 1 },
      fields,
    };
  });

  return { version: (r.version as number) ?? 1, sections };
}
