"use client";

import { useEffect } from "react";

const SUPPORTED_LOCALES = new Set(["en", "es", "pt"]);

function preferredLocale(): string {
  const cookieLocale = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("oku_locale="))
    ?.slice("oku_locale=".length);

  if (cookieLocale && SUPPORTED_LOCALES.has(cookieLocale)) return cookieLocale;

  for (const language of navigator.languages) {
    const locale = language.toLowerCase().split("-")[0];
    if (SUPPORTED_LOCALES.has(locale)) return locale;
  }

  return "en";
}

/**
 * Keep the deployment root independent of database and authentication work.
 * Replit probes `/` during cold starts and requires a prompt 200 response;
 * the browser performs the locale redirect after that static shell is served.
 */
export default function RootPage() {
  useEffect(() => {
    window.location.replace(`/${preferredLocale()}`);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#171310",
        color: "#f5f1ec",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p>Opening OKÜ Hospitality Group…</p>
    </main>
  );
}
