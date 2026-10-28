import { redirect } from "next/navigation";
import { localePath } from "@/i18n/utils";
import type { Locale } from "@/types/i18n";

interface Props {
  params: Promise<{ locale: Locale; slug: string; sessionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExperienceSessionAlias({ params, searchParams }: Props) {
  const [{ locale, slug, sessionId }, query] = await Promise.all([params, searchParams]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      search.append(key, item);
    }
  }
  // The session in the path takes precedence over any conflicting query value.
  search.set("sessionId", sessionId);
  redirect(`${localePath(locale, `/experiences/${encodeURIComponent(slug)}`)}?${search}#sessions`);
}
