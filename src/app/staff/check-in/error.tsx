"use client";

import { useEffect } from "react";

export default function StaffCheckInError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[staff/check-in] render error", error);
    void fetch("/api/v1/error-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        boundary: "app/staff/check-in/error.tsx",
      }),
    }).catch(() => {});
  }, [error]);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div style={{ padding: "32px 24px", maxWidth: 820, margin: "0 auto", fontFamily: "var(--inter, system-ui, sans-serif)" }}>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "#991b1b" }}>
          Check-in scanner failed to load
        </h2>
        <p style={{ margin: "0 0 12px", color: "#7f1d1d", fontSize: 14 }}>
          The scanner could not start. This is usually a camera permission issue, a browser
          that does not support the QR scanner library, or a transient deployment problem.
          Try the actions below — if the problem persists, please share this screen with the
          OKÜ engineering team.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => reset()}
            style={{ padding: "8px 14px", background: "#991b1b", color: "white", border: 0, borderRadius: 8, cursor: "pointer", fontSize: 14 }}
          >
            Retry
          </button>
          <a
            href="/staff"
            style={{ padding: "8px 14px", background: "white", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: 8, textDecoration: "none", fontSize: 14 }}
          >
            Back to staff portal
          </a>
        </div>
      </div>

      {isDev && (
        <details open style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#1e293b", marginBottom: 8 }}>
            Developer details (visible in dev only)
          </summary>
          <div style={{ marginTop: 12, fontSize: 12, color: "#475569" }}>
            <div><strong>Message:</strong> {error.message || "(empty)"}</div>
            {error.digest && <div><strong>Digest:</strong> {error.digest}</div>}
            {error.stack && (
              <pre style={{ marginTop: 8, padding: 12, background: "#0f172a", color: "#e2e8f0", borderRadius: 8, overflow: "auto", fontSize: 11, lineHeight: 1.5 }}>
                {error.stack}
              </pre>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
