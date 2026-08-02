export type FormFieldOption = {
  label: string;
  value: string;
};

export type FormField = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  helpText?: string;
};

export type FormSection = {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
};

export type FormSchema = {
  version: number;
  sections: FormSection[];
};

export type ValidationRuleMap = Record<
  string,
  {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    format?: "email";
  }
>;
