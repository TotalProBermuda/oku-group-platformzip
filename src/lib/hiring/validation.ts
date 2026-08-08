import { FormSchema, ValidationRuleMap } from "./types";

export function validateAnswers(
  schema: FormSchema,
  rules: ValidationRuleMap | null | undefined,
  answers: Record<string, unknown>
) {
  const errors: Record<string, string> = {};

  for (const section of schema.sections) {
    for (const field of section.fields) {
      const value = answers[field.key];
      const rule = rules?.[field.key];

      if (field.required && (value === undefined || value === null || value === "")) {
        errors[field.key] = `${field.label} is required`;
        continue;
      }

      if (typeof value === "string" && rule?.minLength && value.length < rule.minLength) {
        errors[field.key] = `${field.label} must be at least ${rule.minLength} characters`;
      }

      if (typeof value === "string" && rule?.maxLength && value.length > rule.maxLength) {
        errors[field.key] = `${field.label} must be at most ${rule.maxLength} characters`;
      }

      if (typeof value === "string" && rule?.format === "email") {
        const emailOk = /\S+@\S+\.\S+/.test(value);
        if (!emailOk) errors[field.key] = `${field.label} must be a valid email`;
      }
    }
  }

  return errors;
}
