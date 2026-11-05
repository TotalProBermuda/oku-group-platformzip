"use client";

import { useContext } from "react";
import { LocaleContext as SiteLocaleContext } from "@/components/i18n/LocaleProvider";
import { useLocale as useLegacyLocale } from "./LocaleProvider";
import { translations, type Translations } from "./translationsData";
export type { Translations };
export { getTranslations } from "./translationsData";

export function resolveTranslationLocale(siteLocale: import("@/types/i18n").Locale | undefined, fallbackLocale: import("@/types/i18n").Locale) {
  return siteLocale ?? fallbackLocale;
}

export function useTranslation() {
  const siteLocale = useContext(SiteLocaleContext)?.locale;
  const locale = resolveTranslationLocale(siteLocale, useLegacyLocale());
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
    if (val === undefined || typeof val !== "string") {
      if (process.env.NODE_ENV === "development") {
        if (val !== undefined) {
          console.warn(`[i18n] Non-string value for key: ${namespace}.${key} (${typeof val})`);
        } else {
          console.warn(`[i18n] Missing key: ${namespace}.${key} for locale: ${locale}`);
        }
      }
      const fallback = (translations.en[namespace] as Record<string, unknown>)[key];
      return typeof fallback === "string" ? fallback : key;
    }
    return val;
  }

  return { t: tr, locale };
}
