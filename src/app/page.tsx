import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { isValidLocale } from "@/i18n/config";
import { detectLocaleFromHeader } from "@/i18n/utils";
import type { Locale } from "@/types/i18n";

async function detectLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("oku_locale")?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) return cookieLocale;
  const headerStore = await headers();
  const acceptLang = headerStore.get("accept-language");
  return detectLocaleFromHeader(acceptLang);
}

export default async function RootPage() {
  const locale = await detectLocale();
  redirect(`/${locale}`);
}
