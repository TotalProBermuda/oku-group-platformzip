export type BuilderField = {
  id: string;
  key: string;
  widget: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    format?: "email" | "url";
  };
  conditionalLogic?: {
    showWhen?: {
      field: string;
      operator: "equals" | "not_equals" | "in" | "not_in";
      value: string | string[];
    };
  };
  advanced?: {
    width?: "full" | "half";
    hidden?: boolean;
  };
  meta?: {
    isComplianceLocked?: boolean;
    isSystem?: boolean;
  };
};

export type BuilderSection = {
  id: string;
  title: string;
  description?: string;
  fields: BuilderField[];
};

export type BuilderTemplate = {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version: number;
  sections: BuilderSection[];
};
