"use client";

import { useEffect } from "react";

// Last-resort fallback — fires when the root layout itself throws.
// Must render its own <html>/<body> because the layout has failed.
export default function GlobalError({
  error,
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
        boundary: "app/global-error.tsx",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f5f2ef", padding: "32px 16px", fontFamily: "system-ui, sans-serif", color: "#1a1a1a" }}>
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ fontSize: 40, margin: "0 0 12px", fontWeight: 500 }}>OKÜ Hospitality Group</h1>
          <p style={{ color: "#5a514c", margin: "0 0 32px" }}>We hit a problem loading the page. Please refresh.</p>
          <a href="/" style={{ display: "inline-block", padding: "14px 28px", backgroundColor: "#1a1a1a", color: "#f5f2ef", textDecoration: "none", borderRadius: 2 }}>
            Refresh
          </a>
        </div>
      </body>
    </html>
  );
}
