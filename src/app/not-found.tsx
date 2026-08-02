import Link from "next/link";
import { headers } from "next/headers";
import { isValidLocale } from "@/i18n/config";
import { getTranslations } from "@/i18n/getTranslations";
import type { Locale } from "@/types/i18n";

// Root not-found.tsx is what Next.js renders for routes that don't
// match any page (including unmatched paths under [locale]/...). To
// make it locale-aware we read the x-locale request header forwarded
// by middleware.ts (which derives locale from the URL prefix), so
// `/es/anything-not-found` always renders ES copy and links to `/es`.
async function detectLocale(): Promise<Locale> {
  const h = await headers();
  const fromHeader = h.get("x-locale");
  if (fromHeader && isValidLocale(fromHeader)) return fromHeader;
  return "en";
}

export default async function RootNotFound() {
  const locale = await detectLocale();
  const t = await getTranslations(locale, ["errors"]);
  const errors = (t.errors ?? {}) as Record<string, string>;

  const copy: Record<Locale, { tagline: string; cta: string }> = {
    en: { tagline: "The page you're looking for has moved or doesn't exist.", cta: "Return home" },
    es: { tagline: "La página que buscas se ha movido o no existe.",        cta: "Volver al inicio" },
    pt: { tagline: "A página que você procura foi movida ou não existe.",   cta: "Voltar para o início" },
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f5f2ef", padding: "32px 16px", fontFamily: "var(--inter, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <img src="/images/oku-logo-wordmark.png" alt="OKÜ Hospitality Group" style={{ height: 40, marginBottom: 32 }} />
        <h1 style={{ fontFamily: "var(--cormorant, serif)", fontSize: 56, fontWeight: 500, color: "#1a1a1a", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          {errors.notFound ?? "Page not found"}
        </h1>
        <p style={{ color: "#5a514c", fontSize: 16, lineHeight: 1.6, margin: "0 0 32px" }}>
          {copy[locale].tagline}
        </p>
        <Link href={`/${locale}`} style={{ display: "inline-block", padding: "14px 28px", backgroundColor: "#1a1a1a", color: "#f5f2ef", textDecoration: "none", fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 2 }}>
          {errors.goHome ?? copy[locale].cta}
        </Link>
      </div>
    </div>
  );
}
