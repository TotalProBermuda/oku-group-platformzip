import type { Locale } from "@/types/i18n";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/config";

type TranslationDict = Record<string, unknown>;

const DEFAULT_NAMESPACES = [
  "common",
  "navigation",
  "footer",
  "home",
  "venues",
  "booking",
  "forms",
  "seo",
] as const;

export type Namespace = (typeof DEFAULT_NAMESPACES)[number] | string;

export async function getTranslations(
  locale: Locale,
  namespaces: string[] = [...DEFAULT_NAMESPACES]
): Promise<Record<string, TranslationDict>> {
  const safeLocale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;
  const result: Record<string, TranslationDict> = {};

  await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const mod = await import(`./translations/${safeLocale}/${ns}.json`);
        result[ns] = mod.default ?? mod;
      } catch {
        try {
          const fallback = await import(`./translations/${DEFAULT_LOCALE}/${ns}.json`);
          result[ns] = fallback.default ?? fallback;
        } catch {
          result[ns] = {};
        }
      }
    })
  );

  return result;
}
