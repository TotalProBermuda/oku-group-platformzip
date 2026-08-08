"use client";

import { useEffect } from "react";
import Link from "next/link";

// Root-level error fallback for failures above the locale tree.
// Self-contained EN copy — no LocaleProvider available at this depth.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/v1/error-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        boundary: "app/error.tsx",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f5f2ef", padding: "32px 16px", fontFamily: "var(--inter, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <img src="/images/oku-logo-wordmark.png" alt="OKÜ Hospitality Group" style={{ height: 40, marginBottom: 32 }} />
        <h1 style={{ fontFamily: "var(--cormorant, serif)", fontSize: 56, fontWeight: 500, color: "#1a1a1a", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          Something went wrong
        </h1>
        <p style={{ color: "#5a514c", fontSize: 16, lineHeight: 1.6, margin: "0 0 32px" }}>
          Our team has been notified. You can try again, or head back home.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => reset()} style={{ padding: "14px 28px", backgroundColor: "#1a1a1a", color: "#f5f2ef", border: "none", cursor: "pointer", fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 2, fontFamily: "inherit" }}>
            Try again
          </button>
          <Link href="/" style={{ padding: "14px 28px", backgroundColor: "transparent", color: "#1a1a1a", border: "1px solid #1a1a1a", textDecoration: "none", fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 2 }}>
            Return home
          </Link>
        </div>
        {error.digest && (
          <p style={{ marginTop: 32, fontSize: 12, color: "#a89e99" }}>Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
