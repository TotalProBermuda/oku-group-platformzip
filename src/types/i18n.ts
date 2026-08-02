export type Locale = "en" | "es" | "pt";

export type LocalizedText = {
  en: string;
  es: string;
  pt: string;
};

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "es", "pt"] as const;
export const DEFAULT_LOCALE: Locale = "en";
