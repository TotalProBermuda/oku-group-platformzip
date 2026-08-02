"use client";

import { useLocale } from "./LocaleProvider";
import { translations, type Translations } from "./translationsData";
export type { Translations };
export { getTranslations } from "./translationsData";

export function useTranslation() {
  const locale = useLocale();
  const t = translations[locale] || translations.en;

  function tr(namespace: keyof Translations, key: string): string {
    const ns = t[namespace] as Record<string, string>;
    if (!ns) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[i18n] Missing namespace: ${namespace}`);
      }
      return key;
    }
    const val = ns[key];
    if (val === undefined) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[i18n] Missing key: ${namespace}.${key} for locale: ${locale}`);
      }
      const fallback = (translations.en[namespace] as Record<string, string>)[key];
      return fallback ?? key;
    }
    return val;
  }

  return { t: tr, locale };
}
