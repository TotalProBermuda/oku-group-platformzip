"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import SlideOverPanel from "@/components/ui/SlideOverPanel";
import { RestrictedDataBanner } from "./RestrictedDataBanner";
import { BANK_VS_KYC_SENTENCE } from "./constants";

export interface AuditRibbonInfo {
  lastViewedBy?: string | null;
  lastViewedAt?: string | null;
  lastEditedBy?: string | null;
  lastEditedAt?: string | null;
}

export interface ReasonModalRequest {
  kind: "request_changes" | "hold" | "reject" | "lift_hold";
  title: string;
}

export interface FinanceReviewDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Permission level — "summary" hides restricted detail. */
  permissionLevel: "summary" | "detail";
  audit?: AuditRibbonInfo;
  loading?: boolean;
  errorMessage?: string | null;
  children: ReactNode;
  /** Sticky footer actions. */
  footer?: ReactNode;
}

export function FinanceReviewDrawer({
  open,
  onClose,
  title,
  permissionLevel,
  audit,
  loading,
  errorMessage,
  children,
  footer,
}: FinanceReviewDrawerProps) {
  return (
    <SlideOverPanel open={open} onClose={onClose} title={title} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <RestrictedDataBanner />
        {audit && <AuditRibbon audit={audit} />}
        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: 12,
              background: "#fef2f2",
              border: "1px solid #fee2e2",
              borderRadius: 6,
              color: "#991b1b",
              fontSize: 13,
            }}
          >
            {errorMessage}
          </div>
        )}
        {permissionLevel === "summary" ? (
          <div style={{ fontSize: 14, color: "#6b7280", padding: 12 }}>
            Restricted — request access to view detail.
          </div>
        ) : loading ? (
          <DrawerSkeleton />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {children}
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              {BANK_VS_KYC_SENTENCE}
            </p>
          </div>
        )}
      </div>
      {footer && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "#fff",
            borderTop: "1px solid var(--color-border, #e5e7eb)",
            padding: 12,
            marginTop: 16,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {footer}
        </div>
      )}
    </SlideOverPanel>
  );
}

function AuditRibbon({ audit }: { audit: AuditRibbonInfo }) {
  const lv = audit.lastViewedBy
    ? `Last viewed by ${audit.lastViewedBy}${audit.lastViewedAt ? ` on ${audit.lastViewedAt}` : ""}`
    : null;
  const le = audit.lastEditedBy
    ? `last edited by ${audit.lastEditedBy}${audit.lastEditedAt ? ` on ${audit.lastEditedAt}` : ""}`
    : null;
  if (!lv && !le) return null;
  return (
    <div style={{ fontSize: 12, color: "#6b7280" }}>
      {[lv, le].filter(Boolean).join(" · ")}
    </div>
  );
}

function DrawerSkeleton() {
  const row: React.CSSProperties = {
    height: 14,
    borderRadius: 4,
    background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
    backgroundSize: "200% 100%",
    animation: "trust-skeleton 1.4s ease-in-out infinite",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <style>{`@keyframes trust-skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      <div style={{ ...row, width: "60%" }} />
      <div style={{ ...row, width: "85%" }} />
      <div style={{ ...row, width: "70%" }} />
      <div style={{ ...row, width: "90%" }} />
    </div>
  );
}

/**
 * The "reason required" modal used by reject / request-changes / hold.
 * Renders inline (positioned: fixed) so it can layer above the drawer.
 */
export interface ReasonRequiredModalProps {
  open: boolean;
  request: ReasonModalRequest | null;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  minLength?: number;
  maxLength?: number;
}

export function ReasonRequiredModal({
  open,
  request,
  onCancel,
  onConfirm,
  minLength = 10,
  maxLength = 500,
}: ReasonRequiredModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [open, request?.kind]);

  if (!open || !request) return null;

  const tooShort = reason.trim().length < minLength;

  async function handleConfirm() {
    if (tooShort || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 24,
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{request.title}</h2>
        <label htmlFor="reason-textarea" style={{ fontSize: 13, color: "#374151" }}>
          Reason (will be emailed to the beneficiary)
        </label>
        <textarea
          id="reason-textarea"
          ref={ref}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={6}
          maxLength={maxLength}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid var(--color-border, #e5e7eb)",
            borderRadius: 6,
            fontSize: 14,
            resize: "vertical",
          }}
        />
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Use plain language. Do not paste account numbers or full ID numbers.
          {" "}
          {reason.length}/{maxLength}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 12,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              color: "#6b7280",
              fontSize: 14,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={tooShort || submitting}
            onClick={handleConfirm}
            style={{
              background: tooShort ? "#d1d5db" : "#c41e3a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: tooShort ? "not-allowed" : "pointer",
              minHeight: 44,
            }}
          >
            {submitting ? "Working…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FinanceReviewDrawer;
