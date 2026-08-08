import Link from "next/link";
import { headers } from "next/headers";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import type { Locale } from "@/types/i18n";

// not-found.tsx receives no params — derive locale deterministically
// from the route via the x-locale request header forwarded by
// middleware.ts (which derives it from the URL prefix `/en|es|pt/...`).
// This guarantees `/es/anything-not-found` always renders ES copy and
// links to `/es`, regardless of cookie or accept-language preferences.
async function detectLocaleFromRoute(): Promise<Locale> {
  const h = await headers();
  const fromHeader = h.get("x-locale");
  if (fromHeader && isValidLocale(fromHeader)) return fromHeader;
  return "en";
}

export default async function LocaleNotFound() {
  const locale = await detectLocaleFromRoute();
  const t = await getTranslations(locale, ["errors"]);
  const errors = (t.errors ?? {}) as Record<string, string>;

  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f5f2ef", padding: "64px 16px", fontFamily: "var(--inter, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--cormorant, serif)", fontSize: 56, fontWeight: 500, color: "#1a1a1a", margin: "0 0 32px", letterSpacing: "-0.02em" }}>
          {errors.notFound ?? "Page not found."}
        </h1>
        <Link
          href={`/${locale}`}
          style={{ display: "inline-block", padding: "14px 28px", backgroundColor: "#1a1a1a", color: "#f5f2ef", textDecoration: "none", fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 2 }}
        >
          {errors.goHome ?? "Go to Home"}
        </Link>
      </div>
    </div>
  );
}
