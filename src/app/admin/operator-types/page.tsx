"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CompMode =
  | "NONE"
  | "PERCENT_OF_TRANSACTION"
  | "PERCENT_OF_PARENT_COMMISSION"
  | "FLAT_PER_COVER"
  | "FLAT_PER_PARTY";

interface OperatorTypeDef {
  id: string;
  code: string;
  label: string;
  description: string | null;
  icon: string | null;
  isBuiltin: boolean;
  legacyEnumValue: string;
  defaultCompMode: CompMode;
  defaultRateBps: number | null;
  defaultFlatCents: number | null;
  defaultRbacRole: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

const LEGACY_ENUMS = [
  "STREETSIDE_HOST", "TAXI_DRIVER", "UBER_DRIVER", "TOUR_GUIDE",
  "HOTEL_CONCIERGE", "INFLUENCER_SUB_REFERRER", "PROMOTER",
  "PRIVATE_NETWORK", "OTHER",
] as const;

const COMP_MODES: { value: CompMode; label: string; needsRate?: boolean; needsFlat?: boolean }[] = [
  { value: "NONE",                          label: "No commission" },
  { value: "PERCENT_OF_TRANSACTION",        label: "% of transaction",        needsRate: true },
  { value: "PERCENT_OF_PARENT_COMMISSION",  label: "% of parent commission",  needsRate: true },
  { value: "FLAT_PER_COVER",                label: "Flat / cover",            needsFlat: true },
  { value: "FLAT_PER_PARTY",                label: "Flat / party",            needsFlat: true },
];

export default function OperatorTypesAdminPage() {
  const [types, setTypes] = useState<OperatorTypeDef[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OperatorTypeDef | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/operator-types?includeInactive=${showInactive ? "1" : "0"}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed");
      setTypes(data.types ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const builtin = useMemo(() => types.filter((t) => t.isBuiltin), [types]);
  const custom = useMemo(() => types.filter((t) => !t.isBuiltin), [types]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0f1015] to-[#0a0a0f] p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Operator catalog</div>
            <h1 className="mt-2 text-3xl font-light tracking-tight">Operator Types</h1>
            <p className="mt-1 text-sm text-white/50">
              Define the kinds of operators who can be onboarded via the &quot;+ Add operator&quot; flow.
              Each type carries default compensation knobs and an optional RBAC role.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-white/60">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:border-amber-300/50 hover:bg-amber-300/20"
            >
              + New type
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {loading ? (
          <div className="mt-8 text-center text-white/40">Loading…</div>
        ) : (
          <>
            <Section title="Custom types" subtitle={`${custom.length} defined`}>
              {custom.length === 0 ? (
                <EmptyState>No custom operator types yet. Click &quot;+ New type&quot; to define one.</EmptyState>
              ) : (
                <TypeTable
                  types={custom}
                  onEdit={setEditing}
                  onDelete={async (t) => {
                    if (!confirm(`Delete "${t.label}"? This cannot be undone.`)) return;
                    try {
                      const res = await fetch(`/api/v1/admin/operator-types?code=${encodeURIComponent(t.code)}`, { method: "DELETE" });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d?.error ?? "Delete failed");
                      load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Delete failed");
                    }
                  }}
                />
              )}
            </Section>
            <Section title="Built-in types" subtitle={`${builtin.length} seeded`}>
              <TypeTable types={builtin} onEdit={setEditing} />
            </Section>
          </>
        )}
      </div>

      {(creating || editing) && (
        <TypeFormModal
          editing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-light">{title}</h2>
        <span className="text-xs text-white/40">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center text-sm text-white/40">
      {children}
    </div>
  );
}

function TypeTable({ types, onEdit, onDelete }: { types: OperatorTypeDef[]; onEdit: (t: OperatorTypeDef) => void; onDelete?: (t: OperatorTypeDef) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="grid grid-cols-12 gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
        <div className="col-span-3">Label</div>
        <div className="col-span-3">Code</div>
        <div className="col-span-3">Default compensation</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-1 text-right">Actions</div>
      </div>
      <div className="divide-y divide-white/5">
        {types.map((t) => (
          <div key={t.code} className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm">
            <div className="col-span-3">
              <div className="text-white/90">{t.label}</div>
              {t.description && <div className="mt-0.5 text-xs text-white/40">{t.description}</div>}
            </div>
            <div className="col-span-3 font-mono text-xs text-white/50">{t.code}</div>
            <div className="col-span-3 text-xs text-white/60">
              {t.defaultCompMode === "NONE" && "No commission"}
              {(t.defaultCompMode === "PERCENT_OF_TRANSACTION" || t.defaultCompMode === "PERCENT_OF_PARENT_COMMISSION") && (
                <>{((t.defaultRateBps ?? 0) / 100).toFixed(2)}% — {t.defaultCompMode === "PERCENT_OF_TRANSACTION" ? "of net" : "of parent"}</>
              )}
              {(t.defaultCompMode === "FLAT_PER_COVER" || t.defaultCompMode === "FLAT_PER_PARTY") && (
                <>${((t.defaultFlatCents ?? 0) / 100).toFixed(2)} — {t.defaultCompMode === "FLAT_PER_COVER" ? "per cover" : "per party"}</>
              )}
            </div>
            <div className="col-span-2 text-xs">
              {t.isActive ? (
                <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-emerald-300">Active</span>
              ) : (
                <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-white/40">Inactive</span>
              )}
              {t.isBuiltin && (
                <span className="ml-1.5 rounded-md border border-sky-400/20 bg-sky-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-sky-300">Built-in</span>
              )}
            </div>
            <div className="col-span-1 flex items-center justify-end gap-2 text-right text-xs">
              <button onClick={() => onEdit(t)} className="text-amber-300 hover:underline">Edit</button>
              {onDelete && !t.isBuiltin && (
                <button onClick={() => onDelete(t)} className="text-red-300 hover:underline">Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeFormModal({
  editing, onClose, onSaved,
}: { editing: OperatorTypeDef | null; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(editing?.label ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [defaultCompMode, setDefaultCompMode] = useState<CompMode>(editing?.defaultCompMode ?? "PERCENT_OF_TRANSACTION");
  const [defaultRateBps, setDefaultRateBps] = useState<string>(editing?.defaultRateBps != null ? String(editing.defaultRateBps / 100) : "");
  const [defaultFlatCents, setDefaultFlatCents] = useState<string>(editing?.defaultFlatCents != null ? String(editing.defaultFlatCents / 100) : "");
  const [defaultRbacRole, setDefaultRbacRole] = useState(editing?.defaultRbacRole ?? "");
  const [sortOrder, setSortOrder] = useState<string>(String(editing?.sortOrder ?? 500));
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [icon, setIcon] = useState(editing?.icon ?? "");
  const [legacyEnumValue, setLegacyEnumValue] = useState(editing?.legacyEnumValue ?? "OTHER");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const meta = COMP_MODES.find((c) => c.value === defaultCompMode);

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        label: label.trim(),
        description: description.trim() || null,
        icon: icon.trim() || null,
        defaultCompMode,
        defaultRateBps: meta?.needsRate && defaultRateBps ? Math.round(parseFloat(defaultRateBps) * 100) : null,
        defaultFlatCents: meta?.needsFlat && defaultFlatCents ? Math.round(parseFloat(defaultFlatCents) * 100) : null,
        defaultRbacRole: defaultRbacRole.trim() || null,
        sortOrder: parseInt(sortOrder, 10) || 500,
        isActive,
      };
      if (!editing) body.legacyEnumValue = legacyEnumValue;
      let res: Response;
      if (editing) {
        body.code = editing.code;
        res = await fetch("/api/v1/admin/operator-types", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        if (code.trim()) body.code = code.trim();
        res = await fetch("/api/v1/admin/operator-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#12131a] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-light">{editing ? `Edit · ${editing.label}` : "New operator type"}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">✕</button>
        </div>

        {err && <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{err}</div>}

        <div className="mt-4 space-y-3">
          <Field label="Label *">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="e.g. Yacht Captain" />
          </Field>
          {!editing && (
            <Field label="Code (slug)" hint="Auto-derived from label if empty. Stable identifier; cannot change later.">
              <input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} placeholder="auto-generated from label" />
            </Field>
          )}
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
          </Field>
          <Field label="Icon" hint="Optional emoji or short label shown alongside the type (e.g. ⚓, 🚖).">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className={inputCls} placeholder="⚓" maxLength={64} />
          </Field>
          {!editing && (
            <Field label="Legacy enum mapping" hint="Determines which legacy enum bucket reports group this type into when grouping by ReferralActorType. Defaults to OTHER.">
              <select value={legacyEnumValue} onChange={(e) => setLegacyEnumValue(e.target.value)} className={inputCls}>
                {LEGACY_ENUMS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          )}
          <Field label="Default compensation mode">
            <select value={defaultCompMode} onChange={(e) => setDefaultCompMode(e.target.value as CompMode)} className={inputCls}>
              {COMP_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          {meta?.needsRate && (
            <Field label="Default rate (%)">
              <input value={defaultRateBps} onChange={(e) => setDefaultRateBps(e.target.value)} className={inputCls} type="number" step="0.01" />
            </Field>
          )}
          {meta?.needsFlat && (
            <Field label="Default flat amount (USD)">
              <input value={defaultFlatCents} onChange={(e) => setDefaultFlatCents(e.target.value)} className={inputCls} type="number" step="0.01" />
            </Field>
          )}
          <Field label="Default RBAC role" hint="Granted to the User created from this type. Leave blank to fall back to REFERRER.">
            <input value={defaultRbacRole} onChange={(e) => setDefaultRbacRole(e.target.value)} className={inputCls} placeholder="e.g. STREETSIDE_HOST" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sort order">
              <input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={inputCls} type="number" />
            </Field>
            <label className="mt-5 flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !label.trim()}
            className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-300/20 disabled:opacity-50"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Create type"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-amber-300/40 focus:outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-[0.15em] text-white/40">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-white/30">{hint}</div>}
    </div>
  );
}
