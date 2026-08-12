"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type CommissionTierType = "STANDARD" | "TRUSTED" | "PREMIUM" | "PRIVATE_EVENT";
type CommissionScopeType = "GLOBAL" | "VENUE" | "REFERRER_ACTOR" | "CAMPAIGN_OFFER" | "PRIVATE_EVENT";
type CommissionRevenueBasis =
  | "COMMISSIONABLE_CENTS"
  | "GROSS_MINUS_TAX"
  | "GROSS_MINUS_TAX_MINUS_TIP"
  | "GROSS_MINUS_TAX_MINUS_DISCOUNT_REFUND_TIP"
  | "MANUAL_REVIEW";

type CommissionRule = {
  id: string;
  tier: CommissionTierType;
  scopeType: CommissionScopeType;
  scopeId: string | null;
  revenueBasis: CommissionRevenueBasis;
  percentageBps: number;
  percentageCapCents: number | null;
  perPersonCents: number | null;
  maxTakeRateBps: number | null;
  version: number;
  active: boolean;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

type RuleForm = {
  tier: CommissionTierType;
  scopeType: CommissionScopeType;
  scopeId: string;
  revenueBasis: CommissionRevenueBasis;
  percentagePct: string;
  percentageCapDollars: string;
  perPersonDollars: string;
  maxTakeRatePct: string;
  label: string;
};

const TIERS: CommissionTierType[] = ["STANDARD", "TRUSTED", "PREMIUM", "PRIVATE_EVENT"];
const SCOPES: CommissionScopeType[] = ["GLOBAL", "VENUE", "REFERRER_ACTOR", "CAMPAIGN_OFFER", "PRIVATE_EVENT"];
const BASES: CommissionRevenueBasis[] = [
  "COMMISSIONABLE_CENTS",
  "GROSS_MINUS_TAX",
  "GROSS_MINUS_TAX_MINUS_TIP",
  "GROSS_MINUS_TAX_MINUS_DISCOUNT_REFUND_TIP",
  "MANUAL_REVIEW",
];

const EMPTY_FORM: RuleForm = {
  tier: "STANDARD",
  scopeType: "GLOBAL",
  scopeId: "",
  revenueBasis: "COMMISSIONABLE_CENTS",
  percentagePct: "10",
  percentageCapDollars: "300",
  perPersonDollars: "5",
  maxTakeRatePct: "",
  label: "",
};

const RESOLUTION_ORDER = [
  "Private event assignment",
  "Campaign or offer override",
  "Specific referrer actor",
  "Venue + referrer tier",
  "Venue default",
  "Global + referrer tier",
  "Global default",
];

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cents(value: number | null) {
  if (value == null) return "None";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function bps(value: number | null) {
  if (value == null) return "None";
  const pct = value / 100;
  return `${pct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function dollarsToCents(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return NaN;
  return Math.round(parsed * 100);
}

function pctToBps(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return NaN;
  return Math.round(parsed * 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function ruleFormula(rule: CommissionRule) {
  const parts = [`${bps(rule.percentageBps)} of ${titleCase(rule.revenueBasis)}`];
  if (rule.percentageCapCents != null) parts.push(`cap ${cents(rule.percentageCapCents)}`);
  if (rule.perPersonCents != null) parts.push(`${cents(rule.perPersonCents)} per guest floor`);
  if (rule.maxTakeRateBps != null) parts.push(`max take-rate ${bps(rule.maxTakeRateBps)}`);
  return parts.join(" · ");
}

export default function CommissionRulesPage() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ tier: string; scopeType: string; active: string }>({
    tier: "",
    scopeType: "",
    active: "true",
  });
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);

  useEffect(() => {
    void fetchRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.tier, filters.scopeType, filters.active]);

  const groupedRules = useMemo(() => {
    const groups = new Map<string, CommissionRule[]>();
    for (const rule of rules) {
      const key = `${rule.scopeType}:${rule.scopeId ?? "default"}`;
      groups.set(key, [...(groups.get(key) ?? []), rule]);
    }
    return Array.from(groups.entries()).map(([key, items]) => ({ key, rules: items }));
  }, [rules]);

  async function fetchRules() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.tier) params.set("tier", filters.tier);
      if (filters.scopeType) params.set("scopeType", filters.scopeType);
      if (filters.active) params.set("active", filters.active);
      const res = await fetch(`/api/v1/admin/commission-rules?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load commission rules");
      setRules(body.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load commission rules");
    } finally {
      setLoading(false);
    }
  }

  async function createRule() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const percentageBps = pctToBps(form.percentagePct);
      const percentageCapCents = dollarsToCents(form.percentageCapDollars);
      const perPersonCents = dollarsToCents(form.perPersonDollars);
      const maxTakeRateBps = pctToBps(form.maxTakeRatePct);

      if (percentageBps == null || Number.isNaN(percentageBps)) {
        throw new Error("Percentage is required and must be a positive number.");
      }
      if ([percentageCapCents, perPersonCents, maxTakeRateBps].some((v) => Number.isNaN(v))) {
        throw new Error("Dollar and percentage fields must be positive numbers or blank.");
      }
      if (form.scopeType !== "GLOBAL" && !form.scopeId.trim()) {
        throw new Error("Scope ID is required for venue, referrer, offer, and private-event rules.");
      }

      const res = await fetch("/api/v1/admin/commission-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: form.tier,
          scopeType: form.scopeType,
          scopeId: form.scopeType === "GLOBAL" ? null : form.scopeId.trim(),
          revenueBasis: form.revenueBasis,
          percentageBps,
          percentageCapCents,
          perPersonCents,
          maxTakeRateBps,
          label: form.label.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create commission rule");

      setForm(EMPTY_FORM);
      setNotice("Commission rule version created. Existing allocations keep their original calculation trace.");
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create commission rule");
    } finally {
      setSaving(false);
    }
  }

  async function patchRule(id: string, patch: Partial<Pick<CommissionRule, "active" | "label">>) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/admin/commission-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update rule");
      setRules((prev) => prev.map((rule) => (rule.id === id ? body.data : rule)));
      setNotice("Rule metadata updated. Formula fields remain immutable by design.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rule");
    }
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 56px", fontFamily: "var(--font-sans)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div style={eyebrowStyle}>ProofPay Governance</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 30, margin: "4px 0 8px", color: "#0f172a" }}>
            Commission Rules
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14, maxWidth: 760, lineHeight: 1.6 }}>
            Create versioned economics for referrers, venues, campaign offers, and private events.
            Formula fields are immutable after creation so payout allocations can always explain which rule applied and why.
          </p>
        </div>
        <span style={pillStyle("#fee2e2", "#991b1b")}>Superadmin only</span>
      </header>

      <section style={calloutStyle}>
        <div>
          <strong>Operating model:</strong> rules can blend percentage, cap, per-person floor, and max take-rate. For example,
          10% of commissionable revenue capped at $300, with a $5 per guest floor for large parties.
        </div>
        <ol style={{ margin: "10px 0 0", paddingLeft: 18, color: "#475569", lineHeight: 1.55 }}>
          {RESOLUTION_ORDER.map((item, index) => <li key={item}>{index + 1}. {item}</li>)}
        </ol>
      </section>

      {error && <div style={alertStyle("#fff1f2", "#fda4af", "#be123c")}>{error}</div>}
      {notice && <div style={alertStyle("#ecfdf5", "#bbf7d0", "#166534")}>{notice}</div>}

      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={sectionTitleStyle}>Create New Rule Version</h2>
            <p style={mutedStyle}>Do not edit old formulas. Create a new version and deactivate the old one when needed.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
          <Field label="Tier">
            <select style={inputStyle} value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as CommissionTierType }))}>
              {TIERS.map((tier) => <option key={tier} value={tier}>{titleCase(tier)}</option>)}
            </select>
          </Field>
          <Field label="Scope">
            <select style={inputStyle} value={form.scopeType} onChange={(e) => setForm((f) => ({ ...f, scopeType: e.target.value as CommissionScopeType, scopeId: e.target.value === "GLOBAL" ? "" : f.scopeId }))}>
              {SCOPES.map((scope) => <option key={scope} value={scope}>{titleCase(scope)}</option>)}
            </select>
          </Field>
          <Field label="Scope ID">
            <input
              style={inputStyle}
              value={form.scopeId}
              disabled={form.scopeType === "GLOBAL"}
              onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))}
              placeholder={form.scopeType === "GLOBAL" ? "Not used" : "venue/referrer/offer/event id"}
            />
          </Field>
          <Field label="Revenue Basis">
            <select style={inputStyle} value={form.revenueBasis} onChange={(e) => setForm((f) => ({ ...f, revenueBasis: e.target.value as CommissionRevenueBasis }))}>
              {BASES.map((basis) => <option key={basis} value={basis}>{titleCase(basis)}</option>)}
            </select>
          </Field>
          <Field label="Percentage">
            <input style={inputStyle} value={form.percentagePct} onChange={(e) => setForm((f) => ({ ...f, percentagePct: e.target.value }))} placeholder="10" />
          </Field>
          <Field label="Percentage Cap USD">
            <input style={inputStyle} value={form.percentageCapDollars} onChange={(e) => setForm((f) => ({ ...f, percentageCapDollars: e.target.value }))} placeholder="300" />
          </Field>
          <Field label="Per Guest Floor USD">
            <input style={inputStyle} value={form.perPersonDollars} onChange={(e) => setForm((f) => ({ ...f, perPersonDollars: e.target.value }))} placeholder="5" />
          </Field>
          <Field label="Max Take-Rate %">
            <input style={inputStyle} value={form.maxTakeRatePct} onChange={(e) => setForm((f) => ({ ...f, maxTakeRatePct: e.target.value }))} placeholder="Optional" />
          </Field>
        </div>

        <div style={{ marginTop: 14 }}>
          <Field label="Operator Label">
            <input
              style={inputStyle}
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Trusted hotel concierge standard"
            />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" disabled={saving} onClick={createRule} style={primaryButtonStyle}>
            {saving ? "Creating..." : "Create Rule Version"}
          </button>
        </div>
      </section>

      <section style={{ ...panelStyle, marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={sectionTitleStyle}>Rule Registry</h2>
            <p style={mutedStyle}>Filter and deactivate rule versions. Historical allocation traces remain intact.</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <select style={compactSelectStyle} value={filters.tier} onChange={(e) => setFilters((f) => ({ ...f, tier: e.target.value }))}>
              <option value="">All tiers</option>
              {TIERS.map((tier) => <option key={tier} value={tier}>{titleCase(tier)}</option>)}
            </select>
            <select style={compactSelectStyle} value={filters.scopeType} onChange={(e) => setFilters((f) => ({ ...f, scopeType: e.target.value }))}>
              <option value="">All scopes</option>
              {SCOPES.map((scope) => <option key={scope} value={scope}>{titleCase(scope)}</option>)}
            </select>
            <select style={compactSelectStyle} value={filters.active} onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value }))}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
              <option value="">All states</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading commission rules...</div>
        ) : groupedRules.length === 0 ? (
          <div style={emptyStyle}>No commission rules match this filter.</div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {groupedRules.map((group) => (
              <div key={group.key} style={{ border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ background: "#f8fafc", padding: "10px 14px", borderBottom: "1px solid #e2e8f0", color: "#334155", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {group.key.replace(":", " / ")}
                </div>
                {group.rules.map((rule) => (
                  <div key={rule.id} data-testid="commission-rule-row" style={{ padding: 16, borderTop: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 18 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                          <span style={pillStyle("#e0f2fe", "#075985")}>{titleCase(rule.tier)}</span>
                          <span style={pillStyle(rule.active ? "#dcfce7" : "#e2e8f0", rule.active ? "#166534" : "#475569")}>
                            {rule.active ? "Active" : "Inactive"}
                          </span>
                          <span style={pillStyle("#fef3c7", "#92400e")}>v{rule.version}</span>
                        </div>
                        <h3 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: 16 }}>
                          {rule.label || `${titleCase(rule.scopeType)} ${rule.scopeId ?? "default"}`}
                        </h3>
                        <p style={{ margin: "0 0 8px", color: "#475569", fontSize: 13, lineHeight: 1.55 }}>
                          {ruleFormula(rule)}
                        </p>
                        <p style={{ margin: 0, color: "#94a3b8", fontSize: 12 }}>
                          Created {formatDate(rule.createdAt)} · Rule ID {rule.id}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexShrink: 0 }}>
                        <button type="button" style={secondaryButtonStyle} onClick={() => {
                          const label = prompt("Update operator label", rule.label ?? "");
                          if (label !== null) void patchRule(rule.id, { label: label.trim() || null });
                        }}>
                          Relabel
                        </button>
                        <button
                          type="button"
                          style={rule.active ? dangerButtonStyle : secondaryButtonStyle}
                          onClick={() => void patchRule(rule.id, { active: !rule.active })}
                        >
                          {rule.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

const eyebrowStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 22,
  boxShadow: "0 18px 50px rgba(15, 23, 42, 0.05)",
};

const calloutStyle: CSSProperties = {
  ...panelStyle,
  background: "#f8fafc",
  color: "#334155",
  fontSize: 13,
  lineHeight: 1.55,
  marginBottom: 18,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 800,
};

const mutedStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 13,
};

const labelStyle: CSSProperties = {
  color: "#475569",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 10px",
  color: "#0f172a",
  background: "#fff",
  fontSize: 13,
};

const compactSelectStyle: CSSProperties = {
  ...inputStyle,
  width: 150,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 10,
  background: "#0f172a",
  color: "#fff",
  fontWeight: 800,
  padding: "10px 16px",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  background: "#fff",
  color: "#334155",
  fontWeight: 800,
  padding: "9px 12px",
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  borderColor: "#fecaca",
  color: "#991b1b",
};

const emptyStyle: CSSProperties = {
  padding: 36,
  textAlign: "center",
  color: "#94a3b8",
  background: "#f8fafc",
  borderRadius: 12,
};

function pillStyle(background: string, color: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 9px",
    background,
    color,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
}

function alertStyle(background: string, border: string, color: string): CSSProperties {
  return {
    background,
    border: `1px solid ${border}`,
    color,
    borderRadius: 12,
    padding: "12px 14px",
    marginBottom: 16,
    fontSize: 13,
    fontWeight: 700,
  };
}
