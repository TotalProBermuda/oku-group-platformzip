"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/types/i18n";
import { LOCALE_COOKIE_KEY, LOCALE_STORAGE_KEY } from "@/i18n/config";
import { persistLocale } from "./LocaleProvider";
import Brandmark from "@/components/Brandmark";

const LANGUAGES: { code: Locale; label: string; native: string; sub: string }[] = [
  { code: "en", label: "English",   native: "English",   sub: "Continue in English" },
  { code: "es", label: "Spanish",   native: "Español",   sub: "Continuar en Español" },
  { code: "pt", label: "Portuguese",native: "Português",  sub: "Continuar em Português" },
];

const WELCOME: Record<Locale, { heading: string; instruction: string }> = {
  en: { heading: "Welcome",    instruction: "Select your preferred language to continue." },
  es: { heading: "Bienvenido", instruction: "Selecciona tu idioma preferido para continuar." },
  pt: { heading: "Bem-vindo",  instruction: "Selecione seu idioma preferido para continuar." },
};

export default function LanguageModal() {
  const [visible, setVisible] = useState(false);
  const [hoveredCode, setHoveredCode] = useState<Locale | null>(null);
  const router = useRouter();

  useEffect(() => {
    const hasChosenThisSession = sessionStorage.getItem("oku_session_locale");
    if (!hasChosenThisSession) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function handleSelect(code: Locale) {
    sessionStorage.setItem("oku_session_locale", code);
    persistLocale(code);
    setVisible(false);
    const path = window.location.pathname;
    const stripped = path.replace(/^\/(en|es|pt)(\/|$)/, "/");
    router.push(`/${code}${stripped === "/" ? "" : stripped}`);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(245,242,239,0.55)",
        backdropFilter: "blur(6px) saturate(1.1)",
        WebkitBackdropFilter: "blur(6px) saturate(1.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          maxWidth: 440,
          width: "100%",
          padding: "52px 48px",
          boxShadow: "0 24px 64px rgba(26,22,20,0.18), 0 4px 16px rgba(26,22,20,0.08)",
          border: "1px solid rgba(26,22,20,0.06)",
          textAlign: "center",
        }}
      >
        {/* Wordmark */}
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <Brandmark size={32} />
        </div>

        {/* Tri-lingual welcome — show all three simultaneously */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(["en", "es", "pt"] as Locale[]).map((loc) => (
              <div
                key={loc}
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: loc === "en" ? 28 : 18,
                  color: loc === "en" ? "#1a1614" : "#a89f97",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  transition: "color 0.2s",
                }}
              >
                {WELCOME[loc].heading}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 20, fontSize: 13, color: "#7d7269", lineHeight: 1.6 }}>
            {WELCOME.en.instruction}<br />
            {WELCOME.es.instruction}<br />
            {WELCOME.pt.instruction}
          </p>
        </div>

        {/* Language buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code)}
              onMouseEnter={() => setHoveredCode(lang.code)}
              onMouseLeave={() => setHoveredCode(null)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "14px 20px",
                border: `1.5px solid ${hoveredCode === lang.code ? "#1a1614" : "#e8e2dd"}`,
                borderRadius: 12,
                background: hoveredCode === lang.code ? "#1a1614" : "#fff",
                cursor: "pointer",
                transition: "all 0.15s",
                textAlign: "left",
              }}
            >
              <div>
                <div style={{
                  fontSize: 15, fontWeight: 600,
                  color: hoveredCode === lang.code ? "#fff" : "#1a1614",
                  letterSpacing: "-0.01em",
                  transition: "color 0.15s",
                }}>
                  {lang.native}
                </div>
                <div style={{
                  fontSize: 11, marginTop: 2,
                  color: hoveredCode === lang.code ? "rgba(255,255,255,0.55)" : "#a89f97",
                  transition: "color 0.15s",
                }}>
                  {lang.sub}
                </div>
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: hoveredCode === lang.code ? "rgba(255,255,255,0.5)" : "#c8c0b8",
                transition: "color 0.15s",
              }}>
                {lang.code.toUpperCase()}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
