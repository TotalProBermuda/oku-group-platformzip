"use client";

import { useRef, useState } from "react";
import DynamicField from "./DynamicField";
import { evaluateVisibility } from "@/lib/hiring/condition-evaluator";

type Option = { label: string; value: string };

type FieldSchema = {
  id?: string;
  key: string;
  widget?: string;
  type?: string;
  label: string;
  required?: boolean;
  options?: Option[];
  helpText?: string;
  placeholder?: string;
  validation?: Record<string, unknown>;
  visibility?: { showWhen: null | { logic: "AND" | "OR"; rules: { field: string; operator: "equals" | "not_equals" | "contains"; value: string }[] } };
  meta?: { isSystem?: boolean; isComplianceLocked?: boolean };
  consentText?: string;
  declarationText?: string;
};

type SectionSchema = {
  id: string;
  title: string;
  description?: string;
  fields: FieldSchema[];
};

type Schema = {
  sections: SectionSchema[];
};

const SKIP_REVIEW_WIDGETS = new Set(["divider", "rich_text_info"]);

function formatDisplayValue(field: FieldSchema, val: unknown): string {
  if (val === undefined || val === null || val === "") return "";
  if (val === true || val === "true") return "Yes";
  if (val === false || val === "false") return "No";

  // Multi-select: resolve labels from options
  if (Array.isArray(val) && field.options) {
    const labels = (val as string[])
      .map((v) => field.options?.find((o) => o.value === v)?.label ?? v)
      .filter(Boolean);
    return labels.join(", ") || "";
  }

  // Single select/radio: resolve label
  if (typeof val === "string" && field.options) {
    return field.options.find((o) => o.value === val)?.label ?? val;
  }

  return String(val);
}

function ReviewStep({
  schema,
  values,
  onBack,
  onEdit,
  onSubmit,
  submitting,
}: {
  schema: Schema;
  values: Record<string, unknown>;
  onBack: () => void;
  onEdit: (stepIndex: number) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text)" }}>
          Review Your Application
        </h2>
        <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>
          Please check your answers before submitting. Use Edit to make changes.
        </p>
      </div>

      {/* Section summaries */}
      {schema.sections.map((section, idx) => {
        const filledFields = section.fields.filter((f) => {
          if (SKIP_REVIEW_WIDGETS.has(f.widget ?? f.type ?? "")) return false;
          const val = values[f.key];
          if (val === undefined || val === null || val === "") return false;
          if (Array.isArray(val) && val.length === 0) return false;
          return true;
        });

        return (
          <div
            key={section.id}
            style={{
              background: "#fff",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: "1px solid var(--color-border)",
                background: "var(--color-bg)",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text)" }}>
                {section.title}
              </span>
              <button
                type="button"
                onClick={() => onEdit(idx)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-crimson)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 6px",
                  textDecoration: "underline",
                }}
              >
                Edit
              </button>
            </div>

            <div style={{ padding: "4px 0" }}>
              {filledFields.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)", padding: "12px 20px", fontStyle: "italic" }}>
                  No answers provided in this section.
                </p>
              ) : (
                filledFields.map((field, fi) => {
                  const display = formatDisplayValue(field, values[field.key]);
                  return (
                    <div
                      key={field.key}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "10px 20px",
                        borderBottom: fi < filledFields.length - 1 ? "1px solid #f0ebe8" : "none",
                        alignItems: "flex-start",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "var(--color-text-muted)", minWidth: 180, flexShrink: 0, lineHeight: 1.4 }}>
                        {field.label}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--color-text)", fontWeight: 500, lineHeight: 1.4, flex: 1 }}>
                        {display || "—"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}

      {/* Final confirmation */}
      <div
        style={{
          background: "#fdf8f0",
          border: "1px solid #e8d8b0",
          borderRadius: 10,
          padding: "16px 20px",
        }}
      >
        <label style={{ display: "flex", gap: 12, cursor: "pointer", alignItems: "flex-start" }}>
          <div style={{ position: "relative", flexShrink: 0, marginTop: 1 }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ opacity: 0, position: "absolute", width: 18, height: 18, cursor: "pointer" }}
            />
            <div
              style={{
                width: 18, height: 18, borderRadius: 4,
                border: `2px solid ${confirmed ? "var(--color-crimson)" : "#c8c0bb"}`,
                background: confirmed ? "var(--color-crimson)" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
            >
              {confirmed && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <span style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.55 }}>
            I confirm that all information provided in this application is accurate and complete, and I consent to OKÜ Hospitality Group processing my data for the purpose of assessing this application.
          </span>
        </label>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={{ fontSize: 13, color: "var(--color-text-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "8px 0" }}>
          ← Edit Answers
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !confirmed}
          style={{
            marginLeft: "auto",
            padding: "14px 32px",
            fontSize: 15,
            fontWeight: 700,
            background: confirmed && !submitting ? "var(--color-crimson)" : "#c8c0bb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: confirmed && !submitting ? "pointer" : "not-allowed",
            transition: "background 0.15s",
          }}
        >
          {submitting ? "Submitting…" : "Submit Application →"}
        </button>
      </div>
    </div>
  );
}

export default function DynamicFormRenderer({
  schema,
  initialValues,
  onSaveDraft,
  onSubmit,
  isPreview,
}: {
  schema: Schema;
  initialValues?: Record<string, unknown>;
  onSaveDraft?: (values: Record<string, unknown>) => Promise<void>;
  onSubmit: (values: Record<string, unknown>) => Promise<{ errors?: Record<string, string> }> | void;
  isPreview?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {});
  const [step, setStep] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const sections = schema.sections;
  const current = sections[step];
  const totalSteps = sections.length;

  function scrollToCard() {
    setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function updateValue(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validateStep(): boolean {
    const newErrors: Record<string, string> = {};
    current.fields.forEach((field) => {
      if (!field.required) return;
      const visible = evaluateVisibility(field.visibility?.showWhen, values);
      if (!visible) return;
      const val = values[field.key];
      const isEmpty =
        val === undefined || val === null || val === "" ||
        (Array.isArray(val) && val.length === 0) ||
        val === false;
      if (isEmpty) {
        const label = field.label.length > 40 ? field.label.slice(0, 40) + "…" : field.label;
        newErrors[field.key] = `${label} is required`;
      }
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      scrollToCard();
    }
    return Object.keys(newErrors).length === 0;
  }

  async function handleSaveDraft() {
    if (!onSaveDraft) return;
    setSaving(true);
    try {
      await onSaveDraft(values);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const result = await onSubmit(values);
      if (result?.errors) {
        setErrors(result.errors);
        setShowReview(false);
        scrollToCard();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleContinue() {
    if (isPreview) {
      setStep((s) => Math.min(s + 1, sections.length - 1));
      scrollToCard();
      return;
    }
    if (!validateStep()) return;
    if (step < sections.length - 1) {
      setStep((s) => s + 1);
      scrollToCard();
    } else {
      setShowReview(true);
      scrollToCard();
    }
  }

  function handleBack() {
    setStep((s) => s - 1);
    scrollToCard();
  }

  function handleEditStep(idx: number) {
    setShowReview(false);
    setStep(idx);
    scrollToCard();
  }

  if (showReview && !isPreview) {
    return (
      <div ref={cardRef} style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 14, padding: "28px 28px" }}>
        <ReviewStep
          schema={schema}
          values={values}
          onBack={() => { setShowReview(false); scrollToCard(); }}
          onEdit={handleEditStep}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>
    );
  }

  const visibleFields = current?.fields.filter((f) =>
    evaluateVisibility(f.visibility?.showWhen, values)
  ) ?? [];

  const isLastStep = step === sections.length - 1;

  return (
    <div ref={cardRef} style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 14, padding: "28px 28px" }}>

      {/* Progress segments */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {sections.map((sec, i) => (
            <div
              key={i}
              title={sec.title}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 2,
                background: i < step ? "var(--color-crimson)" : i === step ? "var(--color-crimson)" : "var(--color-border)",
                opacity: i < step ? 1 : i === step ? 1 : 0.4,
                transition: "background 0.25s, opacity 0.25s",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-crimson)" }}>
            Step {step + 1} of {totalSteps}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {isLastStep ? "Final step" : `${totalSteps - step - 1} step${totalSteps - step - 1 === 1 ? "" : "s"} remaining`}
          </span>
        </div>
      </div>

      {/* Section heading */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text)" }}>
        {current?.title}
      </h2>
      {current?.description && (
        <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: "0 0 20px", lineHeight: 1.5 }}>
          {current.description}
        </p>
      )}

      {/* Form error banner */}
      {errors._form && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14, color: "#b91c1c" }}>
          {errors._form}
        </div>
      )}

      {/* Fields */}
      <div style={{ display: "grid", gap: 22, marginTop: 20 }}>
        {visibleFields.map((field) => (
          <DynamicField
            key={field.key}
            field={field}
            value={values[field.key]}
            error={errors[field.key]}
            onChange={updateValue}
            readOnly={isPreview}
          />
        ))}
        {visibleFields.length === 0 && (
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", fontStyle: "italic" }}>No fields in this section.</p>
        )}
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 32, flexWrap: "wrap" }}>

        {/* Back — tertiary */}
        {step > 0 && (
          <button
            type="button"
            onClick={handleBack}
            style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px 4px",
              flexShrink: 0,
            }}
          >
            ← Back
          </button>
        )}

        {/* Save Draft — secondary */}
        {onSaveDraft && (
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: saved ? "#1f8a55" : "var(--color-text-muted)",
              background: "transparent",
              border: `1px solid ${saved ? "#bbf7d0" : "var(--color-border)"}`,
              borderRadius: 6,
              cursor: saving ? "not-allowed" : "pointer",
              padding: "7px 14px",
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save Draft"}
          </button>
        )}

        {/* Continue / Review — primary */}
        <button
          type="button"
          onClick={handleContinue}
          style={{
            marginLeft: "auto",
            padding: "12px 28px",
            fontSize: 14,
            fontWeight: 700,
            background: "var(--color-crimson)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {isLastStep
            ? isPreview ? "Preview Review →" : "Review & Submit →"
            : "Continue →"}
        </button>
      </div>
    </div>
  );
}
