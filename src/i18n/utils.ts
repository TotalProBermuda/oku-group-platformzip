import type { Locale, LocalizedText } from "@/types/i18n";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/config";

export function getLocalizedText(field: LocalizedText, locale: Locale): string {
  return field[locale] || field[DEFAULT_LOCALE] || "";
}

export function detectLocaleFromHeader(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const langs = acceptLanguage
    .split(",")
    .map((l) => l.split(";")[0].trim().toLowerCase().slice(0, 2));
  for (const lang of langs) {
    if (isValidLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

export function localePath(locale: Locale, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${cleanPath}`;
}
