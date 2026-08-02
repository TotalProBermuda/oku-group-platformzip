"use client";

import { useState, useRef, useCallback } from "react";

type Option = { label: string; value: string };

type FieldSchema = {
  key: string;
  widget?: string;
  type?: string;
  label: string;
  required?: boolean;
  options?: Option[];
  helpText?: string;
  placeholder?: string;
  validation?: Record<string, unknown>;
  meta?: { isComplianceLocked?: boolean };
  consentText?: string;
  declarationText?: string;
};

function FieldLabel({ field }: { field: FieldSchema }) {
  return (
    <label
      htmlFor={field.key}
      style={{
        display: "block",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--color-text)",
        marginBottom: 6,
      }}
    >
      {field.label}
      {field.required && (
        <span style={{ color: "var(--color-crimson)", marginLeft: 3 }}>*</span>
      )}
      {field.meta?.isComplianceLocked && (
        <span style={{ marginLeft: 6, fontSize: 10, color: "#d97706" }}>🔒</span>
      )}
    </label>
  );
}

function HelpText({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4, marginBottom: 8, lineHeight: 1.45 }}>
      {text}
    </p>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p role="alert" style={{ fontSize: 12, color: "var(--color-crimson)", fontWeight: 600, marginTop: 6 }}>
      {text}
    </p>
  );
}

function UploadField({
  field,
  value,
  error,
  onChange,
  readOnly,
  accept,
}: {
  field: FieldSchema;
  value: unknown;
  error?: string;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
  accept: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const f = value as File | string | null | undefined;
  const isFile = f instanceof File;
  const isUrl = typeof f === "string" && f.length > 0;
  const displayName = isFile ? (f as File).name : isUrl ? (f as string).split("/").pop() ?? f : null;

  const handleFiles = useCallback((files: FileList | null) => {
    if (files?.length) onChange(field.key, files[0]);
  }, [field.key, onChange]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!readOnly) handleFiles(e.dataTransfer.files);
  }, [readOnly, handleFiles]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!readOnly) setDragging(true);
  }, [readOnly]);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const applyUrl = () => {
    if (urlValue.trim()) {
      onChange(field.key, urlValue.trim());
      setUrlValue("");
      setShowUrl(false);
    }
  };

  if (readOnly) {
    return (
      <div>
        <FieldLabel field={field} />
        {field.helpText && <HelpText text={field.helpText} />}
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{displayName ?? "No file uploaded"}</p>
        {error && <ErrorText text={error} />}
      </div>
    );
  }

  return (
    <div>
      <FieldLabel field={field} />
      {field.helpText && <HelpText text={field.helpText} />}

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: `2px dashed ${dragging ? "var(--color-crimson)" : error ? "var(--color-crimson)" : "var(--color-border)"}`,
          borderRadius: 8,
          padding: "20px 16px",
          textAlign: "center",
          background: dragging ? "#fff5f5" : "var(--color-bg)",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          id={`upload_${field.key}`}
          style={{ display: "none" }}
          accept={accept}
          onChange={(e) => handleFiles(e.target.files)}
        />

        {displayName ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "var(--color-crimson)", fontWeight: 600 }}>📎 {displayName}</span>
            <button
              type="button"
              onClick={() => onChange(field.key, null)}
              style={{ fontSize: 12, color: "var(--color-text-muted)", background: "none", border: "1px solid var(--color-border)", borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 22, marginBottom: 8 }}>📎</div>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 4px" }}>
              {dragging ? "Drop file here" : "Drag & drop your file here"}
            </p>
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "0 0 12px", opacity: 0.7 }}>or</p>
          </>
        )}

        {!displayName && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-crimson)",
              background: "#fff",
              border: "1.5px solid var(--color-crimson)",
              borderRadius: 6,
              padding: "7px 16px",
              cursor: "pointer",
            }}
          >
            Select file from computer
          </button>
        )}
      </div>

      {/* Paste URL toggle */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowUrl((v) => !v)}
          style={{ fontSize: 11, color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
        >
          {showUrl ? "Cancel" : "Paste URL instead"}
        </button>
      </div>

      {showUrl && (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://…"
            style={{
              flex: 1,
              padding: "8px 10px",
              border: "1px solid var(--color-border)",
              borderRadius: 7,
              fontSize: 13,
              background: "#fff",
              color: "var(--color-text)",
            }}
            onKeyDown={(e) => e.key === "Enter" && applyUrl()}
          />
          <button
            type="button"
            onClick={applyUrl}
            style={{ padding: "8px 14px", background: "#1a1614", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Apply
          </button>
        </div>
      )}

      {error && <ErrorText text={error} />}
    </div>
  );
}

export default function DynamicField({
  field,
  value,
  error,
  onChange,
  readOnly,
}: {
  field: FieldSchema;
  value: unknown;
  error?: string;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}) {
  const widget = field.widget ?? field.type ?? "text";

  // ── Divider ────────────────────────────────────────────────────────────────
  if (widget === "divider") {
    return (
      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: 4 }}>
        {field.label && (
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
            {field.label}
          </p>
        )}
      </div>
    );
  }

  // ── Rich text info block ───────────────────────────────────────────────────
  if (widget === "rich_text_info") {
    return (
      <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "12px 16px" }}>
        {field.label && (
          <p style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text)", marginBottom: 4, marginTop: 0 }}>{field.label}</p>
        )}
        {field.helpText && (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>{field.helpText}</p>
        )}
      </div>
    );
  }

  // ── Data consent ──────────────────────────────────────────────────────────
  if (widget === "data_consent" || widget === "truthfulness_declaration") {
    const checked = value === true || value === "true";
    const text = field.consentText || field.declarationText || field.label;
    const isDeclaration = widget === "truthfulness_declaration";

    return (
      <div
        style={{
          background: isDeclaration ? "#fdf8f0" : "var(--color-bg)",
          border: `1px solid ${error ? "var(--color-crimson)" : isDeclaration ? "#e8d8b0" : "var(--color-border)"}`,
          borderRadius: 10,
          padding: "16px 18px",
        }}
      >
        <label style={{ display: "flex", gap: 12, cursor: readOnly ? "default" : "pointer", alignItems: "flex-start" }}>
          <div style={{ position: "relative", flexShrink: 0, marginTop: 1 }}>
            <input
              type="checkbox"
              id={field.key}
              checked={checked}
              onChange={(e) => onChange(field.key, e.target.checked)}
              disabled={readOnly}
              style={{ opacity: 0, position: "absolute", width: 18, height: 18, cursor: "pointer" }}
            />
            <div
              style={{
                width: 18, height: 18, borderRadius: 4,
                border: `2px solid ${checked ? "var(--color-crimson)" : "#c8c0bb"}`,
                background: checked ? "var(--color-crimson)" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
            >
              {checked && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <span style={{ fontSize: 14, color: "var(--color-text)", lineHeight: 1.55 }}>{text}</span>
        </label>
        {error && <ErrorText text={error} />}
      </div>
    );
  }

  // ── Yes / No toggle ────────────────────────────────────────────────────────
  if (widget === "yesno") {
    return (
      <div>
        <FieldLabel field={field} />
        {field.helpText && <HelpText text={field.helpText} />}
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {(["Yes", "No"] as const).map((opt) => {
            const isActive = value === opt.toLowerCase();
            return (
              <button
                key={opt}
                type="button"
                disabled={readOnly}
                onClick={() => onChange(field.key, opt.toLowerCase())}
                aria-pressed={isActive}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  fontSize: 15,
                  fontWeight: isActive ? 700 : 500,
                  borderRadius: 8,
                  border: `1.5px solid ${isActive ? "var(--color-crimson)" : "var(--color-border)"}`,
                  background: isActive ? "var(--color-crimson)" : "#fff",
                  color: isActive ? "#fff" : "var(--color-text-muted)",
                  cursor: readOnly ? "default" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {error && <ErrorText text={error} />}
      </div>
    );
  }

  // ── Radio ──────────────────────────────────────────────────────────────────
  if ((widget === "radio" || widget === "work_authorization") && field.options) {
    return (
      <div>
        <FieldLabel field={field} />
        {field.helpText && <HelpText text={field.helpText} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {field.options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: `1.5px solid ${isSelected ? "var(--color-crimson)" : "var(--color-border)"}`,
                  background: isSelected ? "#fdf0f0" : "#fff",
                  cursor: readOnly ? "default" : "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `2px solid ${isSelected ? "var(--color-crimson)" : "#c8c0bb"}`,
                    background: isSelected ? "var(--color-crimson)" : "#fff",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                  }}
                >
                  {isSelected && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />
                  )}
                </div>
                <input
                  type="radio"
                  name={field.key}
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => onChange(field.key, opt.value)}
                  disabled={readOnly}
                  style={{ display: "none" }}
                />
                <span style={{ fontSize: 14, fontWeight: isSelected ? 600 : 400, color: isSelected ? "var(--color-text)" : "var(--color-text-muted)", lineHeight: 1.4 }}>
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
        {error && <ErrorText text={error} />}
      </div>
    );
  }

  // ── Select / Dropdown ──────────────────────────────────────────────────────
  if (widget === "select" || widget === "years_experience") {
    return (
      <div>
        <FieldLabel field={field} />
        {field.helpText && <HelpText text={field.helpText} />}
        <div style={{ position: "relative" }}>
          <select
            id={field.key}
            style={{
              width: "100%",
              padding: "10px 40px 10px 14px",
              fontSize: 14,
              color: "var(--color-text)",
              background: "#fff",
              border: `1px solid ${error ? "var(--color-crimson)" : "var(--color-border)"}`,
              borderRadius: 8,
              appearance: "none",
              cursor: readOnly ? "default" : "pointer",
              outline: "none",
            }}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(field.key, e.target.value)}
            disabled={readOnly}
          >
            <option value="">Select one…</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--color-text-muted)" }}>
            ▾
          </div>
        </div>
        {error && <ErrorText text={error} />}
      </div>
    );
  }

  // ── Textarea ───────────────────────────────────────────────────────────────
  if (widget === "textarea") {
    return (
      <div>
        <FieldLabel field={field} />
        {field.helpText && <HelpText text={field.helpText} />}
        <textarea
          id={field.key}
          style={{
            width: "100%",
            minHeight: 100,
            padding: "10px 14px",
            fontSize: 14,
            color: "var(--color-text)",
            background: "#fff",
            border: `1px solid ${error ? "var(--color-crimson)" : "var(--color-border)"}`,
            borderRadius: 8,
            resize: "vertical",
            outline: "none",
            lineHeight: 1.5,
            boxSizing: "border-box",
          }}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          readOnly={readOnly}
        />
        {error && <ErrorText text={error} />}
      </div>
    );
  }

  // ── Multiselect / Shift chips ──────────────────────────────────────────────
  if (
    widget === "multiselect" ||
    widget === "shift_selector" ||
    widget === "language_selector" ||
    widget === "checkbox"
  ) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const selCount = selected.length;

    function toggle(val: string) {
      if (readOnly) return;
      if (selected.includes(val)) {
        onChange(field.key, selected.filter((v) => v !== val));
      } else {
        onChange(field.key, [...selected, val]);
      }
    }

    const isShift = widget === "shift_selector";

    return (
      <div>
        <FieldLabel field={field} />
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: 10, marginTop: 2 }}>
          {field.helpText ?? "Select all that apply"}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(field.options ?? []).map((opt) => {
            const isActive = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                disabled={readOnly}
                onClick={() => toggle(opt.value)}
                aria-pressed={isActive}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: isShift ? "10px 16px" : "8px 14px",
                  borderRadius: 24,
                  border: `1.5px solid ${isActive ? "var(--color-crimson)" : "var(--color-border)"}`,
                  background: isActive ? "var(--color-crimson)" : "#fff",
                  color: isActive ? "#fff" : "var(--color-text-muted)",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  cursor: readOnly ? "default" : "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                  minHeight: 38,
                }}
              >
                {isActive && (
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true">
                    <path d="M1 4.5L4.5 8L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
        {selCount > 0 && (
          <p style={{ fontSize: 12, color: "var(--color-crimson)", fontWeight: 600, marginTop: 8 }}>
            {selCount} {selCount === 1 ? "selected" : "selected"}
          </p>
        )}
        {error && <ErrorText text={error} />}
      </div>
    );
  }

  // ── Upload widgets ─────────────────────────────────────────────────────────
  if (["resume_upload", "portfolio_upload", "id_upload"].includes(widget)) {
    const accept =
      widget === "resume_upload" ? ".pdf,.doc,.docx"
      : widget === "id_upload"  ? ".pdf,.jpg,.png"
      : ".pdf,.zip,.jpg,.png";
    return (
      <UploadField
        field={field}
        value={value}
        error={error}
        onChange={onChange}
        readOnly={readOnly}
        accept={accept}
      />
    );
  }

  // ── Default: text / email / phone / number / date / url ───────────────────
  const inputType =
    widget === "email"  ? "email"
    : widget === "phone"  ? "tel"
    : widget === "number" ? "number"
    : widget === "date"   ? "date"
    : widget === "url"    ? "url"
    : "text";

  return (
    <div>
      <FieldLabel field={field} />
      {field.helpText && <HelpText text={field.helpText} />}
      <input
        id={field.key}
        type={inputType}
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: 14,
          color: "var(--color-text)",
          background: "#fff",
          border: `1px solid ${error ? "var(--color-crimson)" : "var(--color-border)"}`,
          borderRadius: 8,
          outline: "none",
          boxSizing: "border-box",
        }}
        placeholder={field.placeholder}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(field.key, e.target.value)}
        readOnly={readOnly}
        min={field.validation?.min as number | undefined}
        max={field.validation?.max as number | undefined}
        minLength={field.validation?.minLength as number | undefined}
        maxLength={field.validation?.maxLength as number | undefined}
      />
      {error && <ErrorText text={error} />}
    </div>
  );
}
