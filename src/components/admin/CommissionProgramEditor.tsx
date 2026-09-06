"use client";

import { useCallback, useEffect, useState } from "react";

type ProgramValue = "NONE" | "STANDARD" | "TRUSTED" | "PREMIUM" | "PRIVATE_EVENT";

type RuleSummary = {
  label: string | null;
  percentageBps: number;
  percentageCapCents: number | null;
  revenueBasis: string;
  source: string;
};

const OPTIONS: Array<{ value: ProgramValue; label: string; detail: string }> = [
  { value: "NONE", label: "Attribution only — no commission", detail: "Streetside hosts and other non-payable introductions" },
  { value: "STANDARD", label: "Standard", detail: "Drivers and open network · 5% up to $75" },
  { value: "TRUSTED", label: "Trusted", detail: "Verified tour guides · 10% up to $250" },
  { value: "PREMIUM", label: "Premium", detail: "Hotel concierge / doorman · 10% up to $350" },
  { value: "PRIVATE_EVENT", label: "Strategic / private event", detail: "Negotiated rule; held for review unless an event override exists" },
];

function money(cents: number | null) {
  return cents == null ? "no cap" : `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} cap`;
}

export default function CommissionProgramEditor({
  userId,
  readOnly = false,
  onSaved,
}: {
  userId: string;
  readOnly?: boolean;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState<ProgramValue>("NONE");
  const [actorId, setActorId] = useState<string | null>(null);
  const [rule, setRule] = useState<RuleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${userId}/referral-actor`);
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Could not load commission program");
      setActorId(body.actor?.id ?? null);
      setValue(body.actor?.commissionEligible ? (body.actor.commissionTier ?? "STANDARD") : "NONE");
      setRule(body.effectiveRule ?? null);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not load commission program", error: true });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/admin/users/${userId}/referral-actor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionEligible: value !== "NONE",
          commissionTier: value === "NONE" ? null : value,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Could not save commission program");
      setRule(body.effectiveRule ?? null);
      setMessage({ text: value === "NONE" ? "Saved — attribution only; no commission will be minted." : "Commission program assigned." });
      onSaved?.();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save commission program", error: true });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: "#9ca3af" }}>Loading commission program…</div>;
  if (!actorId) return <div style={{ fontSize: 13, color: "#b45309" }}>Link a commercial persona before assigning commission.</div>;

  const option = OPTIONS.find((item) => item.value === value)!;
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>
        Commission program
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          className="form-input"
          value={value}
          onChange={(event) => setValue(event.target.value as ProgramValue)}
          disabled={readOnly || saving}
          style={{ flex: 1 }}
        >
          {OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        {!readOnly && (
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Assign"}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 7 }}>{option.detail}</div>
      {value !== "NONE" && rule && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: 12 }}>
          <strong>Effective rule:</strong> {rule.label ?? rule.source} · {(rule.percentageBps / 100).toFixed(2)}% · {money(rule.percentageCapCents)}
          <div style={{ marginTop: 3, opacity: 0.8 }}>{rule.source.replace(/_/g, " ")} · {rule.revenueBasis.replace(/_/g, " ").toLowerCase()}</div>
        </div>
      )}
      {value !== "NONE" && !rule && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 12 }}>
          No active rule is configured for this tier. Closeouts will not have an approved policy until a rule is created.
        </div>
      )}
      {message && (
        <div style={{ marginTop: 10, fontSize: 12, color: message.error ? "#dc2626" : "#15803d" }}>{message.text}</div>
      )}
    </div>
  );
}
