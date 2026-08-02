"use client";
import { useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok"; to: string }
  | { kind: "error"; message: string };

export default function SendTestAlertButton({
  label,
  sendingLabel,
  successLabel,
  errorLabel,
}: {
  label: string;
  sendingLabel: string;
  successLabel: string;
  errorLabel: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onClick() {
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/v1/admin/launch-readiness/test-alert", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        retryAfterSeconds?: number;
        data?: { to?: string };
      };
      if (res.status === 429) {
        const retryAfter =
          json.retryAfterSeconds ?? (Number(res.headers.get("Retry-After")) || 60);
        setStatus({
          kind: "error",
          message:
            json.error ??
            `Too many test alerts. Please wait ${retryAfter}s before trying again.`,
        });
        return;
      }
      if (!res.ok || !json.ok) {
        setStatus({
          kind: "error",
          message: json.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setStatus({ kind: "ok", to: json.data?.to ?? "" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const pending = status.kind === "sending";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        data-testid="launch-readiness-send-test-alert"
        style={{
          padding: "6px 14px",
          borderRadius: 6,
          border: "1px solid #cbd5e1",
          background: pending ? "#e2e8f0" : "#fff",
          color: "#0f172a",
          cursor: pending ? "wait" : "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {pending ? sendingLabel : label}
      </button>
      {status.kind === "ok" && (
        <span
          data-testid="launch-readiness-send-test-alert-ok"
          style={{ fontSize: 12, color: "#166534" }}
        >
          {successLabel} {status.to ? `→ ${status.to}` : ""}
        </span>
      )}
      {status.kind === "error" && (
        <span
          data-testid="launch-readiness-send-test-alert-error"
          style={{ fontSize: 12, color: "#991b1b" }}
        >
          {errorLabel}: {status.message}
        </span>
      )}
    </span>
  );
}
