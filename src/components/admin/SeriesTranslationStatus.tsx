"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { SeriesTranslation } from "./useSeriesTranslations";

type Props = {
  translation: SeriesTranslation | null;
  loading?: boolean;
  working?: boolean;
  error?: boolean;
  onResume?: () => void;
  onRetry?: () => void;
  onRefresh?: () => void;
};

const buttonStyle: CSSProperties = {
  border: "1px solid #b98c70", borderRadius: 7, background: "#fffdfa", color: "#704331",
  padding: "6px 10px", font: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer",
};

export default function SeriesTranslationStatus({
  translation, loading = false, working = false, error = false, onResume, onRetry, onRefresh,
}: Props) {
  const [remainingMs, setRemainingMs] = useState(translation?.retryAfterMs ?? 0);
  useEffect(() => {
    const until = Date.now() + (translation?.retryAfterMs ?? 0);
    setRemainingMs(Math.max(0, until - Date.now()));
    if (!translation?.retryAfterMs) return;
    // UI cooldown only: no network requests or background translation work.
    const timer = setInterval(() => {
      const remaining = Math.max(0, until - Date.now());
      setRemainingMs(remaining);
      if (!remaining) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [translation]);
  if (loading && !translation) {
    return <p role="status" aria-live="polite" style={{ color: "#756a61", fontSize: 12, margin: "8px 0" }}>Checking saved translation status…</p>;
  }
  if (!translation) {
    return <p role={error ? "alert" : "status"} aria-live="polite" style={{ color: error ? "#8b3028" : "#756a61", fontSize: 12, margin: "8px 0" }}>
      {error ? "Saved / translation status could not be checked. Retry to refresh." : "Translation status will appear after a text save."}
      {error && onRefresh && <button type="button" onClick={onRefresh} style={{ ...buttonStyle, marginLeft: 8 }}>Refresh status</button>}
    </p>;
  }
  const status = translation.state;
  const message = error
    ? "Saved / translation status could not be checked. Retry to refresh."
    : status === "ready"
      ? "Saved / translations ready."
      : status === "retry"
        ? "Saved / translation needs retry."
        : status === "pending"
          ? `Saved / translation pending${translation.pending ? ` (${translation.pending} remaining)` : ""}.`
          : "Translation status will appear after a text save.";
  const cooldown = status !== "ready" && remainingMs > 0
    ? ` Retry or resume is available in ${Math.ceil(remainingMs / 1000)} seconds.`
    : "";
  const action = status === "retry" ? onRetry : status === "pending" ? onResume : undefined;
  const actionLabel = status === "retry" ? "Retry translations" : "Resume translations";
  const waitingForLease = status !== "ready" && remainingMs > 0;
  const tone = status === "retry" || error ? "#8b3028" : status === "ready" ? "#315a43" : "#735a43";
  return (
    <div role={error ? "alert" : "status"} aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, margin: "8px 0", color: tone, fontSize: 12, lineHeight: 1.5 }}>
      <span>{message}{cooldown}{working ? " Working…" : ""}</span>
      {action && !working && <button type="button" onClick={action} disabled={waitingForLease} style={{ ...buttonStyle, opacity: waitingForLease ? 0.55 : 1, cursor: waitingForLease ? "wait" : "pointer" }}>{actionLabel}</button>}
      {waitingForLease && onRefresh && !working && <button type="button" onClick={onRefresh} style={buttonStyle}>Refresh status</button>}
      {error && onRefresh && !working && <button type="button" onClick={onRefresh} style={buttonStyle}>Refresh status</button>}
    </div>
  );
}
