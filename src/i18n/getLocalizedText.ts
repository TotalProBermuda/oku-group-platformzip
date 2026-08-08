import type { Locale, LocalizedText } from "@/types/i18n";

export function getLocalizedText(
  value: LocalizedText | string | undefined,
  locale: Locale,
  fallback: Locale = "en"
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[locale] || value[fallback] || value.en || "";
}
