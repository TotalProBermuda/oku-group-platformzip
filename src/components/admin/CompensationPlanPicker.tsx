"use client";

import { useEffect, useMemo, useState } from "react";

export interface CompensationPlanOption {
  id: string;
  name: string;
  modelType: string;
  appliesToType?: string | null;
}

export interface CompensationPlanPickerProps {
  userId: string | null | undefined;
  currentPlanId: string | null | undefined;
  currentPlanName?: string | null;
  plans?: CompensationPlanOption[];
  /** Called after a successful PATCH so parent can refetch. */
  onSaved?: (newPlanId: string | null) => void;
  /** Visual variant — "light" (white surfaces) or "dark" (dark drawer surfaces). */
  variant?: "light" | "dark";
  /** Hide the entire control if the actor lacks edit permission. Defaults to false; the API enforces. */
  readOnly?: boolean;
}

export default function CompensationPlanPicker({
  userId,
  currentPlanId,
  currentPlanName,
  plans: plansProp,
  onSaved,
  variant = "light",
  readOnly = false,
}: CompensationPlanPickerProps) {
  const [plans, setPlans] = useState<CompensationPlanOption[]>(plansProp ?? []);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [pickerValue, setPickerValue] = useState<string>(currentPlanId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Sync the picker default when the parent's currentPlanId changes (e.g. a different row is selected).
  useEffect(() => { setPickerValue(currentPlanId ?? ""); }, [currentPlanId]);

  // Lazy-fetch plans if the parent didn't supply them.
  useEffect(() => {
    if (plansProp && plansProp.length > 0) { setPlans(plansProp); return; }
    if (!userId) return;
    let cancelled = false;
    setLoadingPlans(true);
    fetch(`/api/v1/admin/users/${userId}/compensation`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j?.ok && Array.isArray(j.data?.plans)) setPlans(j.data.plans); })
      .catch(() => { /* surfaced when the user tries to save */ })
      .finally(() => { if (!cancelled) setLoadingPlans(false); });
    return () => { cancelled = true; };
  }, [userId, plansProp]);

  const dark = variant === "dark";
  const palette = useMemo(() => dark ? {
    label:    "rgba(255,255,255,0.5)",
    text:     "#fff",
    muted:    "rgba(255,255,255,0.55)",
    selectBg: "rgba(255,255,255,0.06)",
    selectBd: "rgba(255,255,255,0.12)",
    primary:  "#c41e3a",
    danger:   "#ef4444",
    success:  "#10b981",
  } : {
    label:    "#9ca3af",
    text:     "#1a1614",
    muted:    "#6b7280",
    selectBg: "#fff",
    selectBd: "#e5e7eb",
    primary:  "#c41e3a",
    danger:   "#dc2626",
    success:  "#16a34a",
  }, [dark]);

  if (!userId) {
    return (
      <div style={{ fontSize: 12, color: palette.muted, padding: "10px 12px" }}>
        No commercial persona linked to this user yet — link one to assign a plan.
      </div>
    );
  }

  const dirty = (pickerValue || null) !== (currentPlanId ?? null);
  const ctaLabel = pickerValue
    ? (currentPlanId ? "Change Plan" : "Assign Plan")
    : "Unassign";
  const ctaDisabled = saving || !dirty || readOnly;

  async function save() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/compensation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compensationPlanId: pickerValue || null }),
      });
      const json = await res.json().catch(() => ({} as { ok?: boolean; error?: string }));
      if (!res.ok || !json.ok) {
        const msg: string = json.error || `Save failed (${res.status})`;
        if (res.status === 403) setError("You don't have permission to change compensation plans.");
        else setError(msg);
        return;
      }
      setToast(pickerValue ? "Plan assigned" : "Plan removed");
      onSaved?.(pickerValue || null);
      setTimeout(() => setToast(null), 2400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  const selectId = `comp-plan-picker-${userId}`;
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={selectId} style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: palette.label, marginBottom: 8 }}>
        Assign Compensation Plan
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          id={selectId}
          aria-label="Compensation plan"
          disabled={readOnly || saving || loadingPlans}
          value={pickerValue}
          onChange={(e) => setPickerValue(e.target.value)}
          style={{
            flex: "1 1 220px",
            minWidth: 200,
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${palette.selectBd}`,
            background: palette.selectBg,
            color: palette.text,
            fontSize: 13,
            cursor: (readOnly || saving) ? "not-allowed" : "pointer",
          }}
        >
          <option value="">— Unassigned —</option>
          {plans.length === 0 && currentPlanId && currentPlanName && (
            <option value={currentPlanId}>{currentPlanName}</option>
          )}
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.modelType.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={ctaDisabled}
          onClick={save}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: ctaDisabled ? (dark ? "rgba(255,255,255,0.08)" : "#e5e7eb") : palette.primary,
            color: ctaDisabled ? palette.muted : "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: ctaDisabled ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {saving ? "Saving…" : ctaLabel}
        </button>
      </div>
      {loadingPlans && plans.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: palette.muted }}>Loading plans…</div>
      )}
      <div aria-live="polite" role="status">
        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: palette.danger, fontWeight: 600 }}>{error}</div>
        )}
        {toast && (
          <div style={{ marginTop: 8, fontSize: 12, color: palette.success, fontWeight: 600 }}>✓ {toast}</div>
        )}
      </div>
    </div>
  );
}
