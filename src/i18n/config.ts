import type { Locale } from "@/types/i18n";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/types/i18n";

export { SUPPORTED_LOCALES, DEFAULT_LOCALE };

export const LOCALE_COOKIE_KEY = "oku_locale";
export const LOCALE_STORAGE_KEY = "oku_locale";

export function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}
