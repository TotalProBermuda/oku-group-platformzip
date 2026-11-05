import type { Locale } from "@/types/i18n";

/** Swap the locale segment without losing a selected session or page anchor. */
export function localizedPathWithState(pathname: string, locale: Locale, search = "", hash = "") {
  const localePrefixed = /^\/(en|es|pt)(\/|$)/.test(pathname);
  const nextPath = localePrefixed
    ? pathname.replace(/^\/(en|es|pt)(\/|$)/, `/${locale}$2`)
    : pathname;
  return `${nextPath}${search}${hash}`;
}
