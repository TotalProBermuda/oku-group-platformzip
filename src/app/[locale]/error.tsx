"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslation, useLocale } from "@/components/i18n/LocaleProvider";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslation();
  const locale = useLocale();

  useEffect(() => {
    void fetch("/api/v1/error-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        boundary: "app/[locale]/error.tsx",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f5f2ef", padding: "64px 16px", fontFamily: "var(--inter, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--cormorant, serif)", fontSize: 56, fontWeight: 500, color: "#1a1a1a", margin: "0 0 16px", letterSpacing: "-0.02em" }}>
          {t("errors", "generic")}
        </h1>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
          <button
            onClick={() => reset()}
            style={{ padding: "14px 28px", backgroundColor: "#1a1a1a", color: "#f5f2ef", border: "none", cursor: "pointer", fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 2, fontFamily: "inherit" }}
          >
            {t("errors", "tryAgain")}
          </button>
          <Link
            href={`/${locale}`}
            style={{ padding: "14px 28px", backgroundColor: "transparent", color: "#1a1a1a", border: "1px solid #1a1a1a", textDecoration: "none", fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 2 }}
          >
            {t("errors", "goHome")}
          </Link>
        </div>
        {error.digest && (
          <p style={{ marginTop: 32, fontSize: 12, color: "#a89e99" }}>
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
