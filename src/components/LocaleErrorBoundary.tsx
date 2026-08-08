"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import type { Locale } from "@/types/i18n";

// Wraps the locale tree so client render errors are forwarded to
// /api/v1/error-capture even when error.tsx fallback isn't reached
// (e.g. errors in side-effects rather than rendering).
interface Props { children: ReactNode; locale: Locale }
interface State { hasError: boolean }

const FALLBACK_COPY: Record<Locale, { message: string; cta: string }> = {
  en: { message: "Something went wrong.", cta: "Return home" },
  es: { message: "Algo salió mal.",       cta: "Volver al inicio" },
  pt: { message: "Algo deu errado.",      cta: "Voltar para o início" },
};

export class LocaleErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void fetch("/api/v1/error-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: (error as Error & { digest?: string }).digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        boundary: "LocaleErrorBoundary",
        componentStack: info.componentStack ?? undefined,
      }),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      const copy = FALLBACK_COPY[this.props.locale] ?? FALLBACK_COPY.en;
      return (
        <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px", backgroundColor: "#f5f2ef", color: "#1a1a1a", fontFamily: "var(--inter, system-ui, sans-serif)", textAlign: "center" }}>
          <div>
            <p style={{ marginBottom: 16 }}>{copy.message}</p>
            <a href={`/${this.props.locale}`} style={{ display: "inline-block", padding: "12px 24px", backgroundColor: "#1a1a1a", color: "#f5f2ef", textDecoration: "none", borderRadius: 2 }}>
              {copy.cta}
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
