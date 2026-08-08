"use client";

import { useState } from "react";

const STAGE_OPTIONS = [
  { value: "UNDER_REVIEW",        label: "Under Review" },
  { value: "HR_SCREEN",           label: "HR Screen" },
  { value: "MANAGER_REVIEW",      label: "Manager Review" },
  { value: "INTERVIEW_SCHEDULED", label: "Interview Scheduled" },
  { value: "TRIAL_SHIFT",         label: "Trial Shift" },
  { value: "OFFER_PENDING",       label: "Offer Pending" },
  { value: "HIRED",               label: "Hired" },
  { value: "REJECTED",            label: "Rejected" },
];

export default function StageTransitionForm({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: string;
}) {
  const [toStatus, setToStatus] = useState("UNDER_REVIEW");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hiring/applications/${applicationId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Transition failed");
        return;
      }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 500, marginBottom: 16 }}>
        Move Stage
      </h3>

      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
        Current: <strong>{currentStatus.replaceAll("_", " ")}</strong>
      </div>

      <div className="form-group">
        <label className="form-label">New Stage</label>
        <select
          className="form-input"
          value={toStatus}
          onChange={(e) => setToStatus(e.target.value)}
        >
          {STAGE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Note / Reason</label>
        <textarea
          className="form-input"
          style={{ minHeight: 80 }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional internal note"
        />
      </div>

      {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

      <button
        className="btn btn-primary"
        style={{ width: "100%" }}
        onClick={submit}
        disabled={loading}
      >
        {loading ? "Updating…" : "Update Status"}
      </button>
    </div>
  );
}
