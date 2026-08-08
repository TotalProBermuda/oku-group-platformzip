"use client";

import { useState, type ReactNode } from "react";
import { VerificationStepper, type StepDefinition } from "./VerificationStepper";
import { BANK_VS_KYC_SENTENCE } from "./constants";

export interface MobileVerificationWizardProps {
  /** Zero-indexed current step. */
  currentStep: number;
  /** Step labels in order, e.g. ["Bank info", "Documents", "Review"]. */
  steps: string[];
  title: string;
  eyebrow?: string;
  children: ReactNode;
  /** Primary CTA. */
  primaryLabel: string;
  onPrimary?: () => void | Promise<void>;
  primaryDisabled?: boolean;
  /** Secondary text-link action above the bottom bar. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** When true, "back" prompts an Are-you-sure confirm. */
  hasUnsavedChanges?: boolean;
  /** Optional banner pinned to the top (e.g. ComplianceHoldBanner). */
  topBanner?: ReactNode;
  /** Optional privacy panel (e.g. PrivacyNoticePanel). */
  footerPanel?: ReactNode;
  /** Show the verbatim Bank-vs-KYC sentence above the bottom bar. */
  showBankVsKycSentence?: boolean;
}

export function MobileVerificationWizard({
  currentStep,
  steps,
  title,
  eyebrow,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  hasUnsavedChanges,
  topBanner,
  footerPanel,
  showBankVsKycSentence = true,
}: MobileVerificationWizardProps) {
  const [busy, setBusy] = useState(false);

  const stepDefs: StepDefinition[] = steps.map((label, idx) => ({
    label,
    state: idx < currentStep ? "past" : idx === currentStep ? "current" : "future",
  }));

  function handleSecondary() {
    if (!onSecondary) return;
    if (hasUnsavedChanges) {
      const ok =
        typeof window === "undefined" ||
        window.confirm("Discard unsaved changes on this step?");
      if (!ok) return;
    }
    onSecondary();
  }

  async function handlePrimary() {
    if (!onPrimary || primaryDisabled || busy) return;
    setBusy(true);
    try {
      await onPrimary();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafaf7",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        paddingBottom: 96,
      }}
    >
      {/* Top */}
      <header style={{ padding: "20px 20px 0" }}>
        <div style={{ marginBottom: 16 }}>
          <VerificationStepper steps={stepDefs} orientation="horizontal" />
        </div>
        {eyebrow && (
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#6b7280",
              fontWeight: 600,
            }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          style={{
            margin: "6px 0 16px",
            fontFamily: "var(--font-heading, Georgia, serif)",
            fontSize: 24,
            fontWeight: 500,
            color: "#1a1614",
          }}
        >
          {title}
        </h1>
      </header>

      {topBanner && <div style={{ padding: "0 20px 12px" }}>{topBanner}</div>}

      {/* Body */}
      <main style={{ flex: 1, padding: "0 20px", display: "flex", flexDirection: "column", gap: 24 }}>
        {children}

        {showBankVsKycSentence && (
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            {BANK_VS_KYC_SENTENCE}
          </p>
        )}

        {footerPanel}

        {secondaryLabel && (
          <button
            type="button"
            onClick={handleSecondary}
            style={{
              alignSelf: "center",
              background: "none",
              border: "none",
              color: "#6b7280",
              fontSize: 14,
              cursor: "pointer",
              padding: "8px 12px",
              minHeight: 44,
              textDecoration: "underline",
            }}
          >
            {secondaryLabel}
          </button>
        )}
      </main>

      {/* Sticky bottom bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#fff",
          borderTop: "1px solid var(--color-border, #e5e7eb)",
          padding: 12,
          boxShadow: "0 -4px 12px rgba(0,0,0,0.04)",
        }}
      >
        <button
          type="button"
          onClick={handlePrimary}
          disabled={primaryDisabled || busy}
          style={{
            width: "100%",
            height: 56,
            background: primaryDisabled ? "#d1d5db" : "#c41e3a",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 600,
            cursor: primaryDisabled ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Working…" : primaryLabel}
        </button>
      </div>
    </div>
  );
}

export default MobileVerificationWizard;
