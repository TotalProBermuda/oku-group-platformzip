import { BuilderField } from "./builderTypes";

let _counter = 0;
function uid() { return `${Date.now()}_${++_counter}`; }

export function createFieldFromWidget(widget: string): BuilderField {
  const id = `fld_${uid()}`;
  const base: Omit<BuilderField, "widget"> = {
    id,
    key: `${widget}_${uid()}`,
    label: widgetLabel(widget),
    placeholder: "",
    helpText: "",
    required: false,
    validation: {},
    advanced: { width: "full" },
    meta: { isComplianceLocked: isCompliance(widget) },
  };

  const withOptions: BuilderField = { ...base, widget, options: [
    { label: "Option 1", value: "option_1" },
    { label: "Option 2", value: "option_2" },
  ]};

  if (["select","multiselect","radio","checkbox","shift_selector","language_selector","years_experience","work_auth","work_authorization"].includes(widget)) {
    return withOptions;
  }
  if (widget === "email") return { ...base, widget, required: true, validation: { format: "email" } };
  if (widget === "data_consent" || widget === "truthfulness_declaration") {
    return { ...base, widget, required: true, meta: { isComplianceLocked: true } };
  }
  return { ...base, widget };
}

export function createSection(title = "New Section"): import("./builderTypes").BuilderSection {
  return { id: `sec_${uid()}`, title, description: "", fields: [] };
}

function widgetLabel(widget: string): string {
  const map: Record<string, string> = {
    text: "Text Input", textarea: "Paragraph", number: "Number", date: "Date", url: "URL / Link",
    email: "Email", phone: "Phone / WhatsApp",
    select: "Select", multiselect: "Multi-select", radio: "Radio Group", checkbox: "Checkboxes", yesno: "Yes / No",
    shift_selector: "Shift Selector", years_experience: "Years of Experience", language_selector: "Languages",
    compensation_expectation: "Compensation Expectation",
    resume_upload: "Resume / CV", portfolio_upload: "Portfolio", id_upload: "ID / Passport",
    work_auth: "Work Authorization", work_authorization: "Work Authorization",
    data_consent: "Data Processing Consent", truthfulness_declaration: "Truthfulness Declaration",
    divider: "Divider", rich_text_info: "Info Block",
  };
  return map[widget] ?? widget;
}

function isCompliance(widget: string) {
  return ["work_auth","work_authorization","data_consent","truthfulness_declaration"].includes(widget);
}
