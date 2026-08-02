"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/types/i18n";
import { SUPPORTED_LOCALES } from "@/types/i18n";
import { persistLocale } from "./LocaleProvider";

interface Props {
  currentLocale: Locale;
  variant?: "header" | "footer" | "mobile";
}

const LABELS: Record<Locale, string> = { en: "EN", es: "ES", pt: "PT" };
const NATIVE: Record<Locale, string> = { en: "English", es: "Español", pt: "Português" };

export default function LanguageSwitcher({ currentLocale, variant = "header" }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function switchLocale(locale: Locale) {
    if (locale === currentLocale) return;
    persistLocale(locale);
    // If we're on a /(en|es|pt)/... route, swap the locale segment.
    // Otherwise (host portals, /admin/*, etc., which aren't locale-prefixed),
    // the path doesn't change — refresh so server components and the
    // LocaleProvider re-resolve from the persisted cookie.
    const localePrefixed = /^\/(en|es|pt)(\/|$)/.test(pathname);
    if (localePrefixed) {
      router.push(pathname.replace(/^\/(en|es|pt)(\/|$)/, `/${locale}$2`));
    } else {
      router.refresh();
    }
  }

  if (variant === "header") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {SUPPORTED_LOCALES.map((loc, i) => (
          <span key={loc} style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => switchLocale(loc)}
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: loc === currentLocale ? "#1a1614" : "#a89f97",
                background: "none", border: "none", cursor: loc === currentLocale ? "default" : "pointer",
                padding: "2px 4px",
                transition: "color 0.15s",
                textDecoration: loc === currentLocale ? "none" : "underline",
                textUnderlineOffset: 3,
              }}
              aria-label={`Switch to ${NATIVE[loc]}`}
            >
              {LABELS[loc]}
            </button>
            {i < SUPPORTED_LOCALES.length - 1 && (
              <span style={{ fontSize: 11, color: "#d0c8c0", marginLeft: 2 }}>·</span>
            )}
          </span>
        ))}
      </div>
    );
  }

  if (variant === "footer") {
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {SUPPORTED_LOCALES.map((loc) => (
          <button
            key={loc}
            onClick={() => switchLocale(loc)}
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: loc === currentLocale ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
              background: "none", border: "none", cursor: loc === currentLocale ? "default" : "pointer",
              padding: 0,
              transition: "color 0.15s",
            }}
            aria-label={`Switch to ${NATIVE[loc]}`}
          >
            {LABELS[loc]}
          </button>
        ))}
      </div>
    );
  }

  // mobile variant
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "16px 0" }}>
      {SUPPORTED_LOCALES.map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", padding: "14px 20px",
            border: `1.5px solid ${loc === currentLocale ? "#1a1614" : "#e8e2dd"}`,
            borderRadius: 12,
            background: loc === currentLocale ? "#1a1614" : "#fff",
            color: loc === currentLocale ? "#fff" : "#1a1614",
            cursor: "pointer",
            fontSize: 15, fontWeight: 600,
            transition: "all 0.15s",
          }}
          aria-label={`Switch to ${NATIVE[loc]}`}
        >
          {NATIVE[loc]}
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", opacity: 0.5, textTransform: "uppercase" }}>
            {LABELS[loc]}
          </span>
        </button>
      ))}
    </div>
  );
}
