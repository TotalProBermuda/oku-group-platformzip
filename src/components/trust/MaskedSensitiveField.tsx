"use client";

import { useState } from "react";
import {
  applyReplacement,
  ariaLabelEndingIn,
  formatMaskedDisplay,
  lastFourFromInput,
} from "./maskedFieldHelpers";

export interface MaskedSensitiveFieldProps {
  /** Human-friendly field name e.g. "Account number". */
  fieldName: string;
  /** Last 4 of the saved value, or null if not yet set. */
  last4: string | null;
  /** Whether editing is permitted. Defaults to true. */
  allowEdit?: boolean;
  /**
   * Submit handler — receives the new full cleartext value to be saved.
   * Implementation must replace the stored value, not append.
   */
  onSubmit?: (next: string) => Promise<void> | void;
  /** Override the default aria-label. */
  ariaLabel?: string;
  /** Show the lock icon (default true). */
  showLockIcon?: boolean;
  /** Optional placeholder when nothing is saved yet. */
  placeholder?: string;
  /** Inline (desktop) vs sheet-style (mobile). */
  variant?: "inline" | "sheet";
  /** Disabled state — e.g. when encryption key is unavailable. */
  disabled?: boolean;
  disabledReason?: string;
}

export function MaskedSensitiveField({
  fieldName,
  last4,
  allowEdit = true,
  onSubmit,
  ariaLabel,
  showLockIcon = true,
  placeholder = "Not yet set",
  variant = "inline",
  disabled = false,
  disabledReason,
}: MaskedSensitiveFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const display = formatMaskedDisplay(last4, placeholder);
  const label = ariaLabel ?? ariaLabelEndingIn(fieldName, last4);

  async function handleSave() {
    if (!onSubmit) return;
    if (!draft.trim()) {
      setError("Enter a value before saving.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Always replace — never append the new value to the previous one.
      // `applyReplacement` is the canonical helper; the unit test pins this
      // behaviour at the helper level so this call site cannot drift.
      const next = applyReplacement(last4, draft);
      await onSubmit(next);
      setEditing(false);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setDraft("");
    setEditing(false);
    setError(null);
  }

  if (disabled) {
    return (
      <div
        aria-label={label}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px", border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: 6, background: "#f9fafb", color: "#6b7280",
          fontFamily: "var(--font-body, system-ui)", fontSize: 14,
        }}
      >
        {showLockIcon && <LockIcon />}
        <span>{display}</span>
        {disabledReason && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#92700a" }}>
            {disabledReason}
          </span>
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <div
        aria-label={label}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px", border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: 6, background: "#fff",
          fontFamily: "var(--font-body, system-ui)", fontSize: 14,
        }}
      >
        {showLockIcon && <LockIcon />}
        <span style={{ letterSpacing: "0.08em" }}>{display}</span>
        {allowEdit && onSubmit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={editLinkStyle}
          >
            Replace
          </button>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div
      role="group"
      aria-label={`${fieldName} — replacing the saved value`}
      style={{
        display: "flex", flexDirection: "column", gap: 6,
        padding: variant === "sheet" ? 16 : 0,
      }}
    >
      <span
        // Screen-reader announcement: "Sensitive — replacing the saved value"
        style={srOnlyStyle}
      >
        Sensitive — replacing the saved value
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {showLockIcon && <LockIcon />}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${fieldName} — new value`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          disabled={submitting}
          style={{
            flex: 1, padding: "10px 12px",
            border: `1px solid ${error ? "#991b1b" : "var(--color-border, #e5e7eb)"}`,
            borderRadius: 6, fontSize: 14, height: 44,
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Encrypted on save. Only the last 4 digits will appear later
        {draft && ` (will save as •••• ${lastFourFromInput(draft) || "----"}).`}
      </div>
      {error && (
        <div role="alert" style={{ fontSize: 13, color: "#991b1b" }}>
          <span style={srOnlyStyle}>Error: </span>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          style={primaryBtnStyle}
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={handleCancel} style={textLinkStyle}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "#6b7280", flexShrink: 0 }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

const srOnlyStyle: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0,
  margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0,
};

const editLinkStyle: React.CSSProperties = {
  marginLeft: "auto", background: "none", border: "none",
  color: "#c41e3a", fontSize: 13, fontWeight: 600, cursor: "pointer",
  padding: "4px 8px", textDecoration: "underline",
};

const textLinkStyle: React.CSSProperties = {
  background: "none", border: "none", color: "#6b7280",
  fontSize: 14, cursor: "pointer", padding: "8px 4px", textDecoration: "underline",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "#c41e3a", color: "#fff", border: "none",
  borderRadius: 6, padding: "10px 18px", fontSize: 14, fontWeight: 600,
  cursor: "pointer", minHeight: 44,
};

export default MaskedSensitiveField;
