import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/config";
import { localePath } from "@/i18n/utils";

interface Props {
  params: Promise<{ locale?: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacySeriesCheckoutPage({ params, searchParams }: Props) {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams]);
  const safeLocale = locale && isValidLocale(locale) ? locale : DEFAULT_LOCALE;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      search.append(key, item);
    }
  }
  const suffix = search.size ? `?${search}` : "";
  redirect(`${localePath(safeLocale, `/checkout/${encodeURIComponent(slug)}`)}${suffix}`);
}
