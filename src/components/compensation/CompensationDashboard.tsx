"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import StatusChip from "@/components/ui/StatusChip";
import MetricCard from "@/components/ui/MetricCard";
import SlideOverPanel from "@/components/ui/SlideOverPanel";
import AdminPageShell from "@/components/admin/AdminPageShell";
import PersonaProfilePanel from "@/components/admin/PersonaProfilePanel";
import OperatorsPanel from "@/components/admin/OperatorsPanel";
import CompensationPlanPicker from "@/components/admin/CompensationPlanPicker";

/**
 * Resolves the parent organization for a referrer via its linked user → actor,
 * then mounts an OperatorsPanel for the org. Renders nothing when no parent
 * entity has been resolved yet (free-text orgs awaiting backfill).
 */
function ReferrerOrgOperators({ userId }: { userId: string }) {
  const [parentEntityId, setParentEntityId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    type ActorLookup = {
      ok: boolean;
      actor?: { assignments?: Array<{ parentEntityId: string | null }> } | null;
    };
    fetch(`/api/v1/admin/users/${userId}/referral-actor`)
      .then(r => r.json() as Promise<ActorLookup>)
      .then(d => {
        if (cancelled) return;
        const id = d.actor?.assignments?.find(a => a.parentEntityId)?.parentEntityId ?? null;
        setParentEntityId(id);
        setResolved(true);
      })
      .catch(() => setResolved(true));
    return () => { cancelled = true; };
  }, [userId]);
  if (!resolved) return null;
  if (!parentEntityId) return null;
  return (
    <OperatorsPanel
      title="Operators rolling up to this organization"
      compact
      allowAddOperator
      container={{ kind: "entity", parentEntityId }}
    />
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

type CompensationPlan = {
  id: string;
  name: string;
  appliesToType: string;
  modelType: string;
  commissionPercent: number | null;
  hourlyRateCents: number | null;
  fixedSalaryCents: number | null;
  flatPerPartyCents: number | null;
  flatPerCoverCents: number | null;
  notes: string | null;
  isActive: boolean;
  _count: { referrers: number };
};

type ParentEntityRef = { id: string; displayName: string; type: string };
type Referrer = {
  id: string;
  fullName: string;
  referrerType: string;
  organizationName?: string | null;
  isActive: boolean;
  userId?: string | null;
  user?: { id: string; name?: string | null; email?: string | null } | null;
  compensationPlan?: { id: string; name: string; modelType: string } | null;
  commissions: Array<{ id?: string; amountCents: number; status: string }>;
  attributions: Array<{ conversionStage: string; coversAttributed?: number | null }>;
  // ReferralActor v2 augmentation (server-attached)
  referralActorId?: string | null;
  parentEntity?: ParentEntityRef | null;
};

type ActorAssignmentDto = {
  id: string;
  scopeType: "GLOBAL" | "SERIES" | "CAMPAIGN" | "VENUE";
  scopeId: string | null;
  parentEntityId: string | null;
  parentEntityType: string | null;
  isActive: boolean;
  compensationMode: string;
  rateBps: number | null;
  flatAmountCents: number | null;
};
type ActorRecentCommission = { id: string; amountCents: number; status: string; createdAt: string };
type ActorDashboardDto = {
  ok: true;
  actor: { id: string; displayName: string; assignments?: number };
  assignments: ActorAssignmentDto[];
  commissionStats: { pendingCents: number; approvedCents: number; paidCents: number; totalCents: number; entryCount: number };
  attributionStats: { total: number; arrived: number; seated: number; completed: number };
  recentCommissions: ActorRecentCommission[];
};

type CommissionEntry = {
  id: string;
  amountCents: number;
  status: string;
  covers?: number | null;
  conceptKey?: string | null;
  createdAt: string;
  referrer?: { fullName: string; referrerType: string } | null;
  reservation?: { partySize: number; conceptRequested?: string | null } | null;
};

type CommissionSuggestion = {
  id: string;
  suggestedAmountCents: number;
  status: string;
  createdAt: string;
  referrer?: { fullName: string; referrerType: string } | null;
  reservation?: { partySize: number; conceptRequested?: string | null } | null;
};

type Props = {
  data: {
    entries: CommissionEntry[];
    suggestions: CommissionSuggestion[];
    referrers: Referrer[];
    plans: CompensationPlan[];
    totalPending: number;
    totalApproved: number;
    totalPaid: number;
  };
};

// ── Constants ──────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Built-in fallback labels — used only when the operator-type catalog has
// not loaded yet, or when a referrer's type predates the catalog. The
// dashboard merges these with `ReferralActorTypeDef` rows fetched at mount
// (see `useOperatorTypeLabels`) so admin-defined custom types render with
// their custom labels everywhere instead of showing as "Other".
const BUILTIN_REFERRER_TYPE_LABELS: Record<string, string> = {
  STREETSIDE_HOST: "Streetside Host",
  TAXI_DRIVER: "Taxi Driver",
  HOTEL_CONCIERGE: "Concierge",
  TOUR_GUIDE: "Tour Guide",
  PARTNER: "Partner",
  INFLUENCER: "Influencer",
  STAFF: "Staff",
  CUSTOM: "Custom",
};

function useOperatorTypeLabels(): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>(BUILTIN_REFERRER_TYPE_LABELS);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/operator-types?includeInactive=1")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not authorized"))))
      .then((d: { types?: Array<{ code: string; label: string; legacyEnumValue?: string }> }) => {
        if (cancelled || !d.types) return;
        const merged: Record<string, string> = { ...BUILTIN_REFERRER_TYPE_LABELS };
        for (const t of d.types) {
          // Index by both the catalog code (canonical) and the legacy enum
          // value, so call sites that still pass `referrerType` (an enum
          // string) get a sensible label too.
          merged[t.code] = t.label;
          if (t.legacyEnumValue && !merged[t.legacyEnumValue]) merged[t.legacyEnumValue] = t.label;
        }
        setLabels(merged);
      })
      .catch(() => { /* keep builtins */ });
    return () => { cancelled = true; };
  }, []);
  return labels;
}

const MODEL_TYPE_LABELS: Record<string, string> = {
  COMMISSION_ONLY: "Commission Only",
  COMMISSION_PLUS_HOURLY: "Commission + Hourly",
  HOURLY_ONLY: "Hourly Only",
  FIXED_SALARY: "Fixed Salary",
  FIXED_SALARY_PLUS_COMMISSION: "Salary + Commission",
  FLAT_PER_SEATED_PARTY: "Flat / Seated Party",
  FLAT_PER_SEATED_COVER: "Flat / Seated Cover",
  CUSTOM: "Custom",
};

const MODEL_TYPES = Object.keys(MODEL_TYPE_LABELS);
// Plan-form picker uses the static built-in list — admins create plans
// against the legacy enum buckets, not custom catalog codes (each custom
// type already maps onto an enum bucket via legacyEnumValue, so a plan
// targeted at e.g. PARTNER still applies to "Yacht Captain" actors).
const REFERRER_TYPE_LABELS = BUILTIN_REFERRER_TYPE_LABELS;
const APPLIES_TO_TYPES = Object.keys(REFERRER_TYPE_LABELS);

const hasCommission = (m: string) => ["COMMISSION_ONLY","COMMISSION_PLUS_HOURLY","FIXED_SALARY_PLUS_COMMISSION"].includes(m);
const hasHourly     = (m: string) => ["HOURLY_ONLY","COMMISSION_PLUS_HOURLY"].includes(m);
const hasSalary     = (m: string) => ["FIXED_SALARY","FIXED_SALARY_PLUS_COMMISSION"].includes(m);
const hasParty      = (m: string) => m === "FLAT_PER_SEATED_PARTY";
const hasCover      = (m: string) => m === "FLAT_PER_SEATED_COVER";

// ── Referrer Row ───────────────────────────────────────────────────────────────

// ── Grouped Referrers (parent entity collapsibles) ─────────────────────────

type ReferrerGroup = {
  key: string;
  parent: ParentEntityRef | null;
  rows: Referrer[];
  totals: { initiated: number; patronized: number; covers: number; paidCents: number; pendingCents: number };
};

function buildReferrerGroups(rows: Referrer[]): ReferrerGroup[] {
  const buckets = new Map<string, ReferrerGroup>();
  for (const r of rows) {
    const key = r.parentEntity?.id ?? "__unaffiliated__";
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        parent: r.parentEntity ?? null,
        rows: [],
        totals: { initiated: 0, patronized: 0, covers: 0, paidCents: 0, pendingCents: 0 },
      });
    }
    const g = buckets.get(key)!;
    g.rows.push(r);
    const initiated = r.attributions.length;
    const patronized = r.attributions.filter(a => a.conversionStage === "PATRONIZED").length;
    const covers = r.attributions
      .filter(a => a.conversionStage === "PATRONIZED")
      .reduce((s, a) => s + (a.coversAttributed ?? 0), 0);
    const paid = r.commissions.filter(c => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0);
    const pending = r.commissions.filter(c => c.status === "PENDING").reduce((s, c) => s + c.amountCents, 0);
    g.totals.initiated += initiated;
    g.totals.patronized += patronized;
    g.totals.covers += covers;
    g.totals.paidCents += paid;
    g.totals.pendingCents += pending;
  }
  // Sort: named parents alphabetically, unaffiliated last.
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.key === "__unaffiliated__") return 1;
    if (b.key === "__unaffiliated__") return -1;
    return (a.parent?.displayName ?? "").localeCompare(b.parent?.displayName ?? "");
  });
}

type UnresolvedOrgRow = {
  actorId: string;
  actorDisplayName: string;
  organizationName: string;
  assignmentIds: string[];
};

function UnresolvedOrganizationsPanel() {
  const [items, setItems] = useState<UnresolvedOrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/v1/admin/referrals/unresolved-organizations").then(x => x.json());
        if (!cancelled && r?.ok) setItems(r.items ?? []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <div style={{
      background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12,
      padding: "14px 18px", marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>
          Unresolved organizations ({items.length})
        </div>
        <span style={{ fontSize: 11, color: "#92400e" }}>
          Operators name a company that does not match any Entity. Resolve to enable parent-entity rollups.
        </span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
        {items.slice(0, 8).map(it => (
          <li key={it.actorId} style={{ fontSize: 12, color: "#1a1614", display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span><strong>{it.actorDisplayName}</strong> → unmatched org “{it.organizationName}”</span>
            <span style={{ color: "#92400e" }}>{it.assignmentIds.length} assignment{it.assignmentIds.length === 1 ? "" : "s"}</span>
          </li>
        ))}
        {items.length > 8 && (
          <li style={{ fontSize: 11, color: "#92400e" }}>+ {items.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}

function GroupedReferrerRows({ referrers, onSelect, typeLabels }: { referrers: Referrer[]; onSelect: (r: Referrer) => void; typeLabels: Record<string, string> }) {
  const groups = buildReferrerGroups(referrers);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map(g => [g.key, true]))
  );
  return (
    <>
      {groups.map(g => {
        const isOpen = open[g.key] !== false;
        const conv = g.totals.initiated > 0 ? Math.round((g.totals.patronized / g.totals.initiated) * 100) : 0;
        return (
          <React.Fragment key={g.key}>
            <tr
              style={{ background: "#f3ede6", borderBottom: "1px solid #e8e2dd", cursor: "pointer" }}
              onClick={() => setOpen(s => ({ ...s, [g.key]: !isOpen }))}
            >
              <td colSpan={2} style={{ padding: "10px 16px", fontSize: 12, fontWeight: 700, color: "#1a1614", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <span style={{ display: "inline-block", width: 14 }}>{isOpen ? "▾" : "▸"}</span>
                {g.parent ? `${g.parent.displayName}` : "Unaffiliated operators"}
                <span style={{ marginLeft: 8, fontSize: 11, color: "#7d7269", fontWeight: 500 }}>
                  · {g.rows.length} operator{g.rows.length === 1 ? "" : "s"}
                </span>
              </td>
              <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 12, fontWeight: 700 }}>{g.totals.initiated}</td>
              <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 12, fontWeight: 700 }}>{g.totals.patronized}</td>
              <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 12, fontWeight: 700 }}>{conv}%</td>
              <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 12, fontWeight: 700 }}>{fmt(g.totals.paidCents)}</td>
              <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 12, fontWeight: 700 }}>{fmt(g.totals.pendingCents)}</td>
              <td />
            </tr>
            {isOpen && g.rows.map(r => (
              <ReferrerRow key={r.id} r={r} onSelect={() => onSelect(r)} typeLabels={typeLabels} />
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
}

function ReferrerRow({ r, onSelect, typeLabels }: { r: Referrer; onSelect: () => void; typeLabels: Record<string, string> }) {
  const patronized = r.attributions.filter(a => a.conversionStage === "PATRONIZED").length;
  const initiated = r.attributions.length;
  const conv = initiated > 0 ? Math.round((patronized / initiated) * 100) : 0;
  const totalEarned = r.commissions.filter(c => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0);
  const pendingEarned = r.commissions.filter(c => c.status === "PENDING").reduce((s, c) => s + c.amountCents, 0);

  return (
    <tr style={{ borderBottom: "1px solid #f0ebe7", cursor: "pointer" }} onClick={onSelect}>
      <td style={{ padding: "13px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{r.fullName}</div>
        {r.organizationName && <div style={{ fontSize: 11, color: "#7d7269" }}>{r.organizationName}</div>}
      </td>
      <td style={{ padding: "13px 16px" }}>
        <span style={{ padding: "3px 10px", borderRadius: 20, background: "#faf8f6", border: "1px solid #e8e2dd", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {typeLabels[r.referrerType] ?? r.referrerType.replace(/_/g," ")}
        </span>
      </td>
      <td style={{ padding: "13px 16px", textAlign: "center" }}>{initiated}</td>
      <td style={{ padding: "13px 16px", textAlign: "center" }}>{patronized}</td>
      <td style={{ padding: "13px 16px", textAlign: "center" }}>
        <span style={{ color: conv >= 50 ? "#1f8a55" : conv >= 25 ? "#92700a" : "#c41e3a", fontWeight: 700 }}>{conv}%</span>
      </td>
      <td style={{ padding: "13px 16px", textAlign: "right", fontWeight: 700 }}>{fmt(totalEarned)}</td>
      <td style={{ padding: "13px 16px", textAlign: "right", color: "#92700a" }}>{fmt(pendingEarned)}</td>
      <td style={{ padding: "13px 16px", textAlign: "center" }}>
        <StatusChip status={r.isActive ? "active" : "cancelled"} label={r.isActive ? "Active" : "Inactive"} size="xs" />
      </td>
    </tr>
  );
}

// ── Plan Form ──────────────────────────────────────────────────────────────────

type PlanFormData = {
  name: string;
  appliesToType: string;
  modelType: string;
  commissionPercent: string;
  hourlyRateCents: string;
  fixedSalaryCents: string;
  flatPerPartyCents: string;
  flatPerCoverCents: string;
  notes: string;
  isActive: boolean;
};

const emptyForm = (): PlanFormData => ({
  name: "", appliesToType: "STREETSIDE_HOST", modelType: "COMMISSION_ONLY",
  commissionPercent: "", hourlyRateCents: "", fixedSalaryCents: "",
  flatPerPartyCents: "", flatPerCoverCents: "", notes: "", isActive: true,
});

function planToForm(p: CompensationPlan): PlanFormData {
  return {
    name: p.name,
    appliesToType: p.appliesToType,
    modelType: p.modelType,
    commissionPercent: p.commissionPercent != null ? String(p.commissionPercent) : "",
    hourlyRateCents:   p.hourlyRateCents   != null ? String(p.hourlyRateCents / 100) : "",
    fixedSalaryCents:  p.fixedSalaryCents  != null ? String(p.fixedSalaryCents / 100) : "",
    flatPerPartyCents: p.flatPerPartyCents != null ? String(p.flatPerPartyCents / 100) : "",
    flatPerCoverCents: p.flatPerCoverCents != null ? String(p.flatPerCoverCents / 100) : "",
    notes: p.notes ?? "",
    isActive: p.isActive,
  };
}

function formToPayload(f: PlanFormData) {
  const toCents = (v: string) => v ? Math.round(parseFloat(v) * 100) : null;
  return {
    name: f.name,
    appliesToType: f.appliesToType,
    modelType: f.modelType,
    commissionPercent: hasCommission(f.modelType) && f.commissionPercent ? parseFloat(f.commissionPercent) : null,
    hourlyRateCents:   hasHourly(f.modelType)  ? toCents(f.hourlyRateCents)   : null,
    fixedSalaryCents:  hasSalary(f.modelType)  ? toCents(f.fixedSalaryCents)  : null,
    flatPerPartyCents: hasParty(f.modelType)   ? toCents(f.flatPerPartyCents) : null,
    flatPerCoverCents: hasCover(f.modelType)   ? toCents(f.flatPerCoverCents) : null,
    notes: f.notes || null,
    isActive: f.isActive,
  };
}

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid #e0d9d3",
  borderRadius: 8, fontSize: 14, background: "#fff", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.07em", color: "#7d7269", marginBottom: 5,
};
const rowStyle: React.CSSProperties = { marginBottom: 16 };

function PlanFormModal({
  plan, onClose, onSaved,
}: {
  plan: CompensationPlan | null;
  onClose: () => void;
  onSaved: (updated: CompensationPlan) => void;
}) {
  const [form, setForm] = useState<PlanFormData>(plan ? planToForm(plan) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof PlanFormData, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const url  = plan ? `/api/v1/admin/compensation/plans/${plan.id}` : "/api/v1/admin/compensation/plans";
      const method = plan ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to save");
      onSaved({ ...json.data, _count: plan?._count ?? { referrers: 0 } });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const mt = form.modelType;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "90vh", overflow: "auto", padding: "28px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22 }}>
            {plan ? "Edit Plan" : "New Compensation Plan"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#7d7269" }}>×</button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={rowStyle}>
          <label style={labelStyle}>Plan Name *</label>
          <input style={fieldStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Streetside Standard 10%" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Applies To *</label>
            <select style={fieldStyle} value={form.appliesToType} onChange={e => set("appliesToType", e.target.value)}>
              {APPLIES_TO_TYPES.map(t => <option key={t} value={t}>{REFERRER_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Model Type *</label>
            <select style={fieldStyle} value={form.modelType} onChange={e => set("modelType", e.target.value)}>
              {MODEL_TYPES.map(t => <option key={t} value={t}>{MODEL_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
        </div>

        {hasCommission(mt) && (
          <div style={rowStyle}>
            <label style={labelStyle}>Commission % (e.g. 10 for 10%)</label>
            <input style={fieldStyle} type="number" min="0" max="100" step="0.01" value={form.commissionPercent} onChange={e => set("commissionPercent", e.target.value)} placeholder="10.00" />
          </div>
        )}

        {hasHourly(mt) && (
          <div style={rowStyle}>
            <label style={labelStyle}>Hourly Rate (USD)</label>
            <input style={fieldStyle} type="number" min="0" step="0.01" value={form.hourlyRateCents} onChange={e => set("hourlyRateCents", e.target.value)} placeholder="15.00" />
          </div>
        )}

        {hasSalary(mt) && (
          <div style={rowStyle}>
            <label style={labelStyle}>Fixed Monthly Salary (USD)</label>
            <input style={fieldStyle} type="number" min="0" step="0.01" value={form.fixedSalaryCents} onChange={e => set("fixedSalaryCents", e.target.value)} placeholder="2000.00" />
          </div>
        )}

        {hasParty(mt) && (
          <div style={rowStyle}>
            <label style={labelStyle}>Flat Amount per Seated Party (USD)</label>
            <input style={fieldStyle} type="number" min="0" step="0.01" value={form.flatPerPartyCents} onChange={e => set("flatPerPartyCents", e.target.value)} placeholder="25.00" />
          </div>
        )}

        {hasCover(mt) && (
          <div style={rowStyle}>
            <label style={labelStyle}>Flat Amount per Seated Cover (USD)</label>
            <input style={fieldStyle} type="number" min="0" step="0.01" value={form.flatPerCoverCents} onChange={e => set("flatPerCoverCents", e.target.value)} placeholder="8.00" />
          </div>
        )}

        <div style={rowStyle}>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Internal notes about this plan…" />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <input type="checkbox" id="planActive" checked={form.isActive} onChange={e => set("isActive", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
          <label htmlFor="planActive" style={{ fontSize: 14, cursor: "pointer" }}>Plan is active</label>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", background: "#faf8f6", border: "1px solid #e8e2dd", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "10px 24px", background: "#1a1614", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
            {saving ? "Saving…" : plan ? "Save Changes" : "Create Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Plan Row ───────────────────────────────────────────────────────────────────

function formatPlanRate(p: CompensationPlan): string {
  const parts: string[] = [];
  if (p.commissionPercent != null) parts.push(`${p.commissionPercent}% commission`);
  if (p.hourlyRateCents   != null) parts.push(`${fmt(p.hourlyRateCents)}/hr`);
  if (p.fixedSalaryCents  != null) parts.push(`${fmt(p.fixedSalaryCents)}/mo salary`);
  if (p.flatPerPartyCents != null) parts.push(`${fmt(p.flatPerPartyCents)}/party`);
  if (p.flatPerCoverCents != null) parts.push(`${fmt(p.flatPerCoverCents)}/cover`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function PlanRow({ plan, onEdit, onDelete, onToggle }: {
  plan: CompensationPlan;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <tr style={{ borderBottom: "1px solid #f0ebe7" }}>
      <td style={{ padding: "13px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          {plan.name}
          {!plan.isActive && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#f5f5f5", color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Inactive</span>}
        </div>
        {plan.notes && <div style={{ fontSize: 11, color: "#7d7269", marginTop: 2 }}>{plan.notes}</div>}
      </td>
      <td style={{ padding: "13px 16px" }}>
        <span style={{ padding: "3px 10px", borderRadius: 20, background: "#faf8f6", border: "1px solid #e8e2dd", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {REFERRER_TYPE_LABELS[plan.appliesToType] ?? plan.appliesToType.replace(/_/g," ")}
        </span>
      </td>
      <td style={{ padding: "13px 16px", fontSize: 13, color: "#4a403a" }}>
        {MODEL_TYPE_LABELS[plan.modelType] ?? plan.modelType.replace(/_/g," ")}
      </td>
      <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600 }}>
        {formatPlanRate(plan)}
      </td>
      <td style={{ padding: "13px 16px", textAlign: "center", fontWeight: 700, color: plan._count.referrers > 0 ? "#1a1614" : "#ccc" }}>
        {plan._count.referrers}
      </td>
      <td style={{ padding: "13px 16px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onEdit} style={{ padding: "5px 12px", background: "#faf8f6", border: "1px solid #e8e2dd", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Edit</button>
          <button onClick={onToggle} style={{ padding: "5px 12px", background: plan.isActive ? "#fff7ed" : "#f0fdf4", border: `1px solid ${plan.isActive ? "#fed7aa" : "#bbf7d0"}`, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, color: plan.isActive ? "#c2410c" : "#166534" }}>
            {plan.isActive ? "Deactivate" : "Activate"}
          </button>
          <button onClick={onDelete} disabled={plan._count.referrers > 0} title={plan._count.referrers > 0 ? "Reassign referrers before deleting" : undefined} style={{ padding: "5px 12px", background: plan._count.referrers > 0 ? "#f9f9f9" : "#fef2f2", border: `1px solid ${plan._count.referrers > 0 ? "#e5e7eb" : "#fecaca"}`, borderRadius: 6, cursor: plan._count.referrers > 0 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, color: plan._count.referrers > 0 ? "#d1d5db" : "#991b1b", opacity: plan._count.referrers > 0 ? 0.6 : 1 }}>
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Plans Tab ──────────────────────────────────────────────────────────────────

function PlansTab({ initialPlans }: { initialPlans: CompensationPlan[] }) {
  const [plans, setPlans] = useState<CompensationPlan[]>(initialPlans);
  const [modal, setModal] = useState<"new" | CompensationPlan | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSaved = useCallback((updated: CompensationPlan) => {
    setPlans(prev => {
      const exists = prev.find(p => p.id === updated.id);
      return exists
        ? prev.map(p => p.id === updated.id ? updated : p)
        : [...prev, updated];
    });
    setModal(null);
  }, []);

  const handleToggle = useCallback(async (plan: CompensationPlan) => {
    const res = await fetch(`/api/v1/admin/compensation/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !plan.isActive }),
    });
    const json = await res.json();
    if (json.ok) setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, isActive: !plan.isActive } : p));
  }, []);

  const handleDelete = useCallback(async (plan: CompensationPlan) => {
    setDeleteError(null);
    if (!confirm(`Delete "${plan.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/v1/admin/compensation/plans/${plan.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      setPlans(prev => prev.filter(p => p.id !== plan.id));
    } else {
      setDeleteError(json.error ?? "Could not delete plan.");
    }
  }, []);

  return (
    <div>
      {deleteError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#991b1b", fontSize: 13 }}>
          {deleteError}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#7d7269" }}>{plans.length} plan{plans.length !== 1 ? "s" : ""} configured</div>
        <button
          onClick={() => setModal("new")}
          style={{ padding: "9px 18px", background: "#1a1614", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
        >
          + New Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "#7d7269", background: "#fff", borderRadius: 12, border: "1px solid #e8e2dd" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No compensation plans yet</div>
          <div style={{ fontSize: 13 }}>Create your first plan to start assigning it to referrers.</div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e2dd", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#faf8f6", borderBottom: "2px solid #e8e2dd" }}>
                {["Plan", "Applies To", "Model", "Rate Structure", "Referrers", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: h === "Referrers" ? "center" : "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#7d7269" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <PlanRow
                  key={p.id}
                  plan={p}
                  onEdit={() => setModal(p)}
                  onToggle={() => handleToggle(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <PlanFormModal
          plan={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function CompensationDashboard({ data }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"referrers" | "entries" | "suggestions" | "plans">("referrers");
  const [selected, setSelected] = useState<Referrer | null>(null);

  // Deep-link support (Task #59): when arriving with `?referrerId=<id>`,
  // auto-open the matching referrer's slide-over so the operator lands
  // directly on the record they clicked from a Profile drawer.
  // The effect runs once per `referrerId` value to avoid re-opening after
  // the user manually closes the panel.
  const deepLinkReferrerId = searchParams?.get("referrerId") ?? null;
  useEffect(() => {
    if (!deepLinkReferrerId) return;
    const match = data.referrers.find((r) => r.id === deepLinkReferrerId);
    if (match) {
      setTab("referrers");
      setSelected(match);
    }
    // Strip the param so a manual close doesn't bounce back open on refresh
    // and so we don't keep re-applying it.
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("referrerId");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkReferrerId]);
  // Pull the operator-type catalog so custom admin-defined types render
  // with their custom labels (e.g. "Yacht Captain") instead of the legacy
  // enum bucket they map to (usually "OTHER").
  const typeLabels = useOperatorTypeLabels();
  // ReferralActor v2 dashboard for the selected referrer's user. When present,
  // we lead the slide-over with actor data and treat the legacy Referrer row
  // as fallback only.
  const [actorDash, setActorDash] = useState<ActorDashboardDto | null>(null);

  useEffect(() => {
    setActorDash(null);
    if (!selected) return;
    let cancelled = false;
    (async () => {
      try {
        // Prefer resolution by legacy Referrer.id — referrers without a linked
        // user still have an actor row keyed via legacyReferrerId.
        let actorId: string | null = null;
        const byRef = await fetch(`/api/v1/admin/referrers/${selected.id}/referral-actor`).then(x => x.json()).catch(() => null);
        if (byRef?.ok && byRef.actor?.id) actorId = byRef.actor.id;

        // Fallback: resolve via the user link (kept for backwards compat).
        if (!actorId) {
          const uid = selected.userId ?? selected.user?.id;
          if (uid) {
            const byUser = await fetch(`/api/v1/admin/users/${uid}/referral-actor`).then(x => x.json()).catch(() => null);
            if (byUser?.ok && byUser.actor?.id) actorId = byUser.actor.id;
          }
        }

        if (!actorId || cancelled) return;
        // Use the same range preset as the page-level summary so the drawer
        // metrics stay consistent with the table totals.
        const d = await fetch(`/api/v1/referral-actors/${actorId}/dashboard?preset=last_30_days`).then(x => x.json());
        if (!cancelled && d.ok) setActorDash(d);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const referrerDetail = selected ? (() => {
    const attrs = selected.attributions;
    const patronized = attrs.filter(a => a.conversionStage === "PATRONIZED").length;
    const initiated = attrs.length;
    const covers = attrs.filter(a => a.conversionStage === "PATRONIZED").reduce((s, a) => s + (a.coversAttributed ?? 0), 0);
    const conv = initiated > 0 ? Math.round((patronized / initiated) * 100) : 0;
    const totalPaid = selected.commissions.filter(c => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0);
    const totalPending = selected.commissions.filter(c => c.status === "PENDING").reduce((s, c) => s + c.amountCents, 0);
    return { patronized, initiated, covers, conv, totalPaid, totalPending };
  })() : null;

  const heroSlab = (
    <div className="admin-hero-card" style={{ background: "#1a1614", color: "#fff" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>Admin · Compensation</div>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 300, margin: "0 0 20px" }}>Referrer Compensation</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Pending Payout</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#f59e0b", marginTop: 4 }}>{fmt(data.totalPending)}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Approved</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#34d399", marginTop: 4 }}>{fmt(data.totalApproved)}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Paid Out</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", marginTop: 4 }}>{fmt(data.totalPaid)}</div>
          </div>
        </div>

        {/* Nav Tiles — inside dark header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {([
          { key: "referrers",   label: "Referrers",         count: data.referrers.length,   icon: "⬡", accent: "#60a5fa" },
          { key: "entries",     label: "Commission Entries", count: data.entries.length,     icon: "◈", accent: "#34d399" },
          { key: "suggestions", label: "Pending Review",     count: data.suggestions.length, icon: "◎", accent: "#f59e0b" },
          { key: "plans",       label: "Plans",              count: data.plans.length,       icon: "⬢", accent: "#a78bfa" },
        ] as const).map(({ key, label, count, icon, accent }) => {
          const isActive = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                position: "relative",
                padding: "20px 20px 18px",
                background: isActive
                  ? `linear-gradient(135deg, ${accent}22 0%, ${accent}08 100%)`
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive ? accent : "rgba(255,255,255,0.1)"}`,
                borderRadius: 16,
                cursor: "pointer",
                textAlign: "left",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                boxShadow: isActive
                  ? `0 0 24px ${accent}30, 0 1px 0 rgba(255,255,255,0.08) inset`
                  : "0 1px 0 rgba(255,255,255,0.05) inset",
                transition: "all 0.2s ease",
                overflow: "hidden",
              }}
            >
              {isActive && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: `radial-gradient(ellipse at top left, ${accent}18 0%, transparent 70%)`,
                  pointerEvents: "none",
                }} />
              )}
              <div style={{ position: "absolute", top: 16, right: 16, fontSize: 20, opacity: isActive ? 0.8 : 0.2, color: isActive ? accent : "#fff", transition: "all 0.2s" }}>
                {icon}
              </div>
              <div style={{
                fontFamily: "var(--font-heading)",
                fontSize: 38,
                fontWeight: 700,
                lineHeight: 1,
                color: isActive ? accent : "rgba(255,255,255,0.85)",
                marginBottom: 8,
                transition: "color 0.2s",
              }}>
                {count}
              </div>
              <div style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: isActive ? accent : "rgba(255,255,255,0.35)",
                transition: "color 0.2s",
              }}>
                {label}
              </div>
              {isActive && (
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
                  background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                  borderRadius: "0 0 16px 16px",
                }} />
              )}
            </button>
          );
        })}
        </div>
    </div>
  );

  return (
    <AdminPageShell hero={heroSlab}>
      <div>
        {/* Referrers Table */}
        {tab === "referrers" && (
          <>
          <UnresolvedOrganizationsPanel />
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e2dd", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#faf8f6", borderBottom: "2px solid #e8e2dd" }}>
                  {["Referrer", "Type", "Initiated", "Patronized", "Conv.", "Paid Out", "Pending", "Status"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: h === "Referrer" || h === "Type" ? "left" : "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#7d7269" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <GroupedReferrerRows
                  referrers={data.referrers}
                  onSelect={(r) => setSelected(r)}
                  typeLabels={typeLabels}
                />
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* Commission Entries */}
        {tab === "entries" && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e2dd", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#faf8f6", borderBottom: "2px solid #e8e2dd" }}>
                  {["Referrer", "Amount", "Covers", "Concept", "Status", "Date"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#7d7269" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.entries.map(e => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #f0ebe7" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: 14 }}>{e.referrer?.fullName ?? "—"}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 700, color: "#1f8a55" }}>{fmt(e.amountCents)}</td>
                    <td style={{ padding: "12px 16px" }}>{e.covers ?? "—"}</td>
                    <td style={{ padding: "12px 16px", textTransform: "capitalize" }}>{e.conceptKey ?? e.reservation?.conceptRequested ?? "—"}</td>
                    <td style={{ padding: "12px 16px" }}><StatusChip status={e.status.toLowerCase()} size="xs" /></td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#7d7269" }}>{new Date(e.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Suggestions */}
        {tab === "suggestions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.suggestions.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px", color: "#7d7269" }}>No pending commission suggestions.</div>
            )}
            {data.suggestions.map(s => (
              <div key={s.id} style={{ background: "#fff", border: "1px solid #e8e2dd", borderRadius: 12, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{s.referrer?.fullName ?? "Unknown Referrer"}</div>
                  <div style={{ fontSize: 12, color: "#7d7269" }}>{s.reservation?.partySize} guests · {s.reservation?.conceptRequested} · {new Date(s.createdAt).toLocaleDateString()}</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#1f8a55" }}>{fmt(s.suggestedAmountCents)}</span>
                  <button type="button" style={{ padding: "8px 16px", background: "#1f8a55", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Approve</button>
                  <button type="button" style={{ padding: "8px 16px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Plans */}
        {tab === "plans" && <PlansTab initialPlans={data.plans} />}
      </div>

      {/* Referrer Detail Panel */}
      <SlideOverPanel open={!!selected} onClose={() => setSelected(null)} title={selected?.fullName} width={460}>
        {selected && referrerDetail && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <StatusChip status={selected.isActive ? "active" : "cancelled"} label={selected.isActive ? "Active" : "Inactive"} />
              <span style={{ marginLeft: 8 }}>
                <StatusChip status="gray" label={typeLabels[selected.referrerType] ?? selected.referrerType} />
              </span>
            </div>
            {selected.organizationName && <p style={{ fontSize: 13, color: "#7d7269", marginBottom: 16 }}>{selected.organizationName}</p>}
            {selected.compensationPlan && (
              <div style={{ background: "#faf8f6", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7d7269", marginBottom: 4 }}>Current Plan</div>
                <div style={{ fontWeight: 600 }}>{selected.compensationPlan.name}</div>
                <div style={{ fontSize: 12, color: "#7d7269" }}>{selected.compensationPlan.modelType.replace(/_/g," ")}</div>
              </div>
            )}
            <CompensationPlanPicker
              userId={selected.userId ?? selected.user?.id ?? null}
              currentPlanId={selected.compensationPlan?.id ?? null}
              currentPlanName={selected.compensationPlan?.name ?? null}
              plans={data.plans as any}
              onSaved={(newPlanId) => {
                const newPlan = newPlanId ? (data.plans.find((p: any) => p.id === newPlanId) ?? null) : null;
                setSelected((prev) => prev ? { ...prev, compensationPlan: newPlan as any } : prev);
                router.refresh();
              }}
            />
            {/* Source-of-truth banner */}
            <div style={{
              fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 6, marginBottom: 14,
              background: actorDash ? "#ecfdf5" : "#fef3c7",
              color: actorDash ? "#065f46" : "#92400e",
              border: `1px solid ${actorDash ? "#a7f3d0" : "#fde68a"}`,
            }}>
              {actorDash
                ? `● ReferralActor v2 (primary) — ${actorDash.assignments?.length ?? 0} assignment${(actorDash.assignments?.length ?? 0) === 1 ? "" : "s"}`
                : "○ Legacy Referrer fallback — actor not yet provisioned"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {actorDash ? (
                <>
                  <MetricCard label="Initiated"   value={actorDash.attributionStats.total} />
                  <MetricCard label="Patronized"  value={actorDash.attributionStats.completed} />
                  <MetricCard label="Conversion"  value={`${actorDash.attributionStats.total > 0 ? Math.round((actorDash.attributionStats.completed / actorDash.attributionStats.total) * 100) : 0}%`} />
                  <MetricCard label="Entries"     value={actorDash.commissionStats.entryCount} />
                  <MetricCard label="Paid Out"    value={fmt(actorDash.commissionStats.paidCents)} accent />
                  <MetricCard label="Pending"     value={fmt(actorDash.commissionStats.pendingCents)} />
                </>
              ) : (
                <>
                  <MetricCard label="Initiated"   value={referrerDetail.initiated} />
                  <MetricCard label="Patronized"  value={referrerDetail.patronized} />
                  <MetricCard label="Conversion"  value={`${referrerDetail.conv}%`} />
                  <MetricCard label="Covers"      value={referrerDetail.covers} />
                  <MetricCard label="Paid Out"    value={fmt(referrerDetail.totalPaid)} accent />
                  <MetricCard label="Pending"     value={fmt(referrerDetail.totalPending)} />
                </>
              )}
            </div>

            {actorDash && actorDash.assignments.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7d7269", marginBottom: 10 }}>Actor Assignments</div>
                <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
                  {actorDash.assignments.map((a: ActorAssignmentDto) => (
                    <div key={a.id} style={{ background: "#faf8f6", border: "1px solid #ece6df", borderRadius: 8, padding: "8px 12px", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                      <span><strong>{a.scopeType}</strong>{a.parentEntityId ? " · org-linked" : ""}</span>
                      <span style={{ color: "#5f5750" }}>
                        {a.compensationMode}{a.rateBps ? ` · ${(a.rateBps / 100).toFixed(2)}%` : ""}{a.flatAmountCents ? ` · ${fmt(a.flatAmountCents)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7d7269", marginBottom: 10 }}>Commission History</div>
            {((actorDash?.recentCommissions ?? selected.commissions) as Array<{ id?: string; amountCents: number; status: string }>).slice(0, 8).map((c, i) => (
              <div key={c.id ?? i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f0ebe7", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(c.amountCents)}</span>
                <StatusChip status={String(c.status).toLowerCase()} size="xs" />
              </div>
            ))}

            {/* Persona detail (shared with Profiles) */}
            <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #e8e2dd" }}>
              <PersonaProfilePanel
                userId={selected.userId ?? selected.user?.id ?? null}
                referrerId={selected.id}
                emptyMessage="This referrer profile is not connected to a platform login account, so a commercial persona cannot be linked. Create a user with the Referrer role to enable persona linking."
              />
            </div>

            {/* Org rollup via ReferralActor primitive */}
            {(selected.userId ?? selected.user?.id) && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #e8e2dd" }}>
                <ReferrerOrgOperators userId={(selected.userId ?? selected.user?.id) as string} />
              </div>
            )}
          </div>
        )}
      </SlideOverPanel>
    </AdminPageShell>
  );
}
