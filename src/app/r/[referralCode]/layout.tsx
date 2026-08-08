import { cookies } from "next/headers";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/types/i18n";

export default async function ReferralLandingLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const cookieLocale = jar.get("oku_locale")?.value;
  const locale: Locale = isValidLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : "en";

  const translations = await getTranslations(locale, ["host", "common"]);

  return (
    <LocaleProvider locale={locale} translations={translations}>
      {children}
    </LocaleProvider>
  );
}
