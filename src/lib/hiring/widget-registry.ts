export type WidgetCategory =
  | "basic"
  | "contact"
  | "choice"
  | "hiring"
  | "uploads"
  | "compliance"
  | "advanced";

export type WidgetDefinition = {
  label: string;
  category: WidgetCategory;
  icon: string;
  defaultProps: Record<string, unknown>;
  hasOptions?: boolean;
  isCompliance?: boolean;
  description?: string;
};

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  // ── Basic ──────────────────────────────────────────────────────────────────
  text: {
    label: "Text Input",
    category: "basic",
    icon: "Aa",
    description: "Single-line text field",
    defaultProps: { placeholder: "", required: false },
  },
  textarea: {
    label: "Paragraph",
    category: "basic",
    icon: "¶",
    description: "Multi-line text area",
    defaultProps: { placeholder: "", required: false },
  },
  number: {
    label: "Number",
    category: "basic",
    icon: "#",
    description: "Numeric input",
    defaultProps: { placeholder: "", required: false, min: null, max: null },
  },
  date: {
    label: "Date",
    category: "basic",
    icon: "📅",
    description: "Date picker",
    defaultProps: { required: false },
  },
  url: {
    label: "URL / Link",
    category: "basic",
    icon: "🔗",
    description: "Website or portfolio link",
    defaultProps: { placeholder: "https://", required: false },
  },
  // ── Contact ────────────────────────────────────────────────────────────────
  email: {
    label: "Email",
    category: "contact",
    icon: "✉",
    description: "Email address field",
    defaultProps: { placeholder: "", required: true },
  },
  phone: {
    label: "Phone / WhatsApp",
    category: "contact",
    icon: "📞",
    description: "Phone number field",
    defaultProps: { placeholder: "", required: false },
  },
  // ── Choice ─────────────────────────────────────────────────────────────────
  select: {
    label: "Dropdown",
    category: "choice",
    icon: "▾",
    description: "Select one from a list",
    hasOptions: true,
    defaultProps: { options: [], required: false },
  },
  multiselect: {
    label: "Multi-select",
    category: "choice",
    icon: "☑",
    description: "Select multiple options",
    hasOptions: true,
    defaultProps: { options: [], required: false },
  },
  radio: {
    label: "Radio Group",
    category: "choice",
    icon: "◉",
    description: "Pick one option",
    hasOptions: true,
    defaultProps: { options: [], required: false },
  },
  checkbox: {
    label: "Checkboxes",
    category: "choice",
    icon: "☒",
    description: "Multiple checkboxes",
    hasOptions: true,
    defaultProps: { options: [], required: false },
  },
  yesno: {
    label: "Yes / No Toggle",
    category: "choice",
    icon: "⇄",
    description: "Boolean yes/no field",
    defaultProps: { required: false },
  },
  // ── Hiring-Specific ────────────────────────────────────────────────────────
  shift_selector: {
    label: "Shift Selector",
    category: "hiring",
    icon: "🕐",
    description: "Select preferred shifts",
    defaultProps: {
      options: [
        { label: "Morning", value: "morning" },
        { label: "Afternoon", value: "afternoon" },
        { label: "Evening", value: "evening" },
        { label: "Weekend", value: "weekend" },
      ],
      required: false,
    },
  },
  years_experience: {
    label: "Years of Experience",
    category: "hiring",
    icon: "⭐",
    description: "Experience level selector",
    hasOptions: true,
    defaultProps: {
      options: [
        { label: "Less than 1 year", value: "0" },
        { label: "1–2 years", value: "1" },
        { label: "3–5 years", value: "3" },
        { label: "6–10 years", value: "6" },
        { label: "10+ years", value: "10" },
      ],
      required: false,
    },
  },
  language_selector: {
    label: "Languages",
    category: "hiring",
    icon: "🌐",
    description: "Select languages spoken",
    hasOptions: true,
    defaultProps: {
      options: [
        { label: "English", value: "en" },
        { label: "Spanish", value: "es" },
        { label: "French", value: "fr" },
        { label: "Portuguese", value: "pt" },
        { label: "German", value: "de" },
      ],
      required: false,
    },
  },
  compensation_expectation: {
    label: "Compensation Expectation",
    category: "hiring",
    icon: "$",
    description: "Expected salary/rate",
    defaultProps: { placeholder: "e.g. $2,500/month or negotiable", required: false },
  },
  // ── Uploads ────────────────────────────────────────────────────────────────
  resume_upload: {
    label: "Resume / CV",
    category: "uploads",
    icon: "📄",
    description: "Upload resume or CV",
    defaultProps: { required: false, accept: ".pdf,.doc,.docx", maxMb: 10 },
  },
  portfolio_upload: {
    label: "Portfolio",
    category: "uploads",
    icon: "🗂",
    description: "Upload portfolio or work samples",
    defaultProps: { required: false, accept: ".pdf,.zip,.jpg,.png", maxMb: 20 },
  },
  id_upload: {
    label: "ID / Passport",
    category: "uploads",
    icon: "🪪",
    description: "Upload government ID",
    defaultProps: { required: false, accept: ".pdf,.jpg,.png", maxMb: 5 },
  },
  // ── Compliance ─────────────────────────────────────────────────────────────
  work_authorization: {
    label: "Work Authorization",
    category: "compliance",
    icon: "✅",
    isCompliance: true,
    description: "Legal right to work declaration",
    hasOptions: true,
    defaultProps: {
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ],
      required: true,
    },
  },
  data_consent: {
    label: "Data Processing Consent",
    category: "compliance",
    icon: "🔒",
    isCompliance: true,
    description: "GDPR / data consent declaration",
    defaultProps: { required: true, consentText: "I consent to the processing of my personal data for recruitment purposes." },
  },
  truthfulness_declaration: {
    label: "Truthfulness Declaration",
    category: "compliance",
    icon: "📋",
    isCompliance: true,
    description: "Confirms accuracy of submitted information",
    defaultProps: { required: true, declarationText: "I confirm that all information provided is accurate and complete." },
  },
  // ── Advanced ───────────────────────────────────────────────────────────────
  divider: {
    label: "Divider / Title Block",
    category: "advanced",
    icon: "—",
    description: "Visual separator or heading",
    defaultProps: { text: "" },
  },
  rich_text_info: {
    label: "Info Block",
    category: "advanced",
    icon: "ℹ",
    description: "Read-only information block",
    defaultProps: { content: "" },
  },
};

export const WIDGET_CATEGORIES: { key: WidgetCategory; label: string }[] = [
  { key: "basic",      label: "Basic" },
  { key: "contact",   label: "Contact" },
  { key: "choice",    label: "Choice" },
  { key: "hiring",    label: "Hiring" },
  { key: "uploads",   label: "Uploads" },
  { key: "compliance",label: "Compliance" },
  { key: "advanced",  label: "Advanced" },
];

export function getWidget(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[type];
}

export function getWidgetsByCategory(cat: WidgetCategory) {
  return Object.entries(WIDGET_REGISTRY)
    .filter(([, def]) => def.category === cat)
    .map(([key, def]) => ({ key, ...def }));
}
