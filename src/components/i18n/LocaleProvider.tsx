"use client";

import { createContext, useContext, useCallback, type ReactNode } from "react";
import type { Locale } from "@/types/i18n";
import { LOCALE_COOKIE_KEY, LOCALE_STORAGE_KEY } from "@/i18n/config";

type TranslationDict = Record<string, unknown>;

interface LocaleContextValue {
  locale: Locale;
  t: (namespace: string, key: string, vars?: Record<string, string | number>) => string;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

interface Props {
  locale: Locale;
  translations: Record<string, TranslationDict>;
  children: ReactNode;
}

export function LocaleProvider({ locale, translations, children }: Props) {
  const t = useCallback(
    (namespace: string, key: string, vars?: Record<string, string | number>): string => {
      const ns = translations[namespace];
      if (!ns) return key;
      const keys = key.split(".");
      let value: unknown = ns;
      for (const k of keys) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[k];
        } else {
          value = undefined;
          break;
        }
      }
      let result = typeof value === "string" ? value : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          result = result.replaceAll(`{${k}}`, String(v));
        }
      }
      return result;
    },
    [translations]
  );

  return (
    <LocaleContext.Provider value={{ locale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx.locale;
}

export function useTranslation() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useTranslation must be used within LocaleProvider");
  return ctx.t;
}

export function persistLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE_KEY}=${locale};path=/;max-age=31536000;SameSite=Lax`;
}
