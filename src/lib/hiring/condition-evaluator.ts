import type { ConditionalRule } from "./field-factory";

export function evaluateVisibility(
  showWhen: ConditionalRule | null | undefined,
  answers: Record<string, unknown>
): boolean {
  if (!showWhen) return true;

  const results = showWhen.rules.map((rule) => {
    const val = answers[rule.field];

    switch (rule.operator) {
      case "equals":
        return String(val ?? "") === rule.value;
      case "not_equals":
        return String(val ?? "") !== rule.value;
      case "contains":
        if (Array.isArray(val)) return val.includes(rule.value);
        return String(val ?? "").includes(rule.value);
      default:
        return true;
    }
  });

  if (showWhen.logic === "OR") return results.some(Boolean);
  return results.every(Boolean);
}
