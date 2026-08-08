import {
  Type, AlignLeft, Hash, Calendar, Link2,
  Mail, Phone,
  ChevronDown, ToggleLeft, CircleDot, CheckSquare,
  Clock3, Star, Languages, DollarSign,
  FileText, Paperclip,
  ShieldCheck, FileCheck, UserCheck,
  Minus, Info, Settings2,
  type LucideIcon,
} from "lucide-react";

export type WidgetGroup =
  | "Basic" | "Contact" | "Choice" | "Hiring"
  | "Uploads" | "Compliance" | "Advanced" | "Custom";

export type WidgetMeta = {
  label: string;
  group: WidgetGroup;
  icon: LucideIcon;
  isCompliance?: boolean;
  description?: string;
};

export const widgetRegistry: Record<string, WidgetMeta> = {
  // ── Basic ──────────────────────────────────────────────────────────
  text:     { label: "Text Input",    group: "Basic",   icon: Type,        description: "Single line text" },
  textarea: { label: "Paragraph",     group: "Basic",   icon: AlignLeft,   description: "Multi-line text area" },
  number:   { label: "Number",        group: "Basic",   icon: Hash,        description: "Numeric input" },
  date:     { label: "Date",          group: "Basic",   icon: Calendar,    description: "Date picker" },
  url:      { label: "URL / Link",    group: "Basic",   icon: Link2,       description: "Website or link" },
  // ── Contact ────────────────────────────────────────────────────────
  email:    { label: "Email",         group: "Contact", icon: Mail,        description: "Email address" },
  phone:    { label: "Phone / WhatsApp", group: "Contact", icon: Phone,    description: "Phone number" },
  // ── Choice ─────────────────────────────────────────────────────────
  select:      { label: "Select",       group: "Choice",  icon: ChevronDown, description: "Dropdown — pick one" },
  multiselect: { label: "Multi-select", group: "Choice",  icon: CheckSquare, description: "Pick multiple options" },
  radio:       { label: "Radio Group",  group: "Choice",  icon: CircleDot,   description: "Pick one option" },
  checkbox:    { label: "Checkboxes",   group: "Choice",  icon: CheckSquare, description: "Tick all that apply" },
  yesno:       { label: "Yes / No",     group: "Choice",  icon: ToggleLeft,  description: "Boolean toggle" },
  // ── Hiring ─────────────────────────────────────────────────────────
  shift_selector:         { label: "Shift Selector",          group: "Hiring", icon: Clock3,   description: "Select preferred shifts" },
  years_experience:       { label: "Years of Experience",     group: "Hiring", icon: Star,     description: "Experience level" },
  language_selector:      { label: "Languages",               group: "Hiring", icon: Languages,description: "Languages spoken" },
  compensation_expectation:{ label: "Compensation Expectation", group: "Hiring", icon: DollarSign, description: "Expected salary / rate" },
  // ── Uploads ────────────────────────────────────────────────────────
  resume_upload:    { label: "Resume / CV",    group: "Uploads", icon: FileText,  description: "Upload resume" },
  portfolio_upload: { label: "Portfolio",      group: "Uploads", icon: Paperclip, description: "Upload portfolio" },
  id_upload:        { label: "ID / Passport",  group: "Uploads", icon: FileCheck, description: "Upload government ID" },
  // ── Compliance ─────────────────────────────────────────────────────
  work_authorization:        { label: "Work Authorization",       group: "Compliance", icon: ShieldCheck, isCompliance: true },
  data_consent:              { label: "Data Processing Consent",  group: "Compliance", icon: ShieldCheck, isCompliance: true },
  truthfulness_declaration:  { label: "Truthfulness Declaration", group: "Compliance", icon: UserCheck,   isCompliance: true },
  // ── Advanced ───────────────────────────────────────────────────────
  divider:        { label: "Divider",     group: "Advanced", icon: Minus,    description: "Visual separator" },
  rich_text_info: { label: "Info Block",  group: "Advanced", icon: Info,     description: "Read-only content block" },
  // ── Custom ─────────────────────────────────────────────────────────
  custom: { label: "Custom Widget", group: "Custom", icon: Settings2, description: "DB-backed custom widget" },
};

export const GROUPS: WidgetGroup[] = [
  "Basic", "Contact", "Choice", "Hiring", "Uploads", "Compliance", "Advanced", "Custom",
];

export function getWidgetsByGroup(group: WidgetGroup) {
  return Object.entries(widgetRegistry)
    .filter(([, m]) => m.group === group)
    .map(([key, m]) => ({ key, ...m }));
}
